/**
 * proxy-server.js — Local Node.js proxy for real Binance/MEXC order signing
 *
 * Purpose:
 *   GitHub Pages cannot sign Binance orders (HMAC-SHA256 secret must never be
 *   in the browser). Run this locally to bridge NEXAI webhook signals to real
 *   exchange orders.
 *
 * Setup:
 *   1. Copy .env.example to .env and fill in your API keys
 *   2. Run: node proxy-server.js
 *   3. In NEXAI connector panel: set URL to http://localhost:3000/trade
 *   4. Set the same WEBHOOK_SECRET in .env and in NEXAI connector panel
 *
 * Security:
 *   - NEVER expose this server publicly — run on localhost only
 *   - API keys are read from .env, never hardcoded
 *   - Incoming webhooks are verified with HMAC-SHA256 signature
 *
 * Zero npm dependencies — uses only Node built-ins: http, https, crypto, fs.
 */

'use strict';

const http   = require('http');
const https  = require('https');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

// ── Load .env ─────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('[Proxy] .env file not found. Copy .env.example to .env and fill in your keys.');
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const [key, ...rest] = line.trim().split('=');
    if (key && !key.startsWith('#') && rest.length) {
      process.env[key.trim()] = rest.join('=').trim();
    }
  }
}

loadEnv();

const PORT           = parseInt(process.env.PORT, 10)           || 3000;
const BINANCE_KEY    = process.env.BINANCE_API_KEY              || '';
const BINANCE_SECRET = process.env.BINANCE_SECRET               || '';
const MEXC_KEY       = process.env.MEXC_API_KEY                 || '';
const MEXC_SECRET    = process.env.MEXC_SECRET                  || '';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET               || '';
const EXCHANGE       = (process.env.EXCHANGE || 'binance').toLowerCase();

// ── HMAC verification ─────────────────────────────────────

function verifySignature(body, sigHeader) {
  if (!WEBHOOK_SECRET) return true; // no secret configured — skip verification
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
  return sigHeader === expected;
}

// ── Order signing (Binance) ───────────────────────────────

function signBinance(params) {
  const qs  = new URLSearchParams(params).toString();
  const sig = crypto.createHmac('sha256', BINANCE_SECRET).update(qs).digest('hex');
  return `${qs}&signature=${sig}`;
}

async function placeBinanceOrder(signal) {
  const { symbol, action, size, sl, tp2 } = signal;
  const timestamp = Date.now();

  // Market order params
  const params = {
    symbol,
    side: action,              // BUY | SELL
    type: 'MARKET',
    quoteOrderQty: size.toFixed(2),
    timestamp,
  };

  const body = signBinance(params);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.binance.com',
      path:     '/api/v3/order?' + body,
      method:   'POST',
      headers: {
        'X-MBX-APIKEY': BINANCE_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (_) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── HTTP Server ───────────────────────────────────────────

const server = http.createServer((req, res) => {
  // CORS headers (for browser → localhost)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-NEXAI-Sig, X-NEXAI-Source');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (req.method === 'POST' && req.url === '/trade') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      // Verify HMAC signature from NEXAI
      const sig = req.headers['x-nexai-sig'] || '';
      if (!verifySignature(body, sig)) {
        console.warn('[Proxy] Signature verification failed — rejected');
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid signature' }));
        return;
      }

      let signal;
      try { signal = JSON.parse(body); }
      catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      console.log(`[Proxy] Signal received: ${signal.side} ${signal.symbol} @ $${signal.price} | conf=${signal.conf}% score=${signal.engineScore}`);

      // Validate required fields
      if (!signal.symbol || !signal.action || !signal.price) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields: symbol, action, price' }));
        return;
      }

      try {
        let result;
        if (EXCHANGE === 'binance') {
          result = await placeBinanceOrder(signal);
        } else {
          // MEXC — same pattern, different endpoint
          result = { status: 501, body: { error: 'MEXC order signing not yet implemented — add MEXC signing here' } };
        }

        console.log(`[Proxy] Exchange response: ${result.status}`, result.body);
        res.writeHead(result.status < 300 ? 200 : result.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.body));

      } catch (err) {
        console.error('[Proxy] Order placement error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, exchange: EXCHANGE, ts: Date.now() }));
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[Proxy] NEXAI proxy server running on http://127.0.0.1:${PORT}`);
  console.log(`[Proxy] Exchange: ${EXCHANGE.toUpperCase()} | Signature verification: ${WEBHOOK_SECRET ? 'ON' : 'OFF (no secret set)'}`);
  console.log(`[Proxy] Set NEXAI connector URL to: http://localhost:${PORT}/trade`);
  if (!BINANCE_KEY) console.warn('[Proxy] WARNING: BINANCE_API_KEY not set — orders will fail');
});

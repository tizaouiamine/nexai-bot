/**
 * connector.js — Real trade webhook connector
 *
 * Bridges NEXAI signal decisions to real execution via POST webhook.
 * GitHub Pages is static — real order signing must happen server-side.
 * This module fires a signed POST to any user-configured endpoint when
 * a signal passes all engine gates.
 *
 * Mode A — Webhook: POST to any backend, 3Commas bot, TradingView alert, or
 *   user's own proxy server (see proxy-server.js in repo root).
 *
 * Mode B — Dry Run: logs signal to console only. Default until user configures.
 *
 * HMAC signing: the payload body is signed with the user's webhook secret using
 * SubtleCrypto (Web Crypto API — no npm deps). The receiving server can verify
 * the `X-NEXAI-Sig` header to authenticate requests.
 *
 * Security:
 *   - Secret is stored in localStorage only — never logged or sent in URL
 *   - API key for Binance/MEXC is NEVER stored in this module
 *   - All real order signing happens in proxy-server.js (server-side)
 */

import { STORAGE_KEYS } from './config.js';

// ── Config object (mutable, persisted to localStorage) ────

export const connectorCfg = {
  enabled:    false,
  webhookUrl: '',
  secret:     '',
  mode:       'webhook',   // 'webhook' | 'disabled'
  dryRun:     true,        // true = log only, no actual POST
};

export function loadConnectorCfg() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.connector);
    if (raw) Object.assign(connectorCfg, JSON.parse(raw));
  } catch (_) {}
}

export function saveConnectorCfg() {
  localStorage.setItem(STORAGE_KEYS.connector, JSON.stringify(connectorCfg));
}

// ── HMAC signing (SubtleCrypto — Web Crypto API) ──────────

/**
 * Sign a string with HMAC-SHA256 using SubtleCrypto
 * @param {string} secret
 * @param {string} body
 * @returns {Promise<string>} hex signature
 */
async function signHMAC(secret, body) {
  if (!secret) return '';
  try {
    const enc   = new TextEncoder();
    const key   = await crypto.subtle.importKey(
      'raw', enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign']
    );
    const sig   = await crypto.subtle.sign('HMAC', key, enc.encode(body));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (_) {
    return '';
  }
}

// ── Signal sender ─────────────────────────────────────────

/**
 * Send a trade signal to the configured webhook
 * @param {string}         symbol  - e.g. 'BTCUSDT'
 * @param {EnrichedSignal} signal  - from engine.js evaluate()
 * @param {number}         price   - Current candle close price
 * @param {Object}         trade   - Paper trade object from paper.js tryEnter()
 * @returns {Promise<{ ok: boolean, response?: any, error?: string }>}
 */
export async function sendSignal(symbol, signal, price, trade) {
  const payload = {
    symbol,
    action:      signal.dir === 'LONG' ? 'BUY' : 'SELL',
    side:        signal.dir,
    price,
    size:        trade?.size ?? 0,
    sl:          trade?.sl ?? (signal.dir === 'LONG' ? price - signal.atrSL : price + signal.atrSL),
    tp1:         trade?.tp1 ?? (signal.dir === 'LONG' ? price + signal.atrTP1 : price - signal.atrTP1),
    tp2:         trade?.tp2 ?? (signal.dir === 'LONG' ? price + signal.atrTP2 : price - signal.atrTP2),
    conf:        signal.conf,
    engineScore: signal.engineScore,
    regime:      signal.regime,
    pattern:     signal.pattern ?? null,
    ts:          Date.now(),
  };

  const bodyStr = JSON.stringify(payload);

  // Dry run mode — log and return without POSTing
  if (connectorCfg.dryRun) {
    console.info('[Connector] DRY RUN — signal would send:', payload);
    return { ok: true, response: { status: 'dry-run', payload } };
  }

  if (!connectorCfg.webhookUrl) {
    return { ok: false, error: 'No webhook URL configured' };
  }

  // Sign payload
  const sig = await signHMAC(connectorCfg.secret, bodyStr);

  try {
    const res = await fetch(connectorCfg.webhookUrl, {
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'X-NEXAI-Sig':    sig,
        'X-NEXAI-Source': 'nexai-bot',
      },
      body: bodyStr,
    });

    const text = await res.text().catch(() => '');
    let   json = null;
    try { json = JSON.parse(text); } catch (_) {}

    console.info(`[Connector] ${signal.dir} ${price} → ${res.status}`, json ?? text);
    return { ok: res.ok, response: { status: res.status, body: json ?? text } };

  } catch (err) {
    console.error('[Connector] POST failed:', err.message);
    return { ok: false, error: err.message };
  }
}

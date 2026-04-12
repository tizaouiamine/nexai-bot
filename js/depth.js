/**
 * depth.js — Order book depth analysis (Binance REST /depth endpoint)
 *
 * Purpose:
 *   Fetches the top 20 bid/ask levels and computes:
 *   - Bid/ask spread (slippage proxy)
 *   - Bid vs ask volume delta (buying/selling pressure)
 *   - Price cluster walls (large bid/ask concentrations)
 *   - A composite score bonus/penalty for engine.js
 *
 * Why this matters:
 *   Murphy (Technical Analysis): volume and order flow confirm or deny price moves.
 *   Schwager (Market Wizards): "trade with liquidity, not against it."
 *   A wide spread means high entry cost; a buy wall means support is nearby.
 *
 * Rate limiting: results are cached per symbol for 30 seconds.
 */

const BINANCE_DEPTH_URL = 'https://api.binance.com/api/v3/depth';
const CACHE_TTL_MS      = 30_000;  // 30 second cache
const _cache            = {};       // { symbol: { ts, data } }

/**
 * Fetch order book depth for a symbol
 * @param {string} symbol - e.g. 'BTCUSDT'
 * @param {number} limit  - 5 | 10 | 20 | 50 | 100 | 500 | 1000
 * @returns {Promise<DepthData|null>}
 *
 * @typedef {Object} DepthData
 * @property {number}   spread        - (bestAsk - bestBid) in absolute price
 * @property {number}   spreadPct     - spread as % of mid price
 * @property {number}   bidDepth      - total bid volume (top N levels)
 * @property {number}   askDepth      - total ask volume (top N levels)
 * @property {number}   delta         - bidDepth - askDepth (+ = buying pressure)
 * @property {number}   bestBid
 * @property {number}   bestAsk
 * @property {number[]} bidWalls      - bid price levels with 2× avg volume
 * @property {number[]} askWalls      - ask price levels with 2× avg volume
 */
export async function fetchDepth(symbol, limit = 20) {
  // Return cached result if fresh
  const cached = _cache[symbol];
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const url  = `${BINANCE_DEPTH_URL}?symbol=${symbol}&limit=${limit}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;

    const raw = await resp.json();
    if (!raw.bids?.length || !raw.asks?.length) return null;

    // Parse levels: each is [price, qty] as strings
    const bids = raw.bids.map(([p, q]) => ({ price: +p, qty: +q }));
    const asks = raw.asks.map(([p, q]) => ({ price: +p, qty: +q }));

    const bestBid = bids[0].price;
    const bestAsk = asks[0].price;
    const mid     = (bestBid + bestAsk) / 2;
    const spread  = bestAsk - bestBid;
    const spreadPct = spread / mid * 100;

    const bidDepth = bids.reduce((a, b) => a + b.qty, 0);
    const askDepth = asks.reduce((a, a2) => a + a2.qty, 0);
    const delta    = bidDepth - askDepth;

    // Identify price walls (levels with > 2× average volume on that side)
    const avgBidVol = bidDepth / bids.length;
    const avgAskVol = askDepth / asks.length;
    const bidWalls  = bids.filter(b => b.qty > avgBidVol * 2).map(b => b.price);
    const askWalls  = asks.filter(a => a.qty > avgAskVol * 2).map(a => a.price);

    const data = {
      spread: +spread.toFixed(6),
      spreadPct: +spreadPct.toFixed(4),
      bidDepth: +bidDepth.toFixed(4),
      askDepth: +askDepth.toFixed(4),
      delta:    +delta.toFixed(4),
      bestBid,
      bestAsk,
      bidWalls,
      askWalls,
    };

    _cache[symbol] = { ts: Date.now(), data };
    return data;

  } catch (err) {
    console.warn(`[Depth] ${symbol} fetch failed:`, err.message);
    return null;
  }
}

/**
 * Convert depth data into a score adjustment for engine.js
 * @param {DepthData} depth
 * @returns {{ bonus: number, flags: string[] }}
 */
export function depthScore(depth) {
  if (!depth) return { bonus: 0, flags: [] };

  const flags  = [];
  let   bonus  = 0;

  // Spread quality
  if (depth.spreadPct < 0.05) {
    bonus += 5;
    flags.push(`✅ Depth: tight spread ${depth.spreadPct.toFixed(3)}% (low slippage)`);
  } else if (depth.spreadPct > 0.3) {
    bonus -= 10;
    flags.push(`❌ Depth: wide spread ${depth.spreadPct.toFixed(2)}% — skip (high slippage)`);
  }

  // Order imbalance: strong buy pressure
  if (depth.delta > 0 && depth.bidDepth > depth.askDepth * 1.5) {
    bonus += 8;
    flags.push(`✅ Depth: bid wall present (delta +${depth.delta.toFixed(0)} — buying pressure)`);
  } else if (depth.delta < 0 && depth.askDepth > depth.bidDepth * 1.5) {
    bonus -= 5;
    flags.push(`⚠️ Depth: ask wall dominates (sell pressure)`);
  }

  return { bonus, flags };
}

/**
 * Clear depth cache (e.g. on exchange switch)
 */
export function clearDepthCache() {
  for (const key of Object.keys(_cache)) delete _cache[key];
}

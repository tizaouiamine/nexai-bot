/**
 * config.js — Immutable constants and defaults
 * No side effects. Safe to import anywhere.
 */

// ── Binance endpoints ─────────────────────────────────────
export const BINANCE_REST = 'https://api.binance.com/api/v3';
export const BINANCE_WS   = 'wss://stream.binance.com:9443/ws';

// ── MEXC endpoints ────────────────────────────────────────
export const MEXC_REST    = 'https://api.mexc.com/api/v3';
export const MEXC_WS      = 'wss://wbs.mexc.com/ws';

// ── Legacy single-exchange aliases (used in binance.js) ──
export const REST_URL = BINANCE_REST;
export const WS_URL   = BINANCE_WS;

// ── Seed pairs (used before dynamic list loads) ──────────
// Full dynamic list is fetched at runtime via fetchAllPairs()
export const SEED_PAIRS = [
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT',
  'ARBUSDT','OPUSDT','AVAXUSDT','LINKUSDT','DOGEUSDT',
  'ADAUSDT','MATICUSDT','DOTUSDT','INJUSDT','SEIUSDT',
  'SUIUSDT','APTUSDT','NEARUSDT','ATOMUSDT','FTMUSDT',
];

// Keep PAIRS as alias for legacy imports
export const PAIRS = SEED_PAIRS;

export const SOCIAL = [
  { n:'M. Saylor',  t:'BTC accumulation continues. Institutions loading.',       s:'Bullish', c:'BTC' },
  { n:'Adam Khoo',  t:'Risk management first. Protect capital always.',           s:'Neutral', c:'ALL' },
  { n:'Rayner Teo', t:'SOL breaking key resistance. Watch for follow through.',   s:'Bullish', c:'SOL' },
  { n:'D. Marcus',  t:'ETH Layer2 adoption driving real utility.',                s:'Bullish', c:'ETH' },
  { n:'M. Lawson',  t:'Altseason signals: BTC dominance dropping slowly.',        s:'Bullish', c:'ALT' },
];

/** Default live trading config */
export const DEFAULT_CFG = {
  tp:        0.06,
  sl:        0.02,
  trail:     0.015,
  risk:      0.02,
  maxTrades: 6,
  sigMin:    65,      // Minimum engine/confidence score for bot entry
  tf:        '4h',
};

/** Indicator parameters — tuned for 1h–4h swing trading */
export const IND = {
  emaFast:  9,
  emaSlow:  21,
  rsiPer:   14,
  rsiOB:    70,
  rsiOS:    30,
  macdFast: 12,
  macdSlow: 26,
  macdSig:  9,
  bbPer:    20,
  bbMult:   2,
  volMAPer: 20,
};

export const STORAGE_KEYS = {
  paper:    'nexai_paper',
  apiKey:   'nexai_key',
  exchange: 'nexai_exchange',
};

// ── Exclude non-tradable symbols ─────────────────────────
const EXCLUDE = new Set([
  'USDCUSDT','BUSDUSDT','TUSDUSDT','USDPUSDT','EURUSDT',
  'GBPUSDT','FDUSDUSDT','DAIUSDT','SUSDEUSDT',
]);

/**
 * Fetch all active USDT spot pairs from Binance exchange info
 * Returns the full symbol list, filtered and sorted by volume rank.
 * Falls back to SEED_PAIRS if the request fails.
 *
 * @param {number} [limit=300]  Max pairs to return
 * @returns {Promise<string[]>}
 */
export async function fetchAllPairs(limit = 300) {
  try {
    const res  = await fetch(`${BINANCE_REST}/exchangeInfo`, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const symbols = (data.symbols ?? [])
      .filter(s =>
        s.quoteAsset === 'USDT' &&
        s.status     === 'TRADING' &&
        s.isSpotTradingAllowed === true &&
        !EXCLUDE.has(s.symbol)
      )
      .map(s => s.symbol);

    // Prioritise known liquid pairs first, then alphabetical
    const priority = new Set(SEED_PAIRS);
    symbols.sort((a, b) => {
      const pa = priority.has(a) ? 0 : 1;
      const pb = priority.has(b) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return a.localeCompare(b);
    });

    return symbols.slice(0, limit);
  } catch (err) {
    console.warn('[Config] fetchAllPairs failed, using SEED_PAIRS:', err.message);
    return [...SEED_PAIRS];
  }
}

/**
 * Fetch all active USDT pairs from MEXC
 * @param {number} [limit=200]
 * @returns {Promise<string[]>}
 */
export async function fetchMEXCPairs(limit = 200) {
  try {
    const res  = await fetch(`${MEXC_REST}/exchangeInfo`, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const symbols = (data.symbols ?? [])
      .filter(s =>
        s.quoteAsset === 'USDT' &&
        s.status     === 'ENABLED' &&
        !EXCLUDE.has(s.symbol)
      )
      .map(s => s.symbol);

    return symbols.slice(0, limit);
  } catch (err) {
    console.warn('[Config] fetchMEXCPairs failed:', err.message);
    return [];
  }
}

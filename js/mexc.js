/**
 * mexc.js — MEXC API layer (WebSocket + REST)
 *
 * Interface mirrors binance.js exactly so app.js can swap exchanges
 * by switching the active adapter.
 *
 * Public endpoints only — no API key required for market data.
 * Fires the same CustomEvent 'nexai:candle' as binance.js.
 *
 * MEXC kline intervals: 1m 5m 15m 30m 60m 4h 1d 1w 1M
 * WS stream format: wss://wbs.mexc.com/ws
 *   Subscribe: { method:'SUBSCRIPTION', params:['spot@public.kline.v3.api@BTCUSDT@Min60'] }
 */

import { MEXC_REST, MEXC_WS } from './config.js';
import { candles, wsMap, prices, setWsCount, wsCount } from './state.js';

const MAX_CANDLES = 600;
const RECONNECT_DELAYS = [3000, 5000, 10000, 30000];

// Map standard intervals to MEXC stream names
const TF_MAP = {
  '1m':  'Min1',  '3m':  'Min3',  '5m':  'Min5',
  '15m': 'Min15', '30m': 'Min30', '1h':  'Min60',
  '4h':  'Hour4', '8h':  'Hour8', '1d':  'Day1',
  '1w':  'Week1',
};

function safePrice(v) {
  const n = parseFloat(v);
  return isFinite(n) && n > 0 ? n : null;
}

/**
 * Fetch historical klines from MEXC REST
 * @param {string} symbol   - e.g. 'BTCUSDT'
 * @param {string} interval - e.g. '4h'
 * @param {number} limit
 * @returns {Promise<Candle[]>}
 */
export async function fetchKlinesMEXC(symbol, interval, limit = 200) {
  // MEXC uses 'interval' param with different names
  const mexcInterval = { '1h':'60m', '4h':'4h', '1d':'1d', '15m':'15m', '1m':'1m' }[interval] ?? interval;
  const sym = encodeURIComponent(symbol.toUpperCase());
  const url = `${MEXC_REST}/klines?symbol=${sym}&interval=${mexcInterval}&limit=${Math.min(limit, 1000)}`;

  try {
    const res = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Unexpected response shape');

    return data.map(k => ({
      time:   +k[0],
      open:   safePrice(k[1]),
      high:   safePrice(k[2]),
      low:    safePrice(k[3]),
      close:  safePrice(k[4]),
      volume: safePrice(k[5]) ?? 0,
      closed: true,
    })).filter(c => c.close != null);
  } catch (err) {
    console.error('[MEXC REST]', symbol, interval, err.message);
    return [];
  }
}

/**
 * Start a WebSocket stream for a symbol/interval on MEXC
 * @param {string} symbol
 * @param {string} interval
 */
export function startWSMEXC(symbol, interval) {
  const key    = `mexc_${symbol}_${interval}`;
  const stream = TF_MAP[interval] ?? 'Min60';

  if (wsMap[key] && wsMap[key].readyState < 2) return;

  let attempt = 0;

  function connect() {
    const ws = new WebSocket(MEXC_WS);
    wsMap[key] = ws;

    ws.onopen = () => {
      attempt = 0;
      setWsCount(wsCount + 1);
      // MEXC requires explicit subscription message
      ws.send(JSON.stringify({
        method: 'SUBSCRIPTION',
        params: [`spot@public.kline.v3.api@${symbol}@${stream}`],
      }));
      window.dispatchEvent(new CustomEvent('nexai:ws', { detail: { type: 'open', key, exchange: 'MEXC' } }));
    };

    ws.onmessage = (event) => {
      let raw;
      try { raw = JSON.parse(event.data); } catch { return; }

      // MEXC kline message structure
      const d = raw?.d;
      if (!d?.k) return;
      const k = d.k;

      const close  = safePrice(k.c);
      const volume = safePrice(k.v) ?? 0;
      if (close == null) return;

      const candle = {
        time:   +k.t,
        open:   safePrice(k.o),
        high:   safePrice(k.h),
        low:    safePrice(k.l),
        close,
        volume,
        closed: Boolean(k.T), // T = isClosed in MEXC
      };

      const storeKey = `${symbol}_${interval}`;
      if (!candles[storeKey]) candles[storeKey] = [];
      const store = candles[storeKey];
      if (store.length && store[store.length - 1].time === candle.time) {
        store[store.length - 1] = candle;
      } else {
        store.push(candle);
        if (store.length > MAX_CANDLES) store.shift();
      }

      prices[symbol] = close;

      window.dispatchEvent(new CustomEvent('nexai:candle', {
        detail: { key: storeKey, symbol, interval, candle, exchange: 'MEXC' },
      }));
    };

    ws.onerror = err => console.warn('[MEXC WS] error on', key, err.type);

    ws.onclose = () => {
      setWsCount(Math.max(0, wsCount - 1));
      wsMap[key] = null;
      window.dispatchEvent(new CustomEvent('nexai:ws', { detail: { type: 'close', key, exchange: 'MEXC' } }));
      const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
      attempt++;
      setTimeout(connect, delay);
    };
  }

  connect();
}

/**
 * Close a MEXC stream
 * @param {string} symbol
 * @param {string} interval
 */
export function closeWSMEXC(symbol, interval) {
  const key = `mexc_${symbol}_${interval}`;
  const ws  = wsMap[key];
  if (ws && ws.readyState < 2) ws.close();
  delete wsMap[key];
}

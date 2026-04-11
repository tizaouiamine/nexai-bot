/**
 * binance.js — Binance API layer (WebSocket + REST)
 *
 * Security:
 *   - Public endpoints only (no API key stored here)
 *   - All prices validated as finite numbers before storing
 *   - WebSocket auto-reconnects with exponential backoff
 *   - Rate-limit-safe: 100ms delay between REST calls (managed by caller)
 *
 * Fires CustomEvent 'nexai:candle' on window for decoupled consumers.
 */

import { REST_URL, WS_URL } from './config.js';
import { candles, wsMap, prices, setWsCount, wsCount } from './state.js';

const MAX_CANDLES = 600;
const RECONNECT_DELAYS = [3000, 5000, 10000, 30000]; // ms, capped at last value

/**
 * Validate and parse a raw price value
 * @param {*} v
 * @returns {number|null}
 */
function safePrice(v) {
  const n = parseFloat(v);
  return isFinite(n) && n > 0 ? n : null;
}

/**
 * Fetch historical klines from Binance REST API
 * @param {string} symbol   - e.g. 'BTCUSDT'
 * @param {string} interval - e.g. '4h'
 * @param {number} limit    - Number of candles (max 1000)
 * @returns {Promise<Candle[]>}
 */
export async function fetchKlines(symbol, interval, limit = 200) {
  const sym = encodeURIComponent(symbol.toUpperCase());
  const url = `${REST_URL}/klines?symbol=${sym}&interval=${interval}&limit=${Math.min(limit, 1000)}`;

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
    console.error('[Binance REST]', symbol, interval, err.message);
    return [];
  }
}

/**
 * Start a WebSocket stream for a symbol/interval pair
 * @param {string}   symbol   - e.g. 'BTCUSDT'
 * @param {string}   interval - e.g. '4h'
 */
export function startWS(symbol, interval) {
  const key = `${symbol}_${interval}`;
  if (wsMap[key] && wsMap[key].readyState < 2) return; // already open or connecting

  let attempt = 0;

  function connect() {
    const url = `${WS_URL}/${symbol.toLowerCase()}@kline_${interval}`;
    const ws  = new WebSocket(url);
    wsMap[key] = ws;

    ws.onopen = () => {
      attempt = 0;
      setWsCount(wsCount + 1);
      window.dispatchEvent(new CustomEvent('nexai:ws', { detail: { type: 'open', key } }));
    };

    ws.onmessage = (event) => {
      let raw;
      try { raw = JSON.parse(event.data); } catch { return; }
      const k = raw?.k;
      if (!k) return;

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
        closed: Boolean(k.x),
      };

      // Store candle
      if (!candles[key]) candles[key] = [];
      const store = candles[key];
      if (store.length && store[store.length - 1].time === candle.time) {
        store[store.length - 1] = candle;
      } else {
        store.push(candle);
        if (store.length > MAX_CANDLES) store.shift();
      }

      // Update live price
      prices[symbol] = close;

      // Notify app layer
      window.dispatchEvent(new CustomEvent('nexai:candle', {
        detail: { key, symbol, interval, candle },
      }));
    };

    ws.onerror = (err) => {
      console.warn('[Binance WS] error on', key, err.type);
    };

    ws.onclose = () => {
      setWsCount(Math.max(0, wsCount - 1));
      wsMap[key] = null;
      window.dispatchEvent(new CustomEvent('nexai:ws', { detail: { type: 'close', key } }));

      // Exponential backoff reconnect
      const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
      attempt++;
      setTimeout(connect, delay);
    };
  }

  connect();
}

/**
 * Gracefully close a specific stream
 * @param {string} key - e.g. 'BTCUSDT_4h'
 */
export function closeWS(key) {
  const ws = wsMap[key];
  if (ws && ws.readyState < 2) ws.close();
  delete wsMap[key];
}

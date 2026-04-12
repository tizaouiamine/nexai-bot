/**
 * strategy.js — Multi-factor signal detection engine
 *
 * Strategy: EMA 9/21 crossover + RSI(14) + MACD(12/26/9) + Bollinger Bands(20,2) + Volume MA
 * + RSI divergence + MACD histogram momentum fade
 * Methodology: Multi-timeframe confluence (SIFT + triangulation)
 * Reference: ressources/research-methodology.md
 *
 * Scoring system (max ~100 pts, normalized to 0–97%):
 *   EMA cross/trend      : 30 pts (strongest signal)
 *   RSI condition        : 20 pts
 *   MACD condition       : 20 pts
 *   Bollinger Bands      : 10 pts
 *   Volume confirm       : 10 pts (conditional)
 *   RSI divergence       : +18 pts bonus (high-reliability reversal signal)
 *   MACD momentum fade   : -12 pts penalty (momentum exhaustion warning)
 */

import { calcEMA, calcRSI, calcMACD, calcBB } from './indicators.js';
import { IND } from './config.js';

/**
 * @typedef {Object} Signal
 * @property {'LONG'|'SHORT'|null} dir
 * @property {string}  sig        - 'STRONG BUY' | 'BUY' | 'STRONG SELL' | 'SELL' | 'NEUTRAL'
 * @property {number}  conf       - Confidence score 0–97
 * @property {string[]} rsns      - Human-readable reasons
 * @property {number}  rsi
 * @property {number}  macdH      - MACD histogram value
 * @property {number}  ema9
 * @property {number}  ema21
 * @property {string}  trend      - 'Bullish' | 'Bearish'
 * @property {number}  price
 */

/**
 * Detect trading signal from candle array
 * @param {{ close: number, volume: number }[]} cs - Candles (min 50 required)
 * @returns {Signal|null}
 */
export function detect(cs) {
  if (!cs || cs.length < 50) return null;

  const cl  = cs.map(c => c.close);
  const vol = cs.map(c => c.volume);
  const n   = cl.length - 1;
  const p   = n - 1;

  // Compute indicators
  const e9   = calcEMA(cl,  IND.emaFast);
  const e21  = calcEMA(cl,  IND.emaSlow);
  const r    = calcRSI(cl,  IND.rsiPer);
  const m    = calcMACD(cl, IND.macdFast, IND.macdSlow, IND.macdSig);
  const b    = calcBB(cl,   IND.bbPer,   IND.bbMult);
  const vm   = calcEMA(vol, IND.volMAPer);

  const [ce9, pe9, ce21, pe21] = [e9[n], e9[p], e21[n], e21[p]];
  const cr = r[n], cm = m.hist[n], pm = m.hist[p];
  const cb = b[n], cv = vol[n], cvm = vm[n];

  // Guard: need all indicators to be computed
  if (ce9 == null || ce21 == null || cr == null || cm == null || cb == null) return null;

  let ls = 0, ss = 0;
  const rsns = [];

  // ── 1. EMA Crossover / Trend (30 pts) ────────────────
  const crossLong  = pe9 != null && pe21 != null && pe9 <= pe21 && ce9 > ce21;
  const crossShort = pe9 != null && pe21 != null && pe9 >= pe21 && ce9 < ce21;

  if (crossLong)  { ls += 30; rsns.push('EMA Bull Cross'); }
  else if (crossShort) { ss += 30; rsns.push('EMA Bear Cross'); }
  else if (ce9 > ce21) ls += 12;
  else                 ss += 12;

  // ── 2. RSI (20 pts) ──────────────────────────────────
  if (cr < IND.rsiOS)              { ls += 20; rsns.push('RSI Oversold'); }
  else if (cr > IND.rsiOB)         { ss += 20; rsns.push('RSI Overbought'); }
  else if (cr >= 55 && cr <= 68)   { ls += 12; rsns.push('RSI Bullish Zone'); }
  else if (cr <= 45 && cr >= 32)   { ss += 12; rsns.push('RSI Bearish Zone'); }
  else                             { ls += 6;  ss += 6; }

  // ── 3. MACD (20 pts) ─────────────────────────────────
  if (pm != null && pm < 0 && cm > 0)  { ls += 20; rsns.push('MACD Bull Cross'); }
  else if (pm != null && pm > 0 && cm < 0) { ss += 20; rsns.push('MACD Bear Cross'); }
  else if (cm > 0) { ls += 8; rsns.push('MACD Positive'); }
  else             { ss += 8; rsns.push('MACD Negative'); }

  // ── 4. Bollinger Bands (10 pts) ──────────────────────
  const close = cl[n];
  if (close <= cb.lower)      { ls += 10; rsns.push('BB Lower Touch'); }
  else if (close >= cb.upper) { ss += 10; rsns.push('BB Upper Touch'); }
  else if (close < cb.mid)    ss += 4;
  else                        ls += 4;

  // ── 5. Volume confirmation (10 pts, conditional) ─────
  if (cvm && cv > cvm * 1.25) {
    if (ls > ss) { ls += 10; rsns.push('Vol Spike Confirms'); }
    else         { ss += 10; rsns.push('Vol Spike Confirms'); }
  }

  // ── 6. RSI Divergence (+18 pts) ──────────────────────
  // Requires at least 10 candles + full RSI array
  if (n >= 9 && cs[n].low != null && cs[n - 5].low != null) {
    const rsiN = r[n];
    const rsiP = r[n - 5];
    if (rsiN != null && rsiP != null) {
      // Bullish divergence: price makes lower low, RSI makes higher low
      const priceLowerLow  = cs[n].low  < cs[n - 5].low;
      const rsiHigherLow   = rsiN       > rsiP;
      if (priceLowerLow && rsiHigherLow) {
        ls += 18;
        rsns.push('RSI Bull Divergence');
      }
      // Bearish divergence: price makes higher high, RSI makes lower high
      const priceHigherHigh = cs[n].high > cs[n - 5].high;
      const rsiLowerHigh    = rsiN       < rsiP;
      if (priceHigherHigh && rsiLowerHigh) {
        ss += 18;
        rsns.push('RSI Bear Divergence');
      }
    }
  }

  // ── 7. MACD Histogram Momentum Fade (-12 pts penalty) ──
  // 3 consecutive candles of shrinking histogram in the dominant direction
  const mh = m.hist;
  if (mh.length >= n - 2 && mh[n] != null && mh[n - 1] != null && mh[n - 2] != null) {
    const fadingBull = mh[n] < mh[n - 1] && mh[n - 1] < mh[n - 2] && mh[n - 2] > 0 && ls > ss;
    const fadingBear = mh[n] > mh[n - 1] && mh[n - 1] > mh[n - 2] && mh[n - 2] < 0 && ss > ls;
    if (fadingBull || fadingBear) {
      if (fadingBull) ls = Math.max(0, ls - 12);
      else            ss = Math.max(0, ss - 12);
      rsns.push('MACD Momentum Fading');
    }
  }

  // ── Normalize confidence ──────────────────────────────
  const MAX_SCORE = 100;
  const top  = Math.max(ls, ss);
  const conf = Math.min(Math.round(top / MAX_SCORE * 100), 97);
  const trend = ce9 > ce21 ? 'Bullish' : 'Bearish';
  const base  = { rsi: +cr.toFixed(1), macdH: +cm.toFixed(5), ema9: ce9, ema21: ce21, trend, bb: cb, price: close, rsns };

  if (ls > ss && ls >= 40) {
    return { ...base, dir: 'LONG',  sig: ls >= 62 ? 'STRONG BUY'  : 'BUY',  conf };
  }
  if (ss > ls && ss >= 40) {
    return { ...base, dir: 'SHORT', sig: ss >= 62 ? 'STRONG SELL' : 'SELL', conf };
  }
  return { ...base, dir: null, sig: 'NEUTRAL', conf: 50, rsns: [] };
}

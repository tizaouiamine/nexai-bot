/**
 * engine.js — AI decision engine (high-efficiency trade filter)
 *
 * Wraps strategy.detect() with higher-order filters:
 *   1. Market regime (EMA 200 trend filter)
 *   2. ATR-based adaptive SL/TP sizing
 *   3. Multi-timeframe confirmation gate
 *   4. Candle pattern boost (hammer, engulfing, doji)
 *   5. Confluence score — requires ≥3 independent factors
 *   6. Volatility gate — skip trades during abnormal vol spikes
 *
 * Returns an EnrichedSignal or null.
 * Stateless: same inputs → same output. No side effects.
 */

import { detect }        from './strategy.js';
import { calcEMA, calcBB } from './indicators.js';

// ── ATR calculation ───────────────────────────────────────

/**
 * Average True Range (Wilder's smoothing)
 * @param {{ high, low, close }[]} cs
 * @param {number} per
 * @returns {number|null} Latest ATR value
 */
function calcATR(cs, per = 14) {
  if (cs.length < per + 1) return null;
  const trs = cs.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prev = cs[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
  });
  // Wilder's smoothing
  let atr = trs.slice(1, per + 1).reduce((a, b) => a + b, 0) / per;
  for (let i = per + 1; i < trs.length; i++) {
    atr = (atr * (per - 1) + trs[i]) / per;
  }
  return atr;
}

// ── Market regime ─────────────────────────────────────────

/**
 * Determine market regime using EMA 200
 * @returns {'bull'|'bear'|'ranging'}
 */
function marketRegime(closes) {
  if (closes.length < 200) return 'ranging';
  const e200 = calcEMA(closes, 200);
  const last  = e200[e200.length - 1];
  const price = closes[closes.length - 1];
  if (!last) return 'ranging';
  const pct = (price - last) / last * 100;
  if (pct >  1.5) return 'bull';
  if (pct < -1.5) return 'bear';
  return 'ranging';
}

// ── Candle pattern detection ──────────────────────────────

/**
 * Detect single-candle reversal patterns
 * @returns {{ pattern: string, bias: 'bull'|'bear'|null }}
 */
function candlePattern(cs) {
  const n = cs.length - 1;
  if (n < 1) return { pattern: null, bias: null };

  const c    = cs[n];
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  if (range === 0) return { pattern: null, bias: null };

  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  const bodyRatio = body / range;

  // Hammer (bullish): small body, long lower wick ≥ 2× body
  if (lowerWick >= body * 2 && upperWick < body * 0.5 && bodyRatio < 0.4) {
    return { pattern: 'Hammer', bias: 'bull' };
  }
  // Shooting star (bearish): small body, long upper wick ≥ 2× body
  if (upperWick >= body * 2 && lowerWick < body * 0.5 && bodyRatio < 0.4) {
    return { pattern: 'Shooting Star', bias: 'bear' };
  }
  // Doji: body < 10% of range
  if (bodyRatio < 0.1) {
    return { pattern: 'Doji', bias: null };
  }

  // Bullish engulfing vs previous candle
  const prev = cs[n - 1];
  if (prev.close < prev.open && c.close > c.open &&
      c.close > prev.open && c.open < prev.close) {
    return { pattern: 'Bull Engulf', bias: 'bull' };
  }
  // Bearish engulfing
  if (prev.close > prev.open && c.close < c.open &&
      c.close < prev.open && c.open > prev.close) {
    return { pattern: 'Bear Engulf', bias: 'bear' };
  }

  return { pattern: null, bias: null };
}

// ── Volatility gate ───────────────────────────────────────

/**
 * True if current volatility is abnormally high (skip choppy entries)
 * @param {number[]} closes
 * @returns {boolean}
 */
function isVolatilitySpike(closes) {
  if (closes.length < 30) return false;
  const recent  = closes.slice(-5).map((v, i, arr) => i === 0 ? 0 : Math.abs(v - arr[i-1]) / arr[i-1] * 100);
  const baseline = closes.slice(-30, -5).map((v, i, arr) => i === 0 ? 0 : Math.abs(v - arr[i-1]) / arr[i-1] * 100);
  const avgRecent   = recent.reduce((a, b) => a + b, 0) / recent.length;
  const avgBaseline = baseline.reduce((a, b) => a + b, 0) / baseline.length;
  return avgRecent > avgBaseline * 3.5; // current move is 3.5× normal
}

// ── Main engine ───────────────────────────────────────────

/**
 * Evaluate a full trade decision with AI filters
 *
 * @param {{ high, low, close, volume }[]} cs  - Primary TF candles
 * @param {{ high, low, close, volume }[]|null} csHTF - Higher TF candles (optional, for MTF)
 * @returns {EnrichedSignal|null}
 *
 * @typedef {Object} EnrichedSignal
 * @property {'LONG'|'SHORT'|null} dir
 * @property {string}  sig
 * @property {number}  conf          - Base confidence 0–97
 * @property {number}  engineScore   - 0–100, composite AI score
 * @property {boolean} tradeable     - true if all filters pass
 * @property {string}  blockReason   - Why not tradeable (if blocked)
 * @property {number}  atr           - ATR value
 * @property {number}  atrSL         - ATR-based stop distance
 * @property {number}  atrTP1        - ATR-based TP1 distance
 * @property {number}  atrTP2        - ATR-based TP2 distance
 * @property {string}  regime        - 'bull'|'bear'|'ranging'
 * @property {string}  pattern       - Candle pattern name or null
 * @property {boolean} mtfConfirm    - Higher TF alignment
 * @property {string[]} filters      - Filter verdicts for transparency
 */
export function evaluate(cs, csHTF = null) {
  if (!cs || cs.length < 50) return null;

  const closes = cs.map(c => c.close);
  const price  = closes[closes.length - 1];

  // ── Base signal ────────────────────────────────────────
  const base = detect(cs);
  if (!base || !base.dir) return { ...base, tradeable: false, blockReason: 'No directional signal', engineScore: 0, filters: [] };

  const filters   = [];
  let   blocked   = null;
  let   scoreBonus = 0;

  // ── 1. Market regime filter ────────────────────────────
  const regime = marketRegime(closes);
  if (regime === 'bull' && base.dir === 'SHORT') {
    blocked = 'Counter-trend SHORT in bull regime';
    filters.push('❌ Regime: bull (blocking SHORT)');
  } else if (regime === 'bear' && base.dir === 'LONG') {
    blocked = 'Counter-trend LONG in bear regime';
    filters.push('❌ Regime: bear (blocking LONG)');
  } else {
    filters.push(`✅ Regime: ${regime} (aligned)`);
    scoreBonus += 15;
  }

  // ── 2. ATR-based sizing ────────────────────────────────
  const atr = calcATR(cs, 14);
  const atrSL  = atr ? atr * 1.5  : price * 0.02;
  const atrTP1 = atr ? atr * 2.0  : price * 0.03;
  const atrTP2 = atr ? atr * 4.0  : price * 0.06;

  // Guard: SL too wide (> 8% of price) → skip
  const slPct = atrSL / price * 100;
  if (slPct > 8) {
    blocked = blocked ?? `ATR SL too wide: ${slPct.toFixed(1)}%`;
    filters.push(`❌ ATR SL ${slPct.toFixed(1)}% — too wide`);
  } else {
    filters.push(`✅ ATR SL ${slPct.toFixed(2)}%`);
    scoreBonus += 10;
  }

  // ── 3. Candle pattern ──────────────────────────────────
  const { pattern, bias: patBias } = candlePattern(cs);
  if (pattern) {
    if ((patBias === 'bull' && base.dir === 'LONG') ||
        (patBias === 'bear' && base.dir === 'SHORT')) {
      filters.push(`✅ Pattern: ${pattern} (confirms)`);
      scoreBonus += 12;
    } else if (patBias && patBias !== null &&
               ((patBias === 'bull' && base.dir === 'SHORT') ||
                (patBias === 'bear' && base.dir === 'LONG'))) {
      filters.push(`⚠️ Pattern: ${pattern} (opposes)`);
      scoreBonus -= 8;
    } else {
      filters.push(`ℹ️ Pattern: ${pattern}`);
    }
  } else {
    filters.push('— No candle pattern');
  }

  // ── 4. Volatility gate ─────────────────────────────────
  if (isVolatilitySpike(closes)) {
    blocked = blocked ?? 'Abnormal volatility spike — skip';
    filters.push('❌ Volatility spike detected');
  } else {
    filters.push('✅ Volatility normal');
    scoreBonus += 8;
  }

  // ── 5. Multi-timeframe confirmation ────────────────────
  let mtfConfirm = false;
  if (csHTF && csHTF.length >= 50) {
    const htfSig = detect(csHTF);
    if (htfSig?.dir === base.dir) {
      mtfConfirm = true;
      filters.push(`✅ MTF confirm: ${htfSig.sig} (${htfSig.conf}%)`);
      scoreBonus += 20;
    } else if (htfSig?.dir && htfSig.dir !== base.dir) {
      filters.push(`⚠️ MTF conflict: HTF says ${htfSig.dir}`);
      scoreBonus -= 10;
    } else {
      filters.push('— MTF neutral / no data');
    }
  } else {
    filters.push('— MTF: no higher-TF data');
  }

  // ── 6. Confluence minimum (≥ 40 base score means ≥2 strong factors) ──
  if (base.conf < 55) {
    blocked = blocked ?? `Low confluence: ${base.conf}%`;
    filters.push(`❌ Confluence too low: ${base.conf}%`);
  } else {
    filters.push(`✅ Confluence: ${base.conf}%`);
  }

  // ── Composite engine score ─────────────────────────────
  const engineScore = Math.min(100, Math.max(0, Math.round(base.conf * 0.6 + scoreBonus)));

  return {
    ...base,
    atr, atrSL, atrTP1, atrTP2,
    regime, pattern, mtfConfirm,
    engineScore,
    tradeable: !blocked && engineScore >= 45,
    blockReason: blocked ?? null,
    filters,
  };
}

/**
 * Quick tradeable check — used by bot loop
 * @param {EnrichedSignal} ev
 * @param {number} minScore - Minimum engine score (default 50)
 */
export function isTradeable(ev, minScore = 50) {
  return ev?.tradeable === true && ev.engineScore >= minScore;
}

/**
 * indicators.js — Pure technical indicator functions
 * No imports, no side effects. All functions are deterministic.
 * Source: standard financial formulas (Wilder's RSI, Hull MACD, Bollinger Bands)
 */

/**
 * Exponential Moving Average
 * @param {number[]} arr  - Close prices
 * @param {number}   per  - Period
 * @returns {(number|null)[]}
 */
export function calcEMA(arr, per) {
  if (!arr || arr.length < per) return (arr || []).map(() => null);
  const k   = 2 / (per + 1);
  const out  = new Array(arr.length).fill(null);
  // Seed: simple average of first `per` values
  out[per - 1] = arr.slice(0, per).reduce((a, b) => a + b, 0) / per;
  for (let i = per; i < arr.length; i++) {
    out[i] = arr[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

/**
 * Relative Strength Index (Wilder's smoothed method)
 * @param {number[]} arr  - Close prices
 * @param {number}   per  - Period (default 14)
 * @returns {(number|null)[]}
 */
export function calcRSI(arr, per = 14) {
  if (!arr || arr.length < per + 1) return (arr || []).map(() => null);
  const out = new Array(arr.length).fill(null);
  const ch  = arr.map((v, i) => i === 0 ? 0 : v - arr[i - 1]);

  // Initial averages over first `per` periods
  let ag = 0, al = 0;
  for (let i = 1; i <= per; i++) {
    ag += ch[i] > 0 ? ch[i] : 0;
    al += ch[i] < 0 ? -ch[i] : 0;
  }
  ag /= per; al /= per;
  out[per] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);

  // Wilder's smoothing
  for (let i = per + 1; i < arr.length; i++) {
    const g = ch[i] > 0 ? ch[i] : 0;
    const l = ch[i] < 0 ? -ch[i] : 0;
    ag = (ag * (per - 1) + g) / per;
    al = (al * (per - 1) + l) / per;
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}

/**
 * MACD — Moving Average Convergence Divergence
 * @param {number[]} arr - Close prices
 * @param {number} fast  - Fast EMA period (default 12)
 * @param {number} slow  - Slow EMA period (default 26)
 * @param {number} sig   - Signal EMA period (default 9)
 * @returns {{ ml: number[], sl: number[], hist: number[] }}
 */
export function calcMACD(arr, fast = 12, slow = 26, sig = 9) {
  const e1 = calcEMA(arr, fast);
  const e2 = calcEMA(arr, slow);
  const ml = arr.map((_, i) =>
    e1[i] != null && e2[i] != null ? e1[i] - e2[i] : null
  );

  // Signal line = EMA of valid MACD values
  const valid = ml.filter(v => v != null);
  if (valid.length < sig) {
    return { ml, sl: ml.map(() => null), hist: ml.map(() => null) };
  }
  const seArr = calcEMA(valid, sig);
  let j = 0;
  const sl   = ml.map(v => v != null ? seArr[j++] ?? null : null);
  const hist = ml.map((v, i) => v != null && sl[i] != null ? v - sl[i] : null);
  return { ml, sl, hist };
}

/**
 * Bollinger Bands
 * @param {number[]} arr  - Close prices
 * @param {number}   per  - Period (default 20)
 * @param {number}   mult - Standard deviation multiplier (default 2)
 * @returns {(null|{mid, upper, lower})[]}
 */
export function calcBB(arr, per = 20, mult = 2) {
  return arr.map((_, i) => {
    if (i < per - 1) return null;
    const slice = arr.slice(i - per + 1, i + 1);
    const mean  = slice.reduce((a, b) => a + b, 0) / per;
    const std   = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / per);
    return { mid: mean, upper: mean + mult * std, lower: mean - mult * std };
  });
}

/**
 * levels.js — Support/Resistance detection + Fibonacci retracement
 *
 * Book references:
 *   - Murphy (Technical Analysis): swing high/low identification, S/R from prior pivots
 *   - Nison (Japanese Candlestick): key levels from pattern highs/lows
 *   - Schwager (Market Wizards): "price memory" — markets remember prior pivot points
 *
 * How it works:
 *   findSwingLevels() scans candles for local swing highs/lows (price that is
 *   highest/lowest within ±WING candles on each side). Nearby levels (within
 *   CLUSTER_PCT) are merged into a single zone. This mirrors how professional
 *   traders identify support and resistance from market structure.
 *
 *   fibLevels() computes the four classic Fibonacci retracement levels between
 *   a swing high and swing low. The 50% and 61.8% levels are the "sweet spots"
 *   where price has the highest probability of reversing (per Murphy ch. 14).
 */

const WING        = 5;          // candles on each side to qualify as swing pivot
const CLUSTER_PCT = 0.003;      // merge levels within 0.3% of each other
const MAX_LEVELS  = 8;          // max levels to return per side

// ── Swing level detection ──────────────────────────────────

/**
 * Find swing support and resistance levels from candle data
 * @param {Candle[]} cs       - Array of OHLCV candles (most recent last)
 * @param {number}   lookback - How many candles to scan (default 100)
 * @returns {{ supports: number[], resistances: number[] }}
 */
export function findSwingLevels(cs, lookback = 100) {
  if (cs.length < WING * 2 + 1) return { supports: [], resistances: [] };

  const slice = cs.slice(-Math.min(lookback, cs.length));
  const rawSupports     = [];
  const rawResistances  = [];

  for (let i = WING; i < slice.length - WING; i++) {
    const c = slice[i];

    // Swing low: lowest low in ±WING window
    let isSwingLow = true;
    for (let j = i - WING; j <= i + WING; j++) {
      if (j !== i && slice[j].low <= c.low) { isSwingLow = false; break; }
    }
    if (isSwingLow) rawSupports.push(c.low);

    // Swing high: highest high in ±WING window
    let isSwingHigh = true;
    for (let j = i - WING; j <= i + WING; j++) {
      if (j !== i && slice[j].high >= c.high) { isSwingHigh = false; break; }
    }
    if (isSwingHigh) rawResistances.push(c.high);
  }

  return {
    supports:     _cluster(rawSupports).slice(-MAX_LEVELS),
    resistances:  _cluster(rawResistances).slice(-MAX_LEVELS),
  };
}

/**
 * Merge nearby price levels within CLUSTER_PCT of each other
 * @param {number[]} levels
 * @returns {number[]} sorted ascending
 */
function _cluster(levels) {
  if (!levels.length) return [];
  const sorted = [...levels].sort((a, b) => a - b);
  const merged = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if ((sorted[i] - last) / last <= CLUSTER_PCT) {
      // Average into existing cluster
      merged[merged.length - 1] = (last + sorted[i]) / 2;
    } else {
      merged.push(sorted[i]);
    }
  }
  return merged;
}

// ── Fibonacci retracement ──────────────────────────────────

/**
 * Compute Fibonacci retracement levels from swing high to swing low
 * (used for pullback entry "sweet spot" detection)
 *
 * @param {number} swingHigh
 * @param {number} swingLow
 * @returns {{ fib236: number, fib382: number, fib50: number, fib618: number, fib786: number }}
 */
export function fibLevels(swingHigh, swingLow) {
  const range = swingHigh - swingLow;
  return {
    fib236: swingHigh - range * 0.236,
    fib382: swingHigh - range * 0.382,
    fib50:  swingHigh - range * 0.500,
    fib618: swingHigh - range * 0.618,
    fib786: swingHigh - range * 0.786,
  };
}

/**
 * Auto-detect recent swing high/low and compute Fibonacci levels
 * @param {Candle[]} cs - candle array (recent last)
 * @param {number}   n  - lookback period for swing detection
 * @returns {{ fib236, fib382, fib50, fib618, fib786, swingHigh, swingLow } | null}
 */
export function autoFibLevels(cs, n = 60) {
  const slice = cs.slice(-Math.min(n, cs.length));
  if (slice.length < 10) return null;

  const swingHigh = Math.max(...slice.map(c => c.high));
  const swingLow  = Math.min(...slice.map(c => c.low));
  if (swingHigh <= swingLow) return null;

  return { swingHigh, swingLow, ...fibLevels(swingHigh, swingLow) };
}

// ── Proximity helpers ──────────────────────────────────────

/**
 * Find nearest support level at or below price
 * @param {number}   price
 * @param {number[]} supports
 * @returns {{ level: number, distPct: number } | null}
 */
export function nearestSupport(price, supports) {
  const below = supports.filter(s => s <= price);
  if (!below.length) return null;
  const level = Math.max(...below);
  return { level, distPct: +((price - level) / price * 100).toFixed(2) };
}

/**
 * Find nearest resistance level at or above price
 * @param {number}   price
 * @param {number[]} resistances
 * @returns {{ level: number, distPct: number } | null}
 */
export function nearestResistance(price, resistances) {
  const above = resistances.filter(r => r >= price);
  if (!above.length) return null;
  const level = Math.min(...above);
  return { level, distPct: +((level - price) / price * 100).toFixed(2) };
}

/**
 * Check if price is near a Fibonacci level (within tolerancePct)
 * Returns the name and bonus score of the closest Fib level, or null
 * @param {number} price
 * @param {Object} fibs     - result of fibLevels() or autoFibLevels()
 * @param {number} tolPct   - tolerance in % (default 0.5)
 * @returns {{ name: string, level: number, bonus: number } | null}
 */
export function nearFibLevel(price, fibs, tolPct = 0.5) {
  if (!fibs) return null;

  const levels = [
    { name: 'Fib 23.6%', level: fibs.fib236, bonus: 5  },
    { name: 'Fib 38.2%', level: fibs.fib382, bonus: 10 },
    { name: 'Fib 50.0%', level: fibs.fib50,  bonus: 15 },
    { name: 'Fib 61.8%', level: fibs.fib618, bonus: 15 },  // golden ratio — strongest
    { name: 'Fib 78.6%', level: fibs.fib786, bonus: 8  },
  ];

  let best = null;
  for (const { name, level, bonus } of levels) {
    const distPct = Math.abs(price - level) / price * 100;
    if (distPct <= tolPct) {
      if (!best || distPct < Math.abs(price - best.level) / price * 100) {
        best = { name, level, bonus, distPct: +distPct.toFixed(3) };
      }
    }
  }
  return best;
}

/**
 * training.js — AI self-learning engine
 *
 * Purpose:
 *   Runs the strategy over historical candle windows and measures which
 *   signal factors actually predicted profitable moves. Stores accuracy
 *   weights in localStorage. The strategy engine can use these weights
 *   to boost/reduce confidence per factor over time.
 *
 * Book references:
 *   - Murphy  (Technical Analysis): which indicators are most reliable per TF
 *   - Douglas (Trading in the Zone): probability thinking — measure over 30+ trades
 *   - Schwager (Market Wizards): cut losers fast — use tight exit threshold
 *
 * Training loop per pair:
 *   for i = 50 to n - LOOK_FORWARD:
 *     signal = detect(candles[0..i])
 *     if signal.dir != null:
 *       check candles[i+1..i+LOOK_FORWARD] for outcome
 *       outcome = LONG hit +threshold% before -SL% → WIN | else → LOSS
 *       record per factor (rsns[]) → { wins, total }
 *
 * Weights are then:
 *   accuracy[factor] = wins / total   (clamped 0.3–0.95)
 *
 * These weights are stored in localStorage as 'nexai_weights'
 * and exported as getWeights() for use by engine.js / strategy.js.
 */

import { detect }       from './strategy.js';
import { fetchKlines }  from './binance.js';

const STORAGE_KEY   = 'nexai_weights';
const LOOK_FORWARD  = 8;    // candles to check after signal fires
const WIN_THRESHOLD = 0.02; // 2% move in signal direction = win
const SL_THRESHOLD  = 0.015; // 1.5% move against = loss

// ── Weight storage ────────────────────────────────────────

/**
 * Load stored weights from localStorage
 * @returns {{ [factor: string]: number }} factor → accuracy 0–1
 */
export function getWeights() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveWeights(w) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(w));
}

export function resetWeights() {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Training progress state ───────────────────────────────

let _progress = { running: false, pairs: 0, done: 0, signals: 0, trained: 0 };

export function getProgress() { return { ..._progress }; }

// ── Core training loop ────────────────────────────────────

/**
 * Run training on a list of symbols
 * @param {string[]} symbols     - e.g. ['BTCUSDT','ETHUSDT',...]
 * @param {string}   interval    - e.g. '4h'
 * @param {Function} onProgress  - called with progress updates
 * @returns {Promise<TrainResult>}
 *
 * @typedef {Object} TrainResult
 * @property {{ [factor: string]: { wins: number, total: number, accuracy: number } }} factors
 * @property {number} totalSignals
 * @property {number} trainedPairs
 * @property {{ [factor: string]: number }} weights  - the new weights
 */
export async function runTraining(symbols, interval = '4h', onProgress = null) {
  _progress = { running: true, pairs: symbols.length, done: 0, signals: 0, trained: 0 };

  // Accumulate across all pairs
  const acc = {};  // { factor: { wins, total } }

  for (const symbol of symbols) {
    const cs = await fetchKlines(symbol, interval, 500);
    if (cs.length < 80) {
      _progress.done++;
      onProgress?.({ ..._progress });
      continue;
    }

    _progress.trained++;

    // Slide window
    for (let i = 50; i < cs.length - LOOK_FORWARD; i++) {
      const window = cs.slice(0, i + 1);
      const sig    = detect(window);

      if (!sig || !sig.dir || !sig.rsns?.length) continue;

      _progress.signals++;

      // Determine outcome
      const entry = cs[i].close;
      let outcome = null;

      for (let j = i + 1; j <= i + LOOK_FORWARD; j++) {
        const hi = cs[j].high;
        const lo = cs[j].low;

        if (sig.dir === 'LONG') {
          if (hi >= entry * (1 + WIN_THRESHOLD))  { outcome = 'WIN';  break; }
          if (lo <= entry * (1 - SL_THRESHOLD))   { outcome = 'LOSS'; break; }
        } else {
          if (lo <= entry * (1 - WIN_THRESHOLD))  { outcome = 'WIN';  break; }
          if (hi >= entry * (1 + SL_THRESHOLD))   { outcome = 'LOSS'; break; }
        }
      }

      if (!outcome) continue; // inconclusive — skip

      // Record per factor
      for (const rsn of sig.rsns) {
        if (!acc[rsn]) acc[rsn] = { wins: 0, total: 0 };
        acc[rsn].total++;
        if (outcome === 'WIN') acc[rsn].wins++;
      }
    }

    _progress.done++;
    onProgress?.({ ..._progress });

    // Small yield to keep UI responsive
    await new Promise(r => setTimeout(r, 10));
  }

  // Build factor accuracy table
  const factors  = {};
  const newWeights = {};

  for (const [factor, { wins, total }] of Object.entries(acc)) {
    if (total < 5) continue; // not enough data
    const accuracy = wins / total;
    factors[factor] = { wins, total, accuracy: +(accuracy * 100).toFixed(1) };
    // Weight: 0.3 floor (don't zero out), 0.95 ceiling
    newWeights[factor] = Math.min(0.95, Math.max(0.3, accuracy));
  }

  // Merge with existing weights (exponential moving average to avoid abrupt changes)
  const existingWeights = getWeights();
  const mergedWeights   = { ...existingWeights };
  for (const [f, w] of Object.entries(newWeights)) {
    mergedWeights[f] = existingWeights[f]
      ? +(existingWeights[f] * 0.7 + w * 0.3).toFixed(4)
      : +w.toFixed(4);
  }

  saveWeights(mergedWeights);

  _progress.running = false;
  onProgress?.({ ..._progress });

  return {
    factors,
    totalSignals: _progress.signals,
    trainedPairs: _progress.trained,
    weights:      mergedWeights,
  };
}

// ── Apply weights to a signal's confidence ────────────────

/**
 * Adjust a signal's confidence using learned weights
 * @param {Signal} signal
 * @returns {Signal} signal with adjusted conf
 */
export function applyWeights(signal) {
  if (!signal?.rsns?.length) return signal;
  const w = getWeights();
  if (!Object.keys(w).length) return signal; // no training data yet

  let bonus = 0;
  for (const rsn of signal.rsns) {
    if (w[rsn] !== undefined) {
      // weight > 0.6 → boost confidence; weight < 0.45 → reduce
      const delta = (w[rsn] - 0.5) * 20; // ±10 pts max per factor
      bonus += delta;
    }
  }

  const adjusted = Math.min(97, Math.max(0, Math.round(signal.conf + bonus)));
  return { ...signal, conf: adjusted, weightBonus: Math.round(bonus) };
}

// ── Training summary stats ────────────────────────────────

/**
 * Return a readable summary from stored weights
 * @returns {{ bestFactors: string[], worstFactors: string[], totalFactors: number }}
 */
export function trainingSummary() {
  const w = getWeights();
  const entries = Object.entries(w).sort((a, b) => b[1] - a[1]);
  return {
    bestFactors:  entries.slice(0, 3).map(([f, v]) => `${f} (${(v * 100).toFixed(0)}%)`),
    worstFactors: entries.slice(-3).map(([f, v]) => `${f} (${(v * 100).toFixed(0)}%)`),
    totalFactors: entries.length,
    weights:      Object.fromEntries(entries),
  };
}

/**
 * forecast.js — Projected trade entry zones
 *
 * "If price drops to $X, the bot would enter LONG at confidence Y%"
 *
 * This implements the "sweet spot entry" concept from the plan:
 *   - Wins happen when we buy at Fibonacci retracement levels or swing support
 *   - The bot projects which price levels would trigger a buy signal
 *   - Each projected zone shows: price, distance from current, estimated confidence,
 *     signal direction, and why that level is significant
 *
 * Book references:
 *   - Murphy (Technical Analysis ch. 14): Fibonacci retracements — 38.2%, 50%, 61.8%
 *     are the three most reliable pullback reversal zones
 *   - Schwager (Market Wizards): "Buy pullbacks, not breakouts in weak markets"
 *   - Lien (Day Trading Currency Market): confluence of S/R + Fib = highest probability entry
 *
 * How it works:
 *   For each candidate price level (Fib + swing support):
 *   1. Estimate what the RSI/MACD state would roughly be if price reached that level
 *   2. Score the level based on: Fib significance, support proximity, indicator context
 *   3. Return a list of ProjectedEntry objects sorted by confidence
 */

import { autoFibLevels, findSwingLevels } from './levels.js';

const MAX_PROJECTIONS = 5;   // max entries to show in panel
const MAX_DIST_PCT    = 12;  // only project levels within 12% of current price

/**
 * @typedef {Object} ProjectedEntry
 * @property {number}   price          - Entry price level
 * @property {number}   distPct        - Distance from current price (%)
 * @property {number}   confEstimate   - Estimated confidence if price reaches this level
 * @property {'LONG'|'SHORT'} dir
 * @property {string[]} reasons        - Why this level matters
 * @property {'fib'|'support'|'resistance'} type
 * @property {string}   label          - Human readable label e.g. "Fib 61.8%"
 */

/**
 * Project future entry zones based on Fibonacci levels and swing S/R
 * @param {Object[]} cs        - Candle array (recent last)
 * @param {Object}   currentSig - Current engine evaluation (EnrichedSignal)
 * @param {Object}   cfg       - Bot config { sigMin }
 * @returns {ProjectedEntry[]}
 */
export function projectEntries(cs, currentSig = null, cfg = {}) {
  if (!cs || cs.length < 30) return [];

  const price = cs[cs.length - 1].close;
  const fibs  = autoFibLevels(cs, 80);
  const { supports, resistances } = findSwingLevels(cs, 100);

  const candidates = [];

  // ── Fibonacci retracement levels (LONG setups — price pulling back) ──
  if (fibs) {
    const fibEntries = [
      { level: fibs.fib236, label: 'Fib 23.6%', baseConf: 55 },
      { level: fibs.fib382, label: 'Fib 38.2%', baseConf: 65 },
      { level: fibs.fib50,  label: 'Fib 50.0%', baseConf: 72 },
      { level: fibs.fib618, label: 'Fib 61.8%', baseConf: 78 },  // golden ratio
      { level: fibs.fib786, label: 'Fib 78.6%', baseConf: 62 },
    ];

    for (const { level, label, baseConf } of fibEntries) {
      if (!level || level >= price) continue; // only show levels below current price (buy dips)
      const distPct = (price - level) / price * 100;
      if (distPct > MAX_DIST_PCT) continue;

      const reasons = [label, 'Fibonacci retracement pullback'];

      // Boost confidence if also near a swing support
      let confBoost = 0;
      const nearSup = supports.find(s => Math.abs(s - level) / level < 0.005);
      if (nearSup) {
        reasons.push('Confluence with swing support');
        confBoost += 8;
      }

      // Boost if current regime is bullish
      if (currentSig?.regime === 'bull') {
        reasons.push('Bull regime — pullback likely to hold');
        confBoost += 5;
      }

      candidates.push({
        price:        +level.toFixed(6),
        distPct:      +distPct.toFixed(2),
        confEstimate: Math.min(94, baseConf + confBoost),
        dir:          'LONG',
        reasons,
        type:         'fib',
        label,
      });
    }
  }

  // ── Swing support levels (LONG setups) ──
  for (const sup of supports) {
    if (sup >= price) continue;
    const distPct = (price - sup) / price * 100;
    if (distPct > MAX_DIST_PCT) continue;

    // Skip if already covered by a Fib candidate within 0.5%
    const alreadyCovered = candidates.some(c => Math.abs(c.price - sup) / sup < 0.005);
    if (alreadyCovered) continue;

    const reasons = ['Swing support level', 'Prior price memory'];
    let   baseConf = 58;

    // Boost for regime alignment
    if (currentSig?.regime === 'bull') { reasons.push('Bull regime support'); baseConf += 5; }

    candidates.push({
      price:        +sup.toFixed(6),
      distPct:      +distPct.toFixed(2),
      confEstimate: Math.min(88, baseConf),
      dir:          'LONG',
      reasons,
      type:         'support',
      label:        'Swing S/R',
    });
  }

  // ── Swing resistance levels (SHORT setups — price rallying to resistance) ──
  for (const res of resistances) {
    if (res <= price) continue;
    const distPct = (res - price) / price * 100;
    if (distPct > MAX_DIST_PCT) continue;

    const reasons = ['Swing resistance level', 'Prior price rejection zone'];
    let   baseConf = 56;

    if (currentSig?.regime === 'bear') { reasons.push('Bear regime resistance'); baseConf += 5; }

    candidates.push({
      price:        +res.toFixed(6),
      distPct:      +distPct.toFixed(2),
      confEstimate: Math.min(86, baseConf),
      dir:          'SHORT',
      reasons,
      type:         'resistance',
      label:        'Swing R',
    });
  }

  // Sort by confidence descending, cap at MAX_PROJECTIONS
  return candidates
    .sort((a, b) => b.confEstimate - a.confEstimate)
    .slice(0, MAX_PROJECTIONS);
}

/**
 * Project exit levels for open paper trades (R:R display)
 * @param {Object[]} openTrades  - from paper.js paper.open
 * @param {Object}   prices      - { symbol: price }
 * @param {number}   atr         - current ATR value
 * @returns {Object[]} enriched trades with projectedRR, currentRR
 */
export function projectExits(openTrades, prices, atr = null) {
  return openTrades.map(t => {
    const sym      = t.key.split('_')[0];
    const curPrice = prices[sym] ?? t.cur ?? t.entry;
    const risk     = Math.abs(t.entry - t.sl);
    const reward   = Math.abs(t.tp2 - t.entry);

    // Current unrealised R:R (how far are we to target vs how close to SL)
    const currentMove = t.dir === 'LONG'
      ? curPrice - t.entry
      : t.entry - curPrice;

    const currentRR = risk > 0 ? +(currentMove / risk).toFixed(2) : 0;
    const projectedRR = risk > 0 ? +(reward / risk).toFixed(2) : 0;

    // ATR-adjusted trail level
    let trailPrice = null;
    if (t.tp1h && atr) {
      trailPrice = t.dir === 'LONG'
        ? curPrice - atr * 1.5
        : curPrice + atr * 1.5;
    }

    return {
      ...t,
      curPrice,
      currentRR,
      projectedRR,
      trailPrice: trailPrice ? +trailPrice.toFixed(6) : null,
      riskUSD:    +(risk * t.size / t.entry).toFixed(2),
      rewardUSD:  +(reward * t.size / t.entry).toFixed(2),
    };
  });
}

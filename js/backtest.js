/**
 * backtest.js — Historical strategy backtesting engine
 *
 * Runs the detect() strategy over fetched historical klines.
 * Simulates trade entry/exit with the same SL/TP/trailing logic as paper.js
 * but synchronously (no WebSocket, no state mutation).
 *
 * Entry rules:
 *   - Signal confidence >= cfg.sigMin
 *   - No open trade for same direction
 *   - Max 1 trade at a time (simplified)
 *
 * Exit rules (evaluated on each closed candle after entry):
 *   - SL hit            → 'Stop Loss'
 *   - TP1 hit           → move SL to breakeven, activate trailing
 *   - TP2 hit           → 'Take Profit 2'
 *   - Trailing stop hit → 'Trail Stop'
 *   - End of data       → 'End of Data'
 */

import { detect }      from './strategy.js';
import { fetchKlines } from './binance.js';
import { cfg }         from './state.js';

/**
 * Run a backtest on a symbol/interval
 * @param {string} symbol   - e.g. 'BTCUSDT'
 * @param {string} interval - e.g. '4h'
 * @param {number} limit    - Number of historical candles (max 1000)
 * @returns {Promise<BTResult>}
 *
 * @typedef {Object} BTResult
 * @property {BTTrade[]} trades
 * @property {number}    finalBal
 * @property {number}    wr          - Win rate %
 * @property {number}    totalPnl
 * @property {number}    maxDD       - Max drawdown %
 * @property {number}    sharpe      - Simplified Sharpe (mean/std of trade returns)
 * @property {string}    symbol
 * @property {string}    interval
 * @property {number}    candles     - Total candles tested
 */
export async function runBacktest(symbol, interval, limit = 500) {
  const raw = await fetchKlines(symbol, interval, limit);
  if (raw.length < 60) {
    return { error: 'Not enough data', trades: [], symbol, interval, candles: raw.length };
  }

  const trades   = [];
  let   bal      = 10000;
  let   peak     = 10000;
  let   maxDD    = 0;

  let open = null; // current simulated trade

  // Walk candles starting at index 50 (enough for all indicators)
  for (let i = 50; i < raw.length; i++) {
    const candle  = raw[i];
    const price   = candle.close;
    const history = raw.slice(0, i + 1);

    // ── If we have an open trade, check exit conditions ──
    if (open) {
      let closeReason = null;
      let closePrice  = price;

      // 1. Stop loss
      if (open.dir === 'LONG'  && price <= open.sl) { closeReason = 'Stop Loss'; closePrice = open.sl; }
      if (open.dir === 'SHORT' && price >= open.sl) { closeReason = 'Stop Loss'; closePrice = open.sl; }

      if (!closeReason) {
        // 2. TP1 → breakeven
        if (!open.tp1h) {
          const hit = open.dir === 'LONG' ? price >= open.tp1 : price <= open.tp1;
          if (hit) { open.tp1h = true; open.sl = open.entry; open.be = true; }
        }

        // 3. TP2 → close
        if (open.tp1h && !open.tp2h) {
          const hit = open.dir === 'LONG' ? price >= open.tp2 : price <= open.tp2;
          if (hit) { open.tp2h = true; closeReason = 'Take Profit 2'; }
        }

        // 4. Trailing stop (after TP1)
        if (open.tp1h && !closeReason) {
          if (open.dir === 'LONG') {
            const trail = price * (1 - cfg.trail);
            if (trail > open.sl) open.sl = trail;
            if (price <= open.sl) { closeReason = 'Trail Stop'; closePrice = open.sl; }
          } else {
            const trail = price * (1 + cfg.trail);
            if (trail < open.sl) open.sl = trail;
            if (price >= open.sl) { closeReason = 'Trail Stop'; closePrice = open.sl; }
          }
        }

        // 5. Signal reversal (only after TP1 — protect profits)
        const sig = detect(history);
        if (open.tp1h && !closeReason && sig?.dir && sig.dir !== open.dir && sig.conf >= cfg.sigMin) {
          closeReason = 'Signal Reversal';
        }
      }

      if (closeReason) {
        const pp  = open.dir === 'LONG'
          ? (closePrice - open.entry) / open.entry
          : (open.entry - closePrice) / open.entry;
        const pnl = open.size * pp;

        bal += open.size + pnl;
        if (bal > peak) peak = bal;
        const dd = (peak - bal) / peak * 100;
        if (dd > maxDD) maxDD = dd;

        trades.push({
          dir:    open.dir,
          entry:  open.entry,
          exit:   closePrice,
          size:   open.size,
          pnl:    +pnl.toFixed(2),
          pct:    +(pp * 100).toFixed(2),
          reason: closeReason,
          sig:    open.sig,
          conf:   open.conf,
          i,
        });
        open = null;
      }
    }

    // ── Try to enter a new trade (only if no open position) ──
    if (!open) {
      const signal = detect(history);
      if (signal && signal.dir && signal.conf >= cfg.sigMin) {
        const riskAmt = bal * cfg.risk;
        const size    = Math.min(riskAmt / cfg.sl, bal * 0.15);
        if (bal >= size && size > 0) {
          bal -= size;
          open = {
            dir:   signal.dir,
            entry: price,
            size,
            sig:   signal.sig,
            conf:  signal.conf,
            sl:    signal.dir === 'LONG' ? price * (1 - cfg.sl)      : price * (1 + cfg.sl),
            tp1:   signal.dir === 'LONG' ? price * (1 + cfg.tp * .5) : price * (1 - cfg.tp * .5),
            tp2:   signal.dir === 'LONG' ? price * (1 + cfg.tp)      : price * (1 - cfg.tp),
            tp1h: false, tp2h: false, be: false,
          };
        }
      }
    }
  }

  // Close any still-open trade at end of data
  if (open) {
    const lastPrice = raw[raw.length - 1].close;
    const pp  = open.dir === 'LONG'
      ? (lastPrice - open.entry) / open.entry
      : (open.entry - lastPrice) / open.entry;
    const pnl = open.size * pp;
    bal += open.size + pnl;
    trades.push({
      dir:    open.dir,
      entry:  open.entry,
      exit:   lastPrice,
      size:   open.size,
      pnl:    +pnl.toFixed(2),
      pct:    +(pp * 100).toFixed(2),
      reason: 'End of Data',
      sig:    open.sig,
      conf:   open.conf,
      i:      raw.length - 1,
    });
  }

  // ── Compute summary stats ──
  const wins     = trades.filter(t => t.pnl > 0);
  const totalPnl = trades.reduce((a, t) => a + t.pnl, 0);
  const wr       = trades.length ? (wins.length / trades.length * 100) : 0;

  // Simplified Sharpe: mean return / std of returns (annualised approximation skipped for simplicity)
  let sharpe = 0;
  if (trades.length >= 2) {
    const returns = trades.map(t => t.pct);
    const mean    = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std     = Math.sqrt(returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length);
    sharpe = std > 0 ? +(mean / std).toFixed(2) : 0;
  }

  return {
    trades,
    finalBal:  +bal.toFixed(2),
    wr:        +wr.toFixed(1),
    totalPnl:  +totalPnl.toFixed(2),
    maxDD:     +maxDD.toFixed(1),
    sharpe,
    symbol,
    interval,
    candles: raw.length,
  };
}

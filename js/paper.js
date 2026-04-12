/**
 * paper.js — Paper trading engine
 *
 * Manages virtual trades using real Binance market data.
 * No real orders are ever placed.
 *
 * Trade lifecycle:
 *   tryEnter() → trade added to paper.open[]
 *   monitorTrades() → called on each closed candle:
 *     - Stop loss hit         → closeTrade('Stop Loss')
 *     - TP1 hit               → move SL to breakeven, activate trailing
 *     - TP2 hit               → closeTrade('Take Profit 2')
 *     - Trailing stop hit     → closeTrade('Trail Stop')
 *     - Signal reversal ≥72%  → closeTrade('Signal Reversal')
 *   closeTrade() → trade moved to paper.closed[], P&L calculated
 */

import { paper, savePaper, cfg } from './state.js';

const MAX_CLOSED_HISTORY = 200;

/**
 * Attempt to enter a paper trade
 * @param {string} key    - e.g. 'BTCUSDT_4h'
 * @param {Object} signal - Signal from strategy.detect()
 * @param {number} price  - Current close price
 * @returns {{ ok: boolean, reason?: string }}
 */
export function tryEnter(key, signal, price) {
  if (paper.open.length >= cfg.maxTrades)
    return { ok: false, reason: `Max trades (${cfg.maxTrades}) reached` };
  if (paper.open.find(t => t.key === key))
    return { ok: false, reason: 'Already in trade on this pair/TF' };
  if (paper.bal < 200)
    return { ok: false, reason: 'Insufficient paper balance' };
  if (!signal.dir || signal.conf < cfg.sigMin)
    return { ok: false, reason: 'Signal below minimum confidence threshold' };

  // Position sizing: risk a fixed % of balance, adjusted by SL distance
  const riskAmt = paper.bal * cfg.risk;
  const size    = Math.min(riskAmt / cfg.sl, paper.bal * 0.15); // cap at 15% of balance

  const trade = {
    id:       Date.now(),
    key,
    pair:     key.split('_')[0].replace('USDT', '/USDT'),
    tf:       key.split('_')[1],
    dir:      signal.dir,
    sig:      signal.sig,
    conf:     signal.conf,
    rsns:     signal.rsns ?? [],
    entry:    price,
    cur:      price,
    size,
    sl:  signal.dir === 'LONG' ? price * (1 - cfg.sl)      : price * (1 + cfg.sl),
    tp1: signal.dir === 'LONG' ? price * (1 + cfg.tp * .5) : price * (1 - cfg.tp * .5),
    tp2: signal.dir === 'LONG' ? price * (1 + cfg.tp)      : price * (1 - cfg.tp),
    tp1h: false, tp2h: false, be: false, trail: false,
    opened: new Date().toISOString(),
    status: 'Monitoring entry conditions',
  };

  paper.bal -= size;
  paper.open.push(trade);
  savePaper();
  return { ok: true, trade };
}

/**
 * Monitor all open trades for a given key on closed candle
 * @param {string} key    - e.g. 'BTCUSDT_4h'
 * @param {number} price  - Current close price
 * @param {Object|null} currentSignal - Latest signal (for reversal detection)
 * @returns {string[]} - Close reasons for any trades that were closed
 */
export function monitorTrades(key, price, currentSignal = null) {
  const affected = paper.open.filter(t => t.key === key);
  const closed   = [];

  for (const t of affected) {
    t.cur = price;

    let closeReason = null;
    let closePrice  = price;

    // ── 1. Stop Loss ─────────────────────────────
    if (t.dir === 'LONG'  && price <= t.sl) { closeReason = 'Stop Loss'; closePrice = t.sl; }
    if (t.dir === 'SHORT' && price >= t.sl) { closeReason = 'Stop Loss'; closePrice = t.sl; }

    if (!closeReason) {
      // ── 2. TP1 hit → breakeven ─────────────────
      if (!t.tp1h) {
        const hit = t.dir === 'LONG' ? price >= t.tp1 : price <= t.tp1;
        if (hit) {
          t.tp1h  = true;
          t.sl    = t.entry;   // move SL to breakeven
          t.be    = true;
          t.status = '✅ TP1 hit — SL at breakeven';
          window.dispatchEvent(new CustomEvent('nexai:trade-event', {
            detail: { type: 'tp1', trade: t },
          }));
        }
      }

      // ── 3. TP2 hit → close ─────────────────────
      if (t.tp1h && !t.tp2h) {
        const hit = t.dir === 'LONG' ? price >= t.tp2 : price <= t.tp2;
        if (hit) { t.tp2h = true; closeReason = 'Take Profit 2'; }
      }

      // ── 4. Trailing stop (activated after TP1) ──
      if (t.tp1h && !closeReason) {
        t.trail = true;
        if (t.dir === 'LONG') {
          const trail = price * (1 - cfg.trail);
          if (trail > t.sl) { t.sl = trail; t.status = `Trailing → $${fmt(trail)}`; }
          if (price <= t.sl) { closeReason = 'Trail Stop'; closePrice = t.sl; }
        } else {
          const trail = price * (1 + cfg.trail);
          if (trail < t.sl) { t.sl = trail; t.status = `Trailing → $${fmt(trail)}`; }
          if (price >= t.sl) { closeReason = 'Trail Stop'; closePrice = t.sl; }
        }
      }

      // ── 5. Signal reversal ──────────────────────
      if (!closeReason && currentSignal?.dir &&
          currentSignal.dir !== t.dir &&
          currentSignal.conf >= cfg.sigMin) {
        closeReason = 'Signal Reversal';
        t.status    = `⚠️ Reversal signal (${currentSignal.sig}) — closing`;
      }
    }

    if (closeReason) {
      closeTrade(t, closePrice, closeReason);
      closed.push(closeReason);
    }
  }

  if (affected.length) savePaper();
  return closed;
}

/**
 * Close a paper trade and calculate P&L
 * @param {Object} trade
 * @param {number} price
 * @param {string} reason
 * @returns {Object} closed trade
 */
export function closeTrade(trade, price, reason) {
  const pp  = trade.dir === 'LONG'
    ? (price - trade.entry) / trade.entry
    : (trade.entry - price) / trade.entry;
  const pnl = trade.size * pp;

  paper.bal += trade.size + pnl;
  if (paper.bal > paper.peak) paper.peak = paper.bal;

  Object.assign(trade, {
    exit:   price,
    pnl,
    pct:    pp * 100,
    reason,
    closed: new Date().toISOString(),
  });

  paper.open   = paper.open.filter(t => t.id !== trade.id);
  paper.closed.unshift(trade);
  if (paper.closed.length > MAX_CLOSED_HISTORY) paper.closed.pop();

  window.dispatchEvent(new CustomEvent('nexai:trade-event', {
    detail: { type: 'close', trade },
  }));

  savePaper();
  return trade;
}

/**
 * Close all open paper trades at current prices
 * @param {Object} priceMap - { BTCUSDT: 67000, ... }
 */
export function closeAllTrades(priceMap) {
  const toClose = [...paper.open];
  for (const t of toClose) {
    const sym   = t.key.split('_')[0];
    const price = priceMap[sym] ?? t.cur ?? t.entry;
    closeTrade(t, price, 'Manual Close');
  }
}

/**
 * Get paper portfolio performance stats
 * @returns {Object}
 */
export function paperStats() {
  const cl    = paper.closed;
  const wins  = cl.filter(t => t.pnl > 0);
  const totalPnl  = cl.reduce((a, t) => a + (t.pnl ?? 0), 0);
  const totalBal  = paper.bal + paper.open.reduce((a, t) => a + t.size, 0);
  const dd    = paper.peak > 0
    ? ((paper.peak - totalBal) / paper.peak * 100).toFixed(1)
    : '0.0';
  return {
    wr:   cl.length ? (wins.length / cl.length * 100).toFixed(1) : '—',
    totalPnl, w: wins.length, l: cl.length - wins.length,
    tot: cl.length, totalBal, dd,
  };
}

function fmt(p) {
  if (p == null) return '—';
  if (p < 0.001) return p.toFixed(8);
  if (p < 1)     return p.toFixed(5);
  if (p < 100)   return p.toFixed(3);
  return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

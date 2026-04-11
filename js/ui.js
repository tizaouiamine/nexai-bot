/**
 * ui.js — All DOM rendering functions
 *
 * Pure side-effect functions that read from state and update the DOM.
 * Never import from app.js (no circular deps).
 * Uses textContent / createElement — never innerHTML with user data.
 */

import { paper, sigs, prices, scanRows, cfg, mode } from './state.js';
import { paperStats } from './paper.js';

// ── Formatters ────────────────────────────────────────────

function fmt(p) {
  if (p == null) return '—';
  if (Math.abs(p) < 0.001) return p.toFixed(8);
  if (Math.abs(p) < 1)     return p.toFixed(5);
  if (Math.abs(p) < 100)   return p.toFixed(3);
  return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(v) {
  if (v == null) return '—';
  const s = (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
  return s;
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// ── Scanner table ─────────────────────────────────────────

/**
 * Render (or update) the scanner table
 * @param {HTMLElement} tbody
 */
export function renderScanner(tbody) {
  if (!tbody) return;
  const rows = Object.values(scanRows);
  if (!rows.length) {
    tbody.innerHTML = '';
    const tr = tbody.insertRow();
    const td = tr.insertCell();
    td.colSpan = 7;
    td.textContent = 'Scanning pairs…';
    td.style.textAlign = 'center';
    td.style.color = 'var(--muted)';
    return;
  }

  // Sort by confidence desc
  rows.sort((a, b) => (b.conf ?? 0) - (a.conf ?? 0));

  // Keyed update — only redraw changed rows
  const existing = {};
  for (const tr of tbody.rows) existing[tr.dataset.key] = tr;

  const seen = new Set();
  rows.forEach((row, idx) => {
    seen.add(row.key);
    let tr = existing[row.key];
    if (!tr) {
      tr = tbody.insertRow(idx);
      tr.dataset.key = row.key;
    } else if (tr.rowIndex !== idx) {
      tbody.insertBefore(tr, tbody.rows[idx] ?? null);
    }

    const sig     = row.sig ?? 'NEUTRAL';
    const sigCls  = sig.includes('STRONG') ? (sig.includes('BUY') ? 'badge-strong-buy' : 'badge-strong-sell')
                  : sig.includes('BUY')    ? 'badge-buy'
                  : sig.includes('SELL')   ? 'badge-sell'
                  : 'badge-neutral';

    tr.innerHTML = '';
    const cells = [
      row.pair ?? row.key,
      row.tf,
      `$${fmt(row.price)}`,
      `${row.conf ?? '—'}%`,
      sig,
      `${row.rsi?.toFixed(1) ?? '—'}`,
      row.trend ?? '—',
    ];
    cells.forEach((text, i) => {
      const td = tr.insertCell();
      if (i === 4) {
        const badge = el('span', `badge ${sigCls}`, text);
        td.appendChild(badge);
      } else {
        td.textContent = text;
      }
      if (i === 5) {
        const rsi = row.rsi;
        if (rsi != null) td.style.color = rsi > 70 ? 'var(--sell)' : rsi < 30 ? 'var(--buy)' : '';
      }
    });
    tr.style.cursor = 'pointer';
    tr.dataset.sym = row.sym;
    tr.dataset.tf  = row.tf;
  });

  // Remove stale rows
  for (const [key, tr] of Object.entries(existing)) {
    if (!seen.has(key)) tr.remove();
  }
}

// ── Open positions (paper) ────────────────────────────────

export function renderOpenPos(container) {
  if (!container) return;
  container.innerHTML = '';

  if (!paper.open.length) {
    const p = el('p', 'no-trades', 'No open positions');
    container.appendChild(p);
    return;
  }

  for (const t of paper.open) {
    const pp  = t.dir === 'LONG'
      ? (t.cur - t.entry) / t.entry * 100
      : (t.entry - t.cur) / t.entry * 100;
    const pnl = t.size * pp / 100;

    const card = el('div', `trade-card ${pp >= 0 ? 'trade-win' : 'trade-loss'}`);

    const header = el('div', 'trade-header');
    header.appendChild(el('span', 'trade-pair', t.pair));
    header.appendChild(el('span', `badge ${t.dir === 'LONG' ? 'badge-buy' : 'badge-sell'}`, t.dir));
    header.appendChild(el('span', 'trade-tf', t.tf));
    card.appendChild(header);

    const body = el('div', 'trade-body');
    const rows = [
      ['Entry',  `$${fmt(t.entry)}`],
      ['Current','$' + fmt(t.cur)],
      ['SL',     `$${fmt(t.sl)}`],
      ['TP2',    `$${fmt(t.tp2)}`],
      ['P&L',    `${fmtPct(pp)} / $${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}`],
      ['Status', t.status ?? '—'],
    ];
    for (const [label, value] of rows) {
      const row = el('div', 'trade-row');
      row.appendChild(el('span', 'trade-label', label));
      const val = el('span', 'trade-value', value);
      if (label === 'P&L') val.style.color = pnl >= 0 ? 'var(--buy)' : 'var(--sell)';
      row.appendChild(val);
      body.appendChild(row);
    }
    card.appendChild(body);
    container.appendChild(card);
  }
}

// ── Closed trade history ──────────────────────────────────

export function renderSimHist(tbody) {
  if (!tbody) return;
  tbody.innerHTML = '';

  const cl = paper.closed.slice(0, 50);
  if (!cl.length) {
    const tr  = tbody.insertRow();
    const td  = tr.insertCell();
    td.colSpan = 7;
    td.textContent = 'No closed trades yet.';
    td.style.textAlign = 'center';
    td.style.color = 'var(--muted)';
    return;
  }

  for (const t of cl) {
    const tr  = tbody.insertRow();
    const win = t.pnl >= 0;
    tr.className = win ? 'row-win' : 'row-loss';

    const cells = [
      t.pair ?? t.key,
      t.dir,
      `$${fmt(t.entry)}`,
      `$${fmt(t.exit)}`,
      (t.pct >= 0 ? '+' : '') + t.pct?.toFixed(2) + '%',
      (t.pnl >= 0 ? '+$' : '-$') + Math.abs(t.pnl).toFixed(2),
      t.reason,
    ];
    cells.forEach((text, i) => {
      const td = tr.insertCell();
      td.textContent = text;
      if (i === 1) td.style.color = t.dir === 'LONG' ? 'var(--buy)' : 'var(--sell)';
      if (i === 4 || i === 5) td.style.color = win ? 'var(--buy)' : 'var(--sell)';
    });
  }
}

// ── Portfolio stats bar ───────────────────────────────────

export function renderSimStats(container) {
  if (!container) return;
  const s = paperStats();
  container.innerHTML = '';

  const items = [
    ['Balance',  `$${fmt(s.totalBal)}`],
    ['Total P&L', (s.totalPnl >= 0 ? '+$' : '-$') + Math.abs(s.totalPnl).toFixed(2)],
    ['Win Rate', s.wr + '%'],
    ['Trades',   `${s.w}W / ${s.l}L`],
    ['Max DD',   s.dd + '%'],
  ];

  for (const [label, value] of items) {
    const item = el('div', 'stat-item');
    item.appendChild(el('span', 'stat-label', label));
    item.appendChild(el('span', 'stat-value', value));
    container.appendChild(item);
  }
}

// ── Backtest results ──────────────────────────────────────

export function renderBT(container, result) {
  if (!container) return;
  container.innerHTML = '';

  if (result.error) {
    container.appendChild(el('p', 'error-msg', result.error));
    return;
  }

  // Summary cards
  const stats = el('div', 'bt-stats');
  const items = [
    ['Symbol',    `${result.symbol} ${result.interval}`],
    ['Candles',   result.candles],
    ['Trades',    result.trades.length],
    ['Win Rate',  result.wr + '%'],
    ['Final Bal', `$${fmt(result.finalBal)}`],
    ['Total P&L', (result.totalPnl >= 0 ? '+$' : '-$') + Math.abs(result.totalPnl).toFixed(2)],
    ['Max DD',    result.maxDD + '%'],
    ['Sharpe',    result.sharpe],
  ];
  for (const [label, value] of items) {
    const card = el('div', 'bt-stat-card');
    card.appendChild(el('div', 'bt-stat-label', label));
    const v = el('div', 'bt-stat-value', value);
    if (label === 'Total P&L') v.style.color = result.totalPnl >= 0 ? 'var(--buy)' : 'var(--sell)';
    if (label === 'Win Rate')  v.style.color = result.wr >= 50      ? 'var(--buy)' : 'var(--sell)';
    card.appendChild(v);
    stats.appendChild(card);
  }
  container.appendChild(stats);

  // Trade table
  if (!result.trades.length) {
    container.appendChild(el('p', 'no-trades', 'No trades generated. Try lowering sigMin or using more candles.'));
    return;
  }

  const table  = document.createElement('table');
  table.className = 'bt-table';
  const thead = table.createTHead();
  const hRow  = thead.insertRow();
  ['#', 'Dir', 'Entry', 'Exit', 'P&L %', 'P&L $', 'Reason', 'Signal'].forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    hRow.appendChild(th);
  });

  const tbody = table.createTBody();
  result.trades.forEach((t, idx) => {
    const tr  = tbody.insertRow();
    const win = t.pnl >= 0;
    tr.className = win ? 'row-win' : 'row-loss';

    [
      idx + 1,
      t.dir,
      `$${fmt(t.entry)}`,
      `$${fmt(t.exit)}`,
      (t.pct >= 0 ? '+' : '') + t.pct + '%',
      (t.pnl >= 0 ? '+$' : '-$') + Math.abs(t.pnl).toFixed(2),
      t.reason,
      `${t.sig} (${t.conf}%)`,
    ].forEach((text, i) => {
      const td = tr.insertCell();
      td.textContent = text;
      if (i === 1) td.style.color = t.dir === 'LONG' ? 'var(--buy)' : 'var(--sell)';
      if (i === 4 || i === 5) td.style.color = win ? 'var(--buy)' : 'var(--sell)';
    });
  });

  container.appendChild(table);
}

// ── Signal feed (live tab) ────────────────────────────────

const MAX_FEED = 50;

export function addSigFeed(container, { pair, tf, sig, conf, dir, price, rsns }) {
  if (!container) return;
  const item = el('div', `feed-item ${dir === 'LONG' ? 'feed-long' : dir === 'SHORT' ? 'feed-short' : 'feed-neutral'}`);

  const left = el('div', 'feed-left');
  left.appendChild(el('span', 'feed-pair', pair ?? '—'));
  left.appendChild(el('span', 'feed-tf', tf));

  const right = el('div', 'feed-right');
  right.appendChild(el('span', `badge ${sig?.includes('STRONG') ? (dir === 'LONG' ? 'badge-strong-buy' : 'badge-strong-sell') : dir === 'LONG' ? 'badge-buy' : dir === 'SHORT' ? 'badge-sell' : 'badge-neutral'}`, sig ?? 'NEUTRAL'));
  right.appendChild(el('span', 'feed-conf', conf + '%'));
  right.appendChild(el('span', 'feed-price', '$' + fmt(price)));

  item.appendChild(left);
  item.appendChild(right);

  if (rsns?.length) {
    const reasons = el('div', 'feed-reasons', rsns.join(' · '));
    item.appendChild(reasons);
  }

  container.prepend(item);

  // Trim old entries
  while (container.children.length > MAX_FEED) {
    container.lastElementChild?.remove();
  }
}

// ── Header stats ──────────────────────────────────────────

export function refreshHeaderStats({ wsCount, sigTotal, botOn }) {
  const wsEl  = document.getElementById('ws-count');
  const sigEl = document.getElementById('sig-count');
  const botEl = document.getElementById('bot-status');

  if (wsEl)  wsEl.textContent  = wsCount ?? 0;
  if (sigEl) sigEl.textContent = sigTotal ?? 0;
  if (botEl) {
    botEl.textContent = botOn ? 'BOT ON' : 'BOT OFF';
    botEl.className   = `badge ${botOn ? 'badge-buy' : 'badge-sell'}`;
  }
}

// ── Insight rotator ───────────────────────────────────────

const INSIGHTS = [
  'EMA 9/21 crossover confirms short-term momentum shift.',
  'RSI < 30 signals potential oversold reversal zone.',
  'MACD histogram crossing zero is a high-confluence entry trigger.',
  'Volume spike on breakout increases signal reliability by ~18%.',
  'Trailing stop locks in profit after TP1 while letting winners run.',
  'Multi-timeframe confluence (1h + 4h) reduces false signal rate.',
  'Bollinger Band squeeze often precedes a strong directional move.',
  'Paper trading first — validate before risking real capital.',
];

let insightIdx = 0;
export function rotateInsight() {
  const el = document.getElementById('insight-text');
  if (!el) return;
  el.textContent = INSIGHTS[insightIdx % INSIGHTS.length];
  insightIdx++;
}

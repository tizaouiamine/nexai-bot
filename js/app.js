/**
 * app.js — Main application entry point
 *
 * Bug fixes vs v1:
 *   - cfg.sigMin was undefined (config had minConf) → fixed in config.js
 *   - Tab switching used inline style only, CSS .active class never toggled → fixed
 *   - Chart never loaded on startup → openChart('BTCUSDT','4h') called in init
 *   - renderSimStats cleared static HTML → now updates elements by ID
 *   - botOn/sigTotal are primitive imports (stale after mutation) → use state module ref
 *   - bootstrapPair sequential loop → parallel with Promise.all (10× faster load)
 *   - Engine integration: evaluate() wraps detect() with AI filters
 */

import { PAIRS, STORAGE_KEYS }                        from './config.js';
import * as S from './state.js';
import { detect }                                      from './strategy.js';
import { evaluate, isTradeable }                       from './engine.js';
import { fetchKlines, startWS }                        from './binance.js';
import { tryEnter, monitorTrades, closeAllTrades, paperStats } from './paper.js';
import { runBacktest }                                 from './backtest.js';
import {
  renderScanner, renderOpenPos, renderSimHist,
  renderBT, addSigFeed, refreshHeaderStats, rotateInsight,
} from './ui.js';
import { sendChat } from './chat.js';

// ── DOM cache ─────────────────────────────────────────────
const $  = id => document.getElementById(id);
let scannerTbody, simOpenCont, simHistTbody, simStatsCont;
let feedCont, chatMsgs, chatInput, btResultCont;
let priceChart = null;

// ── Per-pair HTF candle cache (for MTF engine) ────────────
const htfCandles = {};  // 'BTCUSDT' → candle[] on '1d'
const HTF        = '1d';

// ── Init ─────────────────────────────────────────────────

async function init() {
  scannerTbody  = $('scanner-tbody');
  simOpenCont   = $('sim-open');
  simHistTbody  = $('sim-hist-tbody');
  simStatsCont  = $('sim-stats');
  feedCont      = $('signal-feed');
  chatMsgs      = $('chat-messages');
  chatInput     = $('chat-input');
  btResultCont  = $('bt-result');

  // Restore API key
  const storedKey = localStorage.getItem(STORAGE_KEYS.apiKey);
  if (storedKey) {
    S.setApiKey(storedKey);
    const ki = $('api-key-input');
    if (ki) ki.value = storedKey;
    updateKeyBadge(true);
  }

  bindConfigPanel();
  bindChat();
  bindTabs();
  bindBotToggle();
  bindBacktest();

  // Scanner row click → chart
  scannerTbody?.addEventListener('click', e => {
    const tr = e.target.closest('tr[data-sym]');
    if (!tr) return;
    openChart(tr.dataset.sym, tr.dataset.tf || '4h');
    updateChartLabel(tr.dataset.sym, tr.dataset.tf || '4h');
  });

  $('close-all-btn')?.addEventListener('click', () => {
    closeAllTrades(S.prices);
    renderSimUI();
  });

  $('reset-paper-btn')?.addEventListener('click', () => {
    if (!confirm('Reset paper trading portfolio to $10,000?')) return;
    S.resetPaper();
    renderSimUI();
  });

  // Bootstrap pairs in PARALLEL (fixes slow sequential load)
  await Promise.all(
    PAIRS.map(sym => bootstrapPair(sym, S.cfg.tf))
  );

  // Auto-load BTC chart on startup
  await openChart('BTCUSDT', S.cfg.tf);
  updateChartLabel('BTCUSDT', S.cfg.tf);

  // Register global event listeners
  window.addEventListener('nexai:candle',      onCandle);
  window.addEventListener('nexai:trade-event', onTradeEvent);

  // UI refresh loop — 2s tick
  setInterval(refreshUI, 2000);

  // Insight rotator
  rotateInsight();
  setInterval(rotateInsight, 12000);

  refreshHeaderStats({ wsCount: S.wsCount, sigTotal: S.sigTotal, botOn: S.botOn });
}

// ── Pair bootstrap ────────────────────────────────────────

async function bootstrapPair(symbol, interval) {
  const key = `${symbol}_${interval}`;
  const [hist, htf] = await Promise.all([
    fetchKlines(symbol, interval, 250),
    fetchKlines(symbol, HTF, 250),          // HTF for engine MTF filter
  ]);
  if (hist.length) {
    S.candles[key] = hist;
    htfCandles[symbol] = htf;

    const ev = evaluate(hist, htf.length ? htf : null);
    if (ev) {
      S.sigs[key] = ev;
      S.prices[symbol] = hist[hist.length - 1].close;
      const pair = symbol.replace('USDT', '/USDT');
      S.scanRows[key] = { key, sym: symbol, pair, tf: interval, ...ev };
    }
  }
  startWS(symbol, interval);
}

// ── Candle event handler ──────────────────────────────────

function onCandle(e) {
  const { key, symbol, interval, candle } = e.detail;
  if (!candle.closed) return;

  const cs = S.candles[key];
  if (!cs || cs.length < 50) return;

  // Full AI engine evaluation (with MTF)
  const ev = evaluate(cs, htfCandles[symbol] ?? null);
  if (!ev) return;

  S.sigs[key]      = ev;
  S.prices[symbol] = candle.close;
  S.incSigTotal();

  const pair = symbol.replace('USDT', '/USDT');
  S.scanRows[key] = { key, sym: symbol, pair, tf: interval, ...ev };

  // Signal feed — only strong actionable signals
  if (ev.dir && ev.conf >= 55) {
    addSigFeed(feedCont, { pair, tf: interval, ...ev });
  }

  // Paper trading bot (simulation mode, bot on)
  if (S.botOn && S.mode === 'simulation') {
    monitorTrades(key, candle.close, ev);

    // Engine gate: only enter if AI filters pass
    if (isTradeable(ev, S.cfg.sigMin)) {
      const result = tryEnter(key, ev, candle.close);
      if (result.ok) {
        console.info(`[Bot] ${ev.dir} entered on ${key} @ ${candle.close} | score=${ev.engineScore} regime=${ev.regime}`);
      }
    }
  }

  // Update chart if this is the currently viewed pair
  if (symbol === S.chartSym && interval === S.chartTF) {
    updatePriceChart();
  }
}

// ── Trade event handler ───────────────────────────────────

function onTradeEvent(e) {
  const { type } = e.detail;
  if (type === 'close' || type === 'tp1') renderSimUI();
}

// ── UI refresh (2s tick) ──────────────────────────────────

function refreshUI() {
  // Read fresh from module (not stale primitive)
  refreshHeaderStats({ wsCount: S.wsCount, sigTotal: S.sigTotal, botOn: S.botOn });

  if (S.mode === 'live')       renderScanner(scannerTbody);
  if (S.mode === 'simulation') renderSimUI();
}

function renderSimUI() {
  renderOpenPos(simOpenCont);
  renderSimHist(simHistTbody);
  updateSimStats();
}

// ── Sim stats — update existing DOM elements by ID ────────

function updateSimStats() {
  const s   = paperStats();
  const fmt = v => v == null ? '—' : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const setBal = $('stat-bal');
  const setPnl = $('stat-pnl');
  const setWr  = $('stat-wr');
  const setTot = $('stat-trades');
  const setDD  = $('stat-dd');

  if (setBal) { setBal.textContent = '$' + fmt(s.totalBal); setBal.style.color = s.totalBal >= 10000 ? 'var(--buy)' : 'var(--sell)'; }
  if (setPnl) { setPnl.textContent = (s.totalPnl >= 0 ? '+$' : '-$') + Math.abs(s.totalPnl).toFixed(2); setPnl.style.color = s.totalPnl >= 0 ? 'var(--buy)' : 'var(--sell)'; }
  if (setWr)  { setWr.textContent  = s.wr + '%'; setWr.style.color = parseFloat(s.wr) >= 50 ? 'var(--buy)' : 'var(--sell)'; }
  if (setTot) { setTot.textContent = s.tot; }
  if (setDD)  { setDD.textContent  = s.dd + '%'; setDD.style.color = parseFloat(s.dd) > 10 ? 'var(--sell)' : 'var(--buy)'; }
}

// ── Price chart ───────────────────────────────────────────

async function openChart(symbol, interval) {
  S.setChartSym(symbol);
  S.setChartTF(interval);
  const key = `${symbol}_${interval}`;
  const cs  = S.candles[key]?.length ? S.candles[key] : await fetchKlines(symbol, interval, 120);
  if (cs.length) {
    S.candles[key] = cs;
    buildPriceChart(cs, symbol, interval);
  }
}

function buildPriceChart(cs, symbol, interval) {
  const canvas = $('price-chart');
  if (!canvas) return;
  if (priceChart) { priceChart.destroy(); priceChart = null; }

  const labels = cs.map(c => new Date(c.time).toLocaleDateString([], { month: 'short', day: 'numeric' }));
  const closes = cs.map(c => c.close);

  priceChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `${symbol} ${interval}`,
        data:  closes,
        borderColor: '#00c9ff',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.1,
        fill: { target: 'origin', above: 'rgba(0,201,255,0.04)' },
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `$${ctx.raw?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          },
        },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 8, color: '#888' }, grid: { color: '#1e2a3a' } },
        y: { ticks: { color: '#888', callback: v => '$' + v.toLocaleString() }, grid: { color: '#1e2a3a' } },
      },
    },
  });
  S.setPChart(priceChart);
}

function updatePriceChart() {
  if (!priceChart) return;
  const cs = S.candles[`${S.chartSym}_${S.chartTF}`];
  if (!cs?.length) return;
  const last = cs[cs.length - 1];
  const ds   = priceChart.data.datasets[0];
  const lbl  = new Date(last.time).toLocaleDateString([], { month: 'short', day: 'numeric' });
  if (priceChart.data.labels.at(-1) === lbl) {
    ds.data[ds.data.length - 1] = last.close;
  } else {
    priceChart.data.labels.push(lbl);
    ds.data.push(last.close);
    if (priceChart.data.labels.length > 150) { priceChart.data.labels.shift(); ds.data.shift(); }
  }
  priceChart.update('none');
}

function updateChartLabel(sym, tf) {
  const el = $('chart-label');
  if (el) el.textContent = `${sym} ${tf}`;
}

// ── Config panel ──────────────────────────────────────────

function bindConfigPanel() {
  // Initialize inputs from current cfg
  const set = (id, val) => { const el = $(id); if (el) el.value = val; };
  set('cfg-risk',      (S.cfg.risk   * 100).toFixed(1));
  set('cfg-sl',        (S.cfg.sl     * 100).toFixed(1));
  set('cfg-tp',        (S.cfg.tp     * 100).toFixed(1));
  set('cfg-trail',     (S.cfg.trail  * 100).toFixed(1));
  set('cfg-sigmin',     S.cfg.sigMin);
  set('cfg-maxtrades',  S.cfg.maxTrades);

  // Bind change events
  const cfgMap = {
    'cfg-risk':       v => { S.cfg.risk      = parseFloat(v) / 100; },
    'cfg-sl':         v => { S.cfg.sl        = parseFloat(v) / 100; },
    'cfg-tp':         v => { S.cfg.tp        = parseFloat(v) / 100; },
    'cfg-trail':      v => { S.cfg.trail     = parseFloat(v) / 100; },
    'cfg-sigmin':     v => { S.cfg.sigMin    = parseInt(v, 10); },
    'cfg-maxtrades':  v => { S.cfg.maxTrades = parseInt(v, 10); },
  };
  for (const [id, setter] of Object.entries(cfgMap)) {
    $(id)?.addEventListener('change', e => setter(e.target.value));
  }

  // API key
  $('set-key-btn')?.addEventListener('click', () => {
    const val = $('api-key-input')?.value?.trim();
    if (!val) return;
    S.setApiKey(val);
    updateKeyBadge(true);
  });

  // Clear key button
  $('clear-key-btn')?.addEventListener('click', () => {
    S.setApiKey('');
    const ki = $('api-key-input');
    if (ki) ki.value = '';
    updateKeyBadge(false);
  });
}

function updateKeyBadge(active) {
  const badge = $('key-badge');
  if (!badge) return;
  badge.textContent = active ? '● Key active' : '○ No key';
  badge.style.color = active ? 'var(--buy)' : 'var(--sell)';
}

// ── Tab switching (fixed: manage .active class + data-panel) ──

function bindTabs() {
  const tabs   = document.querySelectorAll('[data-tab]');
  const panels = document.querySelectorAll('[data-panel]');

  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      S.setMode(tab);

      // Toggle active class on tab buttons
      tabs.forEach(b => b.classList.toggle('active', b === btn));

      // Show/hide panels using class (not inline style)
      panels.forEach(p => {
        const isActive = p.dataset.panel === tab;
        p.classList.toggle('active', isActive);
        p.style.display = isActive ? 'flex' : 'none';
      });

      if (tab === 'simulation') renderSimUI();
      if (tab === 'live')       renderScanner(scannerTbody);
    });
  });
}

// ── Bot toggle (reads S.botOn not stale local) ────────────

function bindBotToggle() {
  const btn = $('bot-toggle');
  btn?.addEventListener('click', () => {
    S.setBotOn(!S.botOn);
    if (btn) btn.textContent = S.botOn ? 'Bot: ON' : 'Bot: OFF';
    btn?.classList.toggle('btn-green', S.botOn);
    btn?.classList.toggle('btn-red',  !S.botOn);
    refreshHeaderStats({ wsCount: S.wsCount, sigTotal: S.sigTotal, botOn: S.botOn });
  });
}

// ── Backtest ──────────────────────────────────────────────

function bindBacktest() {
  $('run-bt-btn')?.addEventListener('click', async () => {
    const sym   = ($('bt-symbol')?.value ?? 'BTCUSDT').trim().toUpperCase();
    const tf    = $('bt-tf')?.value   || '4h';
    const limit = parseInt($('bt-limit')?.value, 10) || 500;
    const btn   = $('run-bt-btn');

    if (btn) { btn.disabled = true; btn.textContent = 'Running…'; }
    if (btResultCont) btResultCont.innerHTML = '<p class="loading">Fetching data and running backtest…</p>';

    const result = await runBacktest(sym, tf, limit);
    renderBT(btResultCont, result);

    if (btn) { btn.disabled = false; btn.textContent = 'Run Backtest'; }
  });
}

// ── Chat ──────────────────────────────────────────────────

function bindChat() {
  $('chat-send')?.addEventListener('click', () => {
    sendChat(chatInput?.value ?? '', chatMsgs, chatInput);
  });
  chatInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat(chatInput.value, chatMsgs, chatInput);
    }
  });
}

// ── Start ─────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);

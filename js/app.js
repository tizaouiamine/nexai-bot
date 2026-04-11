/**
 * app.js — Main application entry point
 *
 * Responsibilities:
 *   - Bootstrap: load config, init streams for default pairs
 *   - Event routing: nexai:candle → strategy → paper → ui update
 *   - Mode switching (LIVE / SIMULATION / BACKTEST)
 *   - Config panel read/write
 *   - Bot on/off toggle
 *   - Chart rendering (Chart.js)
 *   - Scanner refresh loop
 *   - Orchestrates all modules — nothing else imports app.js
 */

import { PAIRS, DEFAULT_CFG, STORAGE_KEYS }         from './config.js';
import {
  cfg, candles, sigs, prices, scanRows, paper,
  mode, botOn, wsCount, sigTotal,
  setMode, setBotOn, setWsCount, setApiKey,
  setChartSym, setChartTF, setPChart, setEChart,
  incSigTotal, pChart, eChart, chartSym, chartTF,
  apiKey,
} from './state.js';
import { detect }                                    from './strategy.js';
import { fetchKlines, startWS, closeWS }             from './binance.js';
import { tryEnter, monitorTrades, closeTrade, closeAllTrades } from './paper.js';
import { runBacktest }                               from './backtest.js';
import {
  renderScanner, renderOpenPos, renderSimHist,
  renderSimStats, renderBT, addSigFeed,
  refreshHeaderStats, rotateInsight,
} from './ui.js';
import { sendChat }                                  from './chat.js';

// ── DOM refs (cached on init) ─────────────────────────────
const $ = id => document.getElementById(id);

let scannerTbody, simOpenCont, simHistTbody, simStatsCont;
let feedCont, chatMsgs, chatInput, btResultCont;
let priceChart = null;

// ── Init ─────────────────────────────────────────────────

async function init() {
  // Cache DOM elements
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
    setApiKey(storedKey);
    const keyInput = $('api-key-input');
    if (keyInput) keyInput.value = storedKey;
    updateKeyBadge(true);
  }

  // Wire config panel
  bindConfigPanel();

  // Wire chat
  bindChat();

  // Wire tab switching
  bindTabs();

  // Wire bot toggle
  bindBotToggle();

  // Wire backtest button
  bindBacktest();

  // Wire scanner row clicks (event delegation)
  scannerTbody?.addEventListener('click', e => {
    const tr = e.target.closest('tr[data-sym]');
    if (!tr) return;
    openChart(tr.dataset.sym, tr.dataset.tf || '4h');
  });

  // Wire close-all button
  $('close-all-btn')?.addEventListener('click', () => {
    closeAllTrades(prices);
    renderSimUI();
  });

  // Wire reset paper button
  $('reset-paper-btn')?.addEventListener('click', () => {
    if (confirm('Reset paper trading portfolio to $10,000?')) {
      import('./state.js').then(({ resetPaper }) => {
        resetPaper();
        renderSimUI();
      });
    }
  });

  // Start live streams for default pairs
  const defaultPairs = PAIRS.slice(0, 20); // start with top 20
  const defaultTF    = '4h';
  for (const sym of defaultPairs) {
    await bootstrapPair(sym, defaultTF);
  }

  // Listen for candle events
  window.addEventListener('nexai:candle', onCandle);

  // Listen for trade events
  window.addEventListener('nexai:trade-event', onTradeEvent);

  // UI refresh loop
  setInterval(refreshUI, 2000);

  // Insight rotator
  rotateInsight();
  setInterval(rotateInsight, 12000);

  // Initial render
  refreshHeaderStats({ wsCount, sigTotal, botOn });
}

// ── Pair bootstrap ────────────────────────────────────────

async function bootstrapPair(symbol, interval) {
  const key = `${symbol}_${interval}`;
  // Fetch historical klines first (seed for strategy)
  const hist = await fetchKlines(symbol, interval, 200);
  if (hist.length) {
    candles[key] = hist;
    // Run initial signal
    const sig = detect(hist);
    if (sig) {
      sigs[key] = sig;
      const pair = symbol.replace('USDT', '/USDT');
      scanRows[key] = { key, sym: symbol, pair, tf: interval, ...sig };
    }
  }
  // Start live stream
  startWS(symbol, interval);
}

// ── Candle event handler ──────────────────────────────────

function onCandle(e) {
  const { key, symbol, interval, candle } = e.detail;

  // Only process on closed candles
  if (!candle.closed) return;

  const cs  = candles[key];
  if (!cs || cs.length < 50) return;

  // Run strategy
  const sig = detect(cs);
  if (!sig) return;

  sigs[key] = sig;
  prices[symbol] = candle.close;
  incSigTotal();

  // Update scanner row
  const pair = symbol.replace('USDT', '/USDT');
  scanRows[key] = { key, sym: symbol, pair, tf: interval, ...sig };

  // Signal feed (only actionable signals)
  if (sig.dir && sig.conf >= 55) {
    addSigFeed(feedCont, { pair, tf: interval, ...sig });
  }

  // Paper trading bot
  if (botOn && mode === 'simulation') {
    const closedReasons = monitorTrades(key, candle.close, sig);

    if (sig.dir && sig.conf >= cfg.sigMin) {
      const result = tryEnter(key, sig, candle.close);
      if (result.ok) {
        console.info(`[Paper] Entered ${sig.dir} on ${key} @ ${candle.close}`);
      }
    }
  }

  // Update chart if watching this pair
  if (symbol === chartSym && interval === chartTF) {
    updatePriceChart();
  }
}

// ── Trade event handler ───────────────────────────────────

function onTradeEvent(e) {
  const { type, trade } = e.detail;
  if (type === 'close' || type === 'tp1') {
    renderSimUI();
  }
}

// ── UI refresh ────────────────────────────────────────────

function refreshUI() {
  refreshHeaderStats({ wsCount, sigTotal, botOn });

  if (mode === 'live') {
    renderScanner(scannerTbody);
  } else if (mode === 'simulation') {
    renderSimUI();
  }
}

function renderSimUI() {
  renderOpenPos(simOpenCont);
  renderSimHist(simHistTbody);
  renderSimStats(simStatsCont);
}

// ── Chart ─────────────────────────────────────────────────

async function openChart(symbol, interval) {
  setChartSym(symbol);
  setChartTF(interval);
  await fetchKlines(symbol, interval, 100).then(cs => {
    if (!cs.length) return;
    candles[`${symbol}_${interval}`] = cs;
    buildPriceChart(cs, symbol, interval);
  });
}

function buildPriceChart(cs, symbol, interval) {
  const ctx = $('price-chart');
  if (!ctx) return;

  if (priceChart) { priceChart.destroy(); priceChart = null; }

  const labels = cs.map(c => {
    const d = new Date(c.time);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  });
  const closes = cs.map(c => c.close);

  priceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `${symbol} ${interval}`,
        data: closes,
        borderColor: '#00c9ff',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.1,
        fill: {
          target: 'origin',
          above: 'rgba(0,201,255,0.04)',
        },
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 8, color: '#888' }, grid: { color: '#1e2a3a' } },
        y: { ticks: { color: '#888' }, grid: { color: '#1e2a3a' } },
      },
    },
  });
  setPChart(priceChart);
}

function updatePriceChart() {
  if (!priceChart) return;
  const key = `${chartSym}_${chartTF}`;
  const cs  = candles[key];
  if (!cs?.length) return;

  const last = cs[cs.length - 1];
  const ds   = priceChart.data.datasets[0];
  const lbl  = new Date(last.time).toLocaleDateString([], { month: 'short', day: 'numeric' });

  if (priceChart.data.labels.at(-1) === lbl) {
    ds.data[ds.data.length - 1] = last.close;
  } else {
    priceChart.data.labels.push(lbl);
    ds.data.push(last.close);
    if (priceChart.data.labels.length > 150) {
      priceChart.data.labels.shift();
      ds.data.shift();
    }
  }
  priceChart.update('none');
}

// ── Config panel ──────────────────────────────────────────

function bindConfigPanel() {
  const cfgMap = {
    'cfg-risk':    v => { cfg.risk   = parseFloat(v) / 100; },
    'cfg-sl':      v => { cfg.sl     = parseFloat(v) / 100; },
    'cfg-tp':      v => { cfg.tp     = parseFloat(v) / 100; },
    'cfg-trail':   v => { cfg.trail  = parseFloat(v) / 100; },
    'cfg-sigmin':  v => { cfg.sigMin = parseInt(v, 10); },
    'cfg-maxtrades': v => { cfg.maxTrades = parseInt(v, 10); },
  };

  for (const [id, setter] of Object.entries(cfgMap)) {
    const el = $(id);
    if (!el) continue;
    // Set initial value from cfg
    const key = id.replace('cfg-', '');
    if (id === 'cfg-sigmin') el.value = cfg.sigMin;
    else if (id === 'cfg-maxtrades') el.value = cfg.maxTrades;
    else el.value = (cfg[cfgKeyMap(id)] * 100).toFixed(1);

    el.addEventListener('change', () => setter(el.value));
  }

  // API key
  $('set-key-btn')?.addEventListener('click', () => {
    const val = $('api-key-input')?.value?.trim();
    if (!val) return;
    setApiKey(val);
    updateKeyBadge(true);
  });
}

function cfgKeyMap(id) {
  return { 'cfg-risk': 'risk', 'cfg-sl': 'sl', 'cfg-tp': 'tp', 'cfg-trail': 'trail' }[id] ?? id.replace('cfg-', '');
}

function updateKeyBadge(active) {
  const badge = $('key-badge');
  if (!badge) return;
  badge.textContent  = active ? '● Key set' : '○ No key';
  badge.style.color  = active ? 'var(--buy)' : 'var(--sell)';
}

// ── Tab switching ─────────────────────────────────────────

function bindTabs() {
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      setMode(tab);

      document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('[data-panel]').forEach(p => {
        p.style.display = p.dataset.panel === tab ? '' : 'none';
      });

      if (tab === 'simulation') renderSimUI();
      if (tab === 'live') renderScanner(scannerTbody);
    });
  });
}

// ── Bot toggle ────────────────────────────────────────────

function bindBotToggle() {
  $('bot-toggle')?.addEventListener('click', () => {
    setBotOn(!botOn);
    const btn = $('bot-toggle');
    if (btn) btn.textContent = botOn ? 'Bot: ON' : 'Bot: OFF';
    refreshHeaderStats({ wsCount, sigTotal, botOn });
  });
}

// ── Backtest ──────────────────────────────────────────────

function bindBacktest() {
  $('run-bt-btn')?.addEventListener('click', async () => {
    const sym   = $('bt-symbol')?.value?.trim().toUpperCase() || 'BTCUSDT';
    const tf    = $('bt-tf')?.value || '4h';
    const limit = parseInt($('bt-limit')?.value, 10) || 500;

    if (btResultCont) btResultCont.innerHTML = '<p class="loading">Running backtest…</p>';

    const result = await runBacktest(sym, tf, limit);
    renderBT(btResultCont, result);
  });
}

// ── Chat ──────────────────────────────────────────────────

function bindChat() {
  const sendBtn = $('chat-send');
  sendBtn?.addEventListener('click', () => {
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

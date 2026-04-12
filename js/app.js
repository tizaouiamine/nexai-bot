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

import { SEED_PAIRS, STORAGE_KEYS, fetchAllPairs, fetchMEXCPairs } from './config.js';
import { initAuth, signInGoogle, sendEmailLink, signOut } from './auth.js';
import { runTraining, applyWeights, resetWeights, getWeights } from './training.js';
import * as S from './state.js';
import { evaluate, isTradeable }                       from './engine.js';
import { fetchKlines, startWS }                        from './binance.js';
import { fetchKlinesMEXC, startWSMEXC }                from './mexc.js';
import { tryEnter, monitorTrades, closeAllTrades, paperStats } from './paper.js';
import { runBacktest }                                 from './backtest.js';
import {
  renderScanner, renderOpenPos, renderSimHist,
  renderBT, addSigFeed, refreshHeaderStats, rotateInsight, renderForecastPanel,
} from './ui.js';
import { sendChat }                                    from './chat.js';
import { fetchDepth, depthScore }                      from './depth.js';
import { projectEntries }                              from './forecast.js';
import { loadConnectorCfg, saveConnectorCfg, sendSignal, connectorCfg } from './connector.js';

// ── DOM cache ─────────────────────────────────────────────
const $  = id => document.getElementById(id);
let scannerTbody, simOpenCont, simHistTbody;
let feedCont, chatMsgs, chatInput, btResultCont;
let priceChart = null;

// ── Per-pair HTF candle cache (for MTF engine) ────────────
const htfCandles  = {};     // 'BTCUSDT' → candle[] on '1d'
const HTF         = '1d';
const depthCache  = {};     // 'BTCUSDT' → depth data (30s TTL handled by depth.js)
let   forecastCont = null;  // #forecast-panel DOM element

// ── Active exchange ───────────────────────────────────────
// 'binance' | 'mexc'
let activeExchange = localStorage.getItem(STORAGE_KEYS.exchange) || 'binance';

function fetchKlinesEx(symbol, interval, limit) {
  return activeExchange === 'mexc'
    ? fetchKlinesMEXC(symbol, interval, limit)
    : fetchKlines(symbol, interval, limit);
}
function startWSEx(symbol, interval) {
  if (activeExchange === 'mexc') startWSMEXC(symbol, interval);
  else startWS(symbol, interval);
}

// ── Auth gate ─────────────────────────────────────────────

function initAuthUI() {
  initAuth();

  // Auth state change → show/hide overlay
  window.addEventListener('nexai:auth-ready',  e => handleAuthState(e.detail.user));
  window.addEventListener('nexai:auth-change', e => handleAuthState(e.detail.user));

  // Google button
  $('auth-google-btn')?.addEventListener('click', async () => {
    setAuthMsg('auth-main-msg', '');
    try { await signInGoogle(); }
    catch (e) { setAuthMsg('auth-main-msg', '✕ ' + (e.message ?? 'Sign-in failed'), 'err'); }
  });

  // Email trigger → show email step
  $('auth-email-trigger-btn')?.addEventListener('click', () => {
    showAuthStep('auth-step-email');
    $('auth-email-input')?.focus();
  });

  // Send email link
  $('auth-send-link-btn')?.addEventListener('click', async () => {
    const email = $('auth-email-input')?.value?.trim();
    if (!email || !email.includes('@')) {
      setAuthMsg('auth-email-msg', 'Enter a valid email address', 'err'); return;
    }
    const btn = $('auth-send-link-btn');
    btn.disabled = true; btn.textContent = 'Sending…';
    setAuthMsg('auth-email-msg', '');
    try {
      await sendEmailLink(email);
      $('auth-sent-email').textContent = email;
      showAuthStep('auth-step-sent');
    } catch (e) {
      setAuthMsg('auth-email-msg', '✕ ' + (e.message ?? 'Failed to send'), 'err');
    } finally {
      btn.disabled = false; btn.textContent = 'Send Login Link';
    }
  });

  // Back buttons
  $('auth-email-back')?.addEventListener('click', () => showAuthStep('auth-step-main'));
  $('auth-sent-back')?.addEventListener('click', () => showAuthStep('auth-step-email'));

  // Demo mode
  $('auth-demo-btn')?.addEventListener('click', e => {
    e.preventDefault();
    // Dispatch a fake auth event for demo
    window.dispatchEvent(new CustomEvent('nexai:auth-change', {
      detail: { user: { uid: 'demo', displayName: 'Demo User', email: 'demo@nexai.local', isDemo: true } }
    }));
  });

  // User pill → sign out
  $('user-pill')?.addEventListener('click', () => {
    if (confirm('Sign out?')) signOut();
  });
}

function handleAuthState(user) {
  const overlay = $('auth-overlay');
  const app     = $('app');
  if (user) {
    overlay?.classList.add('hidden');
    if (app) { app.style.display = 'block'; app.classList.add('ready'); }
    updateUserPill(user);
    // Init main app once (guard with flag)
    if (!window._nexaiInited) { window._nexaiInited = true; init(); }
  } else {
    overlay?.classList.remove('hidden');
    if (app) app.style.display = 'none';
  }
}

function showAuthStep(id) {
  document.querySelectorAll('.auth-step').forEach(s => s.classList.remove('active'));
  $(id)?.classList.add('active');
}

function setAuthMsg(id, text, type = '') {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'auth-msg' + (type ? ' ' + type : '');
}

function updateUserPill(user) {
  const name   = $('user-name');
  const avatar = $('user-avatar');
  if (name)   name.textContent   = user.displayName ?? user.email ?? 'User';
  if (avatar) avatar.textContent = (user.displayName ?? user.email ?? '?')[0].toUpperCase();
}

// ── Init ─────────────────────────────────────────────────

async function init() {
  scannerTbody  = $('scanner-tbody');
  simOpenCont   = $('sim-open');
  simHistTbody  = $('sim-hist-tbody');
  feedCont      = $('signal-feed');
  chatMsgs      = $('chat-messages');
  chatInput     = $('chat-input');
  btResultCont  = $('bt-result');
  forecastCont  = $('forecast-panel');

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
  bindTraining();
  bindConnector();
  renderWeightsPanel(); // show any existing weights on load

  // Restore last active tab
  const savedMode = localStorage.getItem(STORAGE_KEYS.mode);
  if (savedMode) {
    const tabBtn = document.querySelector(`[data-tab="${savedMode}"]`);
    tabBtn?.click();
  }

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

  $('set-bal-btn')?.addEventListener('click', () => {
    const input = $('paper-bal-input');
    const amount = parseFloat(input?.value);
    if (!isFinite(amount) || amount < 100) {
      alert('Enter a valid balance (minimum $100)');
      return;
    }
    if (!confirm(`Set paper balance to $${amount.toLocaleString()}? Open positions will be closed.`)) return;
    S.setPaperBal(amount);
    renderSimUI();
    updateSimStats();
  });

  // Wire exchange toggle
  bindExchangeToggle();

  // Fetch full pair list (all active USDT pairs from exchange info)
  const allPairs = activeExchange === 'mexc'
    ? await fetchMEXCPairs(200)
    : await fetchAllPairs(300);

  // Bootstrap seed pairs immediately (parallel), then add more in batches
  const seedSet = new Set(SEED_PAIRS);
  const seedPairs = allPairs.filter(s => seedSet.has(s));
  const restPairs = allPairs.filter(s => !seedSet.has(s));

  // Show total pair count
  const pairCountEl = $('pair-count');
  if (pairCountEl) pairCountEl.textContent = `${allPairs.length} pairs`;

  // Seed pairs: fully parallel
  await Promise.all(seedPairs.map(sym => bootstrapPair(sym, S.cfg.tf)));

  // Remaining pairs: batch of 20 every 2s to avoid rate-limiting
  bootstrapInBatches(restPairs, S.cfg.tf, 20, 2000);

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
    fetchKlinesEx(symbol, interval, 250),
    fetchKlinesEx(symbol, HTF, 60),
  ]);
  if (hist.length) {
    S.candles[key] = hist;
    if (htf.length) htfCandles[symbol] = htf;

    // Depth is fetched lazily (only for the charted pair) to avoid 300+ HTTP requests on startup
    const ev = evaluate(hist, htf.length ? htf : null, null);
    if (ev) {
      S.sigs[key] = ev;
      S.prices[symbol] = hist[hist.length - 1].close;
      const pair = symbol.replace('USDT', '/USDT');
      S.scanRows[key] = { key, sym: symbol, pair, tf: interval, ...ev };
    }
  }
  startWSEx(symbol, interval);
}

/**
 * Bootstrap a large list in batches to avoid hitting rate limits
 * @param {string[]} pairs
 * @param {string}   interval
 * @param {number}   batchSize
 * @param {number}   delayMs
 */
function bootstrapInBatches(pairs, interval, batchSize, delayMs) {
  if (!pairs.length) return;
  let offset = 0;
  async function nextBatch() {
    const batch = pairs.slice(offset, offset + batchSize);
    if (!batch.length) return;
    offset += batchSize;
    await Promise.all(batch.map(sym => bootstrapPair(sym, interval)));
    if (offset < pairs.length) setTimeout(nextBatch, delayMs);
  }
  setTimeout(nextBatch, delayMs); // first batch after initial delay
}

// ── Candle event handler ──────────────────────────────────

function onCandle(e) {
  const { key, symbol, interval, candle } = e.detail;
  if (!candle.closed) return;

  const cs = S.candles[key];
  if (!cs || cs.length < 50) return;

  // Full AI engine evaluation (with MTF + depth)
  const dScore = depthCache[symbol] ? depthScore(depthCache[symbol]) : null;
  const ev     = evaluate(cs, htfCandles[symbol] ?? null, dScore);
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

    // Apply trained weights to adjust confidence
    const weighted = applyWeights(ev);
    Object.assign(ev, weighted);

    // Engine gate: only enter if AI filters pass
    if (isTradeable(ev, S.cfg.sigMin)) {
      const result = tryEnter(key, ev, candle.close);
      if (result.ok) {
        console.info(`[Bot] ${ev.dir} entered on ${key} @ ${candle.close} | score=${ev.engineScore} regime=${ev.regime}`);
        // Fire real trade connector (if configured)
        if (connectorCfg.enabled && connectorCfg.webhookUrl) {
          sendSignal(symbol, ev, candle.close, result.trade)
            .then(r => updateConnectorStatus(r))
            .catch(e => console.warn('[Connector]', e));
        }
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

// ── Exchange toggle ───────────────────────────────────────

function bindExchangeToggle() {
  const sel = $('exchange-select');
  if (!sel) return;
  sel.value = activeExchange;
  sel.addEventListener('change', () => {
    activeExchange = sel.value;
    localStorage.setItem(STORAGE_KEYS.exchange, activeExchange);
    // Reload page to reinitialise streams on new exchange
    if (confirm(`Switch to ${activeExchange.toUpperCase()}? The page will reload to connect new streams.`)) {
      window.location.reload();
    } else {
      sel.value = activeExchange; // revert
    }
  });
}

// ── Price chart ───────────────────────────────────────────

async function openChart(symbol, interval) {
  S.setChartSym(symbol);
  S.setChartTF(interval);
  const key = `${symbol}_${interval}`;
  const cs  = S.candles[key]?.length ? S.candles[key] : await fetchKlinesEx(symbol, interval, 120);
  if (cs.length) {
    S.candles[key] = cs;
    buildPriceChart(cs, symbol, interval);

    // Fetch order book depth lazily — only for the pair the user is viewing
    if (activeExchange === 'binance') {
      fetchDepth(symbol).then(d => { if (d) depthCache[symbol] = d; }).catch(() => {});
    }

    // Render forecast panel for this pair
    const currentSig = S.sigs[key] ?? null;
    const entries    = projectEntries(cs, currentSig, S.cfg);
    renderForecastPanel(forecastCont, symbol, entries);
  }
}

function buildPriceChart(cs, symbol, interval) {
  const canvas = $('price-chart');
  if (!canvas) return;
  if (priceChart) { try { priceChart.destroy(); } catch (_) {} priceChart = null; }

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
      localStorage.setItem(STORAGE_KEYS.mode, tab);  // persist mode

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

// ── Training ──────────────────────────────────────────────

function bindTraining() {
  $('run-train-btn')?.addEventListener('click', async () => {
    const tf    = $('train-tf')?.value    || '4h';
    const count = parseInt($('train-pairs')?.value, 10) || 20;
    const btn   = $('run-train-btn');

    // Collect pairs to train (use scanRows keys + SEED_PAIRS)
    const available = [
      ...new Set([
        ...SEED_PAIRS,
        ...Object.values(S.scanRows).map(r => r.sym),
      ]),
    ].slice(0, count);

    btn.disabled = true; btn.textContent = 'Training…';
    $('train-progress-card').style.display  = '';
    $('train-results').style.display        = 'none';

    const result = await runTraining(available, tf, prog => {
      const pct = prog.pairs > 0 ? Math.round(prog.done / prog.pairs * 100) : 0;
      $('train-bar').style.width      = pct + '%';
      $('train-pct-text').textContent = pct + '%';
      $('train-status-text').textContent = `${prog.done}/${prog.pairs} pairs · ${prog.signals} signals`;
    });

    btn.disabled = false; btn.textContent = 'Run Training';

    // Show results
    $('train-results').style.display = 'grid';
    $('tr-pairs').textContent   = result.trainedPairs;
    $('tr-signals').textContent = result.totalSignals;
    $('tr-factors').textContent = Object.keys(result.factors).length;
    $('tr-status').textContent  = 'Complete ✓';

    // Factor list
    const list = $('train-factor-list');
    if (list) {
      list.innerHTML = '';
      const sorted = Object.entries(result.factors).sort((a, b) => b[1].accuracy - a[1].accuracy);
      for (const [factor, { accuracy, wins, total }] of sorted) {
        const row   = document.createElement('div');
        row.className = 'factor-row';
        const color = accuracy >= 60 ? 'var(--buy)' : accuracy >= 45 ? 'var(--yellow)' : 'var(--sell)';
        row.innerHTML = `
          <span class="factor-name">${factor}</span>
          <div class="factor-bar-bg"><div class="factor-bar" style="width:${accuracy}%;background:${color}"></div></div>
          <span class="factor-acc" style="color:${color}">${accuracy}%</span>
          <span style="color:var(--muted);font-size:10px">${wins}/${total}</span>
        `;
        list.appendChild(row);
      }
    }

    renderWeightsPanel();
  });

  $('reset-weights-btn')?.addEventListener('click', () => {
    if (confirm('Reset all learned weights? This cannot be undone.')) {
      resetWeights();
      renderWeightsPanel();
      $('train-results').style.display       = 'none';
      $('train-progress-card').style.display = 'none';
    }
  });
}

function renderWeightsPanel() {
  const el = $('train-weights-list');
  if (!el) return;
  const w = getWeights();
  const entries = Object.entries(w);
  if (!entries.length) {
    el.innerHTML = '<span style="color:var(--muted);font-style:italic">No training data yet. Run training first.</span>';
    return;
  }
  el.innerHTML = '';
  entries.sort((a, b) => b[1] - a[1]).forEach(([factor, weight]) => {
    const pct   = (weight * 100).toFixed(0);
    const color = weight >= 0.6 ? 'var(--buy)' : weight >= 0.45 ? 'var(--yellow)' : 'var(--sell)';
    const row   = document.createElement('div');
    row.className = 'factor-row';
    row.innerHTML = `
      <span class="factor-name">${factor}</span>
      <div class="factor-bar-bg"><div class="factor-bar" style="width:${pct}%;background:${color}"></div></div>
      <span class="factor-acc" style="color:${color}">${pct}%</span>
    `;
    el.appendChild(row);
  });
}

// ── Bot Connector UI ──────────────────────────────────────

function bindConnector() {
  loadConnectorCfg();

  const enabledToggle = $('connector-enabled');
  const urlInput      = $('connector-url');
  const secretInput   = $('connector-secret');
  const dryRunChk     = $('connector-dryrun');
  const testBtn       = $('connector-test-btn');
  const statusEl      = $('connector-status');

  if (!enabledToggle) return; // panel not in HTML yet

  // Restore UI state
  if (enabledToggle) enabledToggle.checked = connectorCfg.enabled;
  if (urlInput)      urlInput.value        = connectorCfg.webhookUrl;
  if (secretInput)   secretInput.value     = connectorCfg.secret;
  if (dryRunChk)     dryRunChk.checked     = connectorCfg.dryRun;

  // Save on change
  const persist = () => {
    connectorCfg.enabled    = enabledToggle?.checked ?? false;
    connectorCfg.webhookUrl = urlInput?.value?.trim() ?? '';
    connectorCfg.secret     = secretInput?.value?.trim() ?? '';
    connectorCfg.dryRun     = dryRunChk?.checked ?? true;
    saveConnectorCfg();
  };
  enabledToggle?.addEventListener('change', persist);
  urlInput?.addEventListener('change', persist);
  secretInput?.addEventListener('change', persist);
  dryRunChk?.addEventListener('change', persist);

  // Test button — send a dry-run test signal
  testBtn?.addEventListener('click', async () => {
    if (!connectorCfg.webhookUrl) {
      if (statusEl) { statusEl.textContent = '✕ Enter a webhook URL first'; statusEl.style.color = 'var(--sell)'; }
      return;
    }
    testBtn.disabled = true; testBtn.textContent = 'Testing…';
    const testSig = { dir: 'LONG', sig: 'TEST', conf: 99, engineScore: 99, regime: 'bull', pattern: 'Test', rsns: ['TEST'] };
    const result  = await sendSignal('BTCUSDT', testSig, 99999, { size: 100 });
    testBtn.disabled = false; testBtn.textContent = 'Test';
    updateConnectorStatus(result);
  });
}

function updateConnectorStatus(result) {
  const statusEl = $('connector-status');
  if (!statusEl) return;
  if (result?.ok) {
    statusEl.textContent = `✓ ${result.response?.status ?? 'OK'} — ${new Date().toLocaleTimeString()}`;
    statusEl.style.color = 'var(--buy)';
  } else {
    statusEl.textContent = `✕ ${result?.error ?? 'Failed'}`;
    statusEl.style.color = 'var(--sell)';
  }
}

// ── Start ─────────────────────────────────────────────────

// Auth runs immediately on load; init() is called after sign-in
document.addEventListener('DOMContentLoaded', initAuthUI);

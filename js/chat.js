/**
 * chat.js — Claude AI chat assistant
 *
 * Security:
 *   - API key read from state (localStorage-backed), never hardcoded
 *   - All message text set via textContent, never innerHTML
 *   - Rate limited: max 1 request per 3 seconds
 *   - System prompt injects live market context (prices, signals)
 *
 * CORS note:
 *   Direct browser → Anthropic API requires the
 *   'anthropic-dangerous-direct-browser-access' header.
 *   This is intentional for a local/static deployment.
 */

import { apiKey, sigs, prices, paper, mode } from './state.js';
import { paperStats } from './paper.js';
import { trainingSummary } from './training.js';

const MODEL   = 'claude-haiku-4-5-20251001';
const API_URL = 'https://api.anthropic.com/v1/messages';
const RATE_MS = 3000;

let lastSent = 0;
let pending  = false;

// ── System prompt builder ────────────────────────────────

function buildSystemPrompt() {
  // Top 5 signals with full engine context (put most critical data last — Raschka ch.3)
  const topSigs = Object.entries(sigs)
    .filter(([, s]) => s?.dir)
    .sort(([, a], [, b]) => (b.engineScore ?? b.conf ?? 0) - (a.engineScore ?? a.conf ?? 0))
    .slice(0, 5);

  const sigLines = topSigs.map(([key, s]) => {
    const parts = [
      `${key}: ${s.sig} conf=${s.conf}% score=${s.engineScore ?? '—'}`,
      `RSI=${s.rsi?.toFixed(1) ?? '—'}`,
      `MACD=${s.macdH?.toFixed(4) ?? '—'}`,
      `regime=${s.regime ?? '—'}`,
      `pattern=${s.pattern ?? 'none'}`,
      s.mtfConfirm ? 'MTF=✓' : 'MTF=✗',
    ];
    // Include divergence flags if present
    if (s.rsns?.includes('RSI Bull Divergence')) parts.push('DIVERGENCE:BULL');
    if (s.rsns?.includes('RSI Bear Divergence')) parts.push('DIVERGENCE:BEAR');
    if (s.rsns?.includes('MACD Momentum Fading')) parts.push('MOMENTUM:FADING');
    return parts.join(' | ');
  }).join('\n') || 'Scanning…';

  // Top 5 prices
  const topPrices = Object.entries(prices).slice(0, 5)
    .map(([sym, p]) => `${sym}=$${p?.toFixed ? p.toFixed(2) : p}`).join(' | ');

  // Portfolio stats
  const stats   = paperStats();
  const balance = stats.totalBal?.toFixed(2) ?? '—';
  const openPos = paper.open.length
    ? paper.open.map(t => {
        const pp = t.dir === 'LONG'
          ? ((t.cur - t.entry) / t.entry * 100).toFixed(2)
          : ((t.entry - t.cur) / t.entry * 100).toFixed(2);
        return `${t.pair} ${t.dir} @$${t.entry?.toFixed(2)} P&L=${pp}% SL=$${t.sl?.toFixed(2)} TP2=$${t.tp2?.toFixed(2)}`;
      }).join('\n')
    : 'None';

  // ATR and regime for top pair (if available)
  const topPair = topSigs[0]?.[1];
  const topPairKey = topSigs[0]?.[0] ?? '';
  const regimeLine = topPair
    ? `Top pair ${topPairKey.split('_')[0]}: regime=${topPair.regime} ATR=${topPair.atr?.toFixed(4) ?? '—'} ATR-SL=${topPair.atrSL?.toFixed(4) ?? '—'}`
    : '';

  // Training insights (top 3 best factors + worst 1)
  let trainLine = '';
  try {
    const summary = trainingSummary();
    if (summary.totalFactors > 0) {
      trainLine = `Trained factors (${summary.totalFactors} total): Best=${summary.bestFactors.slice(0,2).join(', ')} | Worst=${summary.worstFactors[0] ?? '—'}`;
    }
  } catch (_) {}

  // NOTE: Most critical data placed last (Claude attends to recent tokens most strongly)
  return `You are NEXAI — an expert crypto trading AI assistant with access to live market data.
Mode: ${mode.toUpperCase()} | ${new Date().toUTCString()}

## Live Prices
${topPrices || 'Loading…'}

## Paper Portfolio
Balance=$${balance} | Win Rate=${stats.wr}% | Trades=${stats.tot} | Max DD=${stats.dd}%
Open positions:
${openPos}

## AI Training Insights
${trainLine || 'No training data yet.'}

## Market Regime + ATR
${regimeLine || '—'}

## Top Signals (engineScore | conf | regime | pattern | MTF)
${sigLines}

## Rules
- Give concise, actionable analysis grounded in the live data above
- Always mention SL/TP levels from the signal data when relevant
- Flag divergences (RSI Bull/Bear Divergence, MACD Fading) explicitly — they predict reversals
- Reference regime (bull/bear/ranging) before suggesting direction
- Never guarantee profits — crypto is high-risk
- Keep responses under 250 words unless asked for more detail`;
}

// ── DOM helpers ──────────────────────────────────────────

function addMessage(container, role, text) {
  if (!container) return;
  const wrap = document.createElement('div');
  wrap.className = `chat-msg chat-${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.textContent = text;   // safe — no innerHTML

  wrap.appendChild(bubble);
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
  return bubble;
}

function setTyping(container, active) {
  let indicator = container?.querySelector('.chat-typing');
  if (active && !indicator) {
    const wrap = document.createElement('div');
    wrap.className = 'chat-msg chat-assistant chat-typing';
    wrap.innerHTML = '<div class="chat-bubble"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
    container?.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
  } else if (!active && indicator) {
    indicator.remove();
  }
}

// ── Main send function ───────────────────────────────────

/**
 * Send a message to Claude and render the response
 * @param {string}      userText  - Raw user input
 * @param {HTMLElement} msgList   - Container for messages
 * @param {HTMLElement} input     - Input element (cleared after send)
 * @param {Function}    [onDone]  - Optional callback when response arrives
 */
export async function sendChat(userText, msgList, input, onDone) {
  const text = userText.trim();
  if (!text) return;

  // Guard: missing API key
  if (!apiKey) {
    addMessage(msgList, 'assistant', 'Please set your Anthropic API key in the Bot Configuration panel first.');
    return;
  }

  // Rate limit
  const now = Date.now();
  if (pending || now - lastSent < RATE_MS) {
    addMessage(msgList, 'assistant', 'Please wait a moment before sending another message.');
    return;
  }

  addMessage(msgList, 'user', text);
  if (input) input.value = '';

  pending = true;
  lastSent = Date.now();
  setTyping(msgList, true);

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: text }],
      }),
    });

    setTyping(msgList, false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message ?? `API error ${res.status}`;
      addMessage(msgList, 'assistant', `Error: ${msg}`);
      return;
    }

    const data = await res.json();
    const reply = data?.content?.[0]?.text ?? '(No response)';
    addMessage(msgList, 'assistant', reply);
    onDone?.();
  } catch (err) {
    setTyping(msgList, false);
    addMessage(msgList, 'assistant', `Network error: ${err.message}. Check your connection and API key.`);
  } finally {
    pending = false;
  }
}

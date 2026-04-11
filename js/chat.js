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

const MODEL   = 'claude-haiku-4-5-20251001';
const API_URL = 'https://api.anthropic.com/v1/messages';
const RATE_MS = 3000;

let lastSent = 0;
let pending  = false;

// ── System prompt builder ────────────────────────────────

function buildSystemPrompt() {
  const topSignals = Object.entries(sigs)
    .filter(([, s]) => s?.dir)
    .sort(([, a], [, b]) => (b.conf ?? 0) - (a.conf ?? 0))
    .slice(0, 5)
    .map(([key, s]) => `${key}: ${s.sig} (${s.conf}%) RSI=${s.rsi} MACD=${s.macdH?.toFixed(4)}`)
    .join('\n');

  const topPrices = Object.entries(prices)
    .slice(0, 8)
    .map(([sym, p]) => `${sym}: $${p}`)
    .join(', ');

  const stats   = paperStats();
  const openPos = paper.open
    .map(t => `${t.pair} ${t.dir} entry=$${t.entry?.toFixed(2)} sl=$${t.sl?.toFixed(2)}`)
    .join(', ') || 'None';

  return `You are NEXAI — an expert crypto trading AI assistant embedded in a live trading dashboard.
Current mode: ${mode.toUpperCase()}
Live prices: ${topPrices || 'Loading…'}

Top signals (EMA/RSI/MACD/BB confluence):
${topSignals || 'Scanning…'}

Paper portfolio: Balance=$${stats.totalBal?.toFixed(2)} | Win rate=${stats.wr}% | Open: ${openPos}

Rules:
- Give concise, actionable trading insights
- Always mention risk management
- Reference the live data above when relevant
- Never guarantee profits — crypto is high-risk
- If asked about a specific coin, use the signal data if available
- Keep responses under 200 words unless asked for more detail`;
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

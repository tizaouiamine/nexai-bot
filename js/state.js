/**
 * state.js — Shared mutable application state
 * Single source of truth. Import and mutate directly.
 * Objects are passed by reference — mutations are visible to all importers.
 */

import { DEFAULT_CFG, STORAGE_KEYS } from './config.js';

// ── Live config (user-adjustable) ────────────────────────
export const cfg = { ...DEFAULT_CFG };

// ── Candle history: { 'BTCUSDT_4h': Candle[] } ───────────
export const candles = {};

// ── Active WebSocket connections: { 'BTCUSDT_4h': WebSocket } ──
export const wsMap = {};

// ── Latest signal per stream: { 'BTCUSDT_4h': Signal } ───
export const sigs = {};

// ── Latest price per symbol: { 'BTCUSDT': 67420 } ────────
export const prices = {};

// ── Scanner row cache for rendering ──────────────────────
export const scanRows = {};

// ── App mode ─────────────────────────────────────────────
export let mode   = 'live';
export let botOn  = true;
export let wsCount = 0;
export let sigTotal = 0;
export let apiKey   = localStorage.getItem(STORAGE_KEYS.apiKey) || '';
export let chartSym = 'BTCUSDT';
export let chartTF  = '4h';
export let pChart   = null;
export let eChart   = null;

// ── Setters (needed because `let` exports can't be mutated from outside) ──
export function setMode(m)      { mode    = m; }
export function setBotOn(v)     { botOn   = v; }
export function setWsCount(n)   { wsCount = n; }
export function incSigTotal()   { sigTotal++; }
export function setApiKey(k)    { apiKey  = k; localStorage.setItem(STORAGE_KEYS.apiKey, k); }
export function setChartSym(s)  { chartSym = s; }
export function setChartTF(t)   { chartTF  = t; }
export function setPChart(c)    { pChart   = c; }
export function setEChart(c)    { eChart   = c; }

// ── Paper portfolio ───────────────────────────────────────
function loadPaper() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.paper);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export const paper = loadPaper() || { bal: 10000, open: [], closed: [], peak: 10000 };

export function savePaper() {
  localStorage.setItem(STORAGE_KEYS.paper, JSON.stringify(paper));
}

export function resetPaper() {
  paper.bal    = 10000;
  paper.open   = [];
  paper.closed = [];
  paper.peak   = 10000;
  savePaper();
}

export function setPaperBal(amount) {
  const n = parseFloat(amount);
  if (!isFinite(n) || n < 100) return false;
  paper.bal    = n;
  paper.peak   = Math.max(paper.peak, n);
  paper.open   = [];   // close all open positions when balance resets
  savePaper();
  return true;
}

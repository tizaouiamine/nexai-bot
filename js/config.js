/**
 * config.js — Immutable constants and defaults
 * No side effects. Safe to import anywhere.
 */

export const PAIRS = [
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT',
  'ARBUSDT','OPUSDT','LINKUSDT','AVAXUSDT',
  'INJUSDT','DOTUSDT',
];

export const REST_URL = 'https://api.binance.com/api/v3';
export const WS_URL   = 'wss://stream.binance.com:9443/ws';

export const SOCIAL = [
  { n:'M. Saylor',  t:'BTC accumulation continues. Institutions loading.',       s:'Bullish', c:'BTC' },
  { n:'Adam Khoo',  t:'Risk management first. Protect capital always.',           s:'Neutral', c:'ALL' },
  { n:'Rayner Teo', t:'SOL breaking key resistance. Watch for follow through.',   s:'Bullish', c:'SOL' },
  { n:'D. Marcus',  t:'ETH Layer2 adoption driving real utility.',                s:'Bullish', c:'ETH' },
  { n:'M. Lawson',  t:'Altseason signals: BTC dominance dropping slowly.',        s:'Bullish', c:'ALT' },
];

/** Default live trading config — can be mutated via applyConfig() */
export const DEFAULT_CFG = {
  tp:        0.06,    // Take profit %
  sl:        0.02,    // Stop loss %
  trail:     0.015,   // Trailing stop %
  risk:      0.02,    // Risk per trade %
  maxTrades: 6,       // Max concurrent paper trades
  minConf:   65,      // Minimum signal confidence
  tf:        '4h',    // Primary timeframe
};

/** Indicator parameters — tuned for 1h–4h swing trading */
export const IND = {
  emaFast:  9,
  emaSlow:  21,
  rsiPer:   14,
  rsiOB:    70,   // Overbought
  rsiOS:    30,   // Oversold
  macdFast: 12,
  macdSlow: 26,
  macdSig:  9,
  bbPer:    20,
  bbMult:   2,
  volMAPer: 20,
};

export const STORAGE_KEYS = {
  paper:  'nexai_paper',
  apiKey: 'nexai_key',
};

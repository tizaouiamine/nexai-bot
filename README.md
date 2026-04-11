# NEXAI — AI-Powered Crypto Trading Bot

> Auto-trading bot with AI signal detection, self-learning engine, paper simulation, and backtesting.  
> Live at: **https://tizaouiamine.github.io/nexai-bot/**

---

## What it does

NEXAI scans up to 300 live crypto pairs on Binance (or MEXC), scores each one using a multi-factor AI engine, and automatically executes paper trades when confidence passes your threshold. The AI learns from historical outcomes to improve signal accuracy over time.

**Core capabilities:**
- Real-time WebSocket price feeds — Binance + MEXC
- Multi-factor signal engine: EMA 9/21 · RSI · MACD · Bollinger Bands · Volume
- AI engine filters: EMA 200 regime · ATR adaptive SL/TP · Candle patterns · Vol spike gate · Multi-TF (1D)
- Self-learning training mode — measures factor accuracy over history, updates weights
- Paper trading simulation — full SL/TP1/TP2/trailing/reversal lifecycle
- Historical backtesting — Sharpe ratio, max drawdown, per-trade log
- Claude AI chat assistant — live market context injected into every response
- User authentication — Google + Email passwordless (Firebase)

---

## Pre-deploy Audit Checklist

### ✅ Code & Architecture
- [x] ES module architecture — 12 clean modules, no globals
- [x] Single source of truth (`js/state.js`)
- [x] All Binance/MEXC prices validated with `safePrice()` before use
- [x] No `eval()`, no `innerHTML` with user data — XSS safe
- [x] Content Security Policy meta tag restricts all external connections
- [x] API keys never hardcoded — localStorage only
- [x] WebSocket exponential backoff reconnect `[3000, 5000, 10000, 30000]ms`
- [x] Tab switching, chart, sim stats — all bugs patched

### ✅ AI Engine
- [x] EMA 200 market regime filter — blocks counter-trend entries
- [x] ATR-based adaptive SL/TP — reacts to actual volatility
- [x] Candle pattern detection — hammer, engulfing, shooting star, doji
- [x] Volatility spike gate — skips entries at 3.5× normal vol
- [x] Multi-timeframe confirmation — 1D alignment required
- [x] Trained weights integration — `applyWeights()` adjusts confidence post-training

### ✅ Auth
- [x] Firebase Auth — Google Sign-In + Email magic link
- [x] Demo mode if Firebase not configured — all features work locally
- [x] Sign-out from user pill in header

### ⬜ Before live real-money trading (future)
- [ ] Backend server for Binance signed order endpoints (HMAC-SHA256)
- [ ] API key stored server-side (never in browser for real trading)
- [ ] Rate limit handling on order placement
- [ ] Telegram / email alert system

---

## Setup Guide

### 1. Run locally

Requires a local HTTP server (ES modules don't work on `file://`).

**Option A — VS Code Live Server** (easiest):
```
Right-click index.html → Open with Live Server
```

**Option B — Python:**
```bash
cd "C:\Users\Marwene\Desktop\Claude V1"
python -m http.server 8080
# Open: http://localhost:8080
```

**Option C — Node:**
```bash
npx serve "C:\Users\Marwene\Desktop\Claude V1"
```

---

### 2. Set your Anthropic API key

1. Get a key at [console.anthropic.com](https://console.anthropic.com)
2. Open the app → paste key in the **Anthropic API Key** field → click **Set**
3. Key is saved to `localStorage` — never sent anywhere except directly to Anthropic

---

### 3. Configure Firebase Auth (optional — skip for demo mode)

Firebase Auth enables real user accounts across devices.

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → New project
2. **Authentication** → Get started
3. Enable sign-in methods:
   - **Google** → enable → save
   - **Email/Password** → enable → also enable **Email link (passwordless)** → save
4. **Project Settings** → Your apps → Add web app → copy config
5. Open `js/auth.js` and replace the `FIREBASE_CONFIG` block:

```js
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSy...',
  authDomain:        'your-project.firebaseapp.com',
  projectId:         'your-project-id',
  storageBucket:     'your-project.appspot.com',
  messagingSenderId: '123456789',
  appId:             '1:123...',
};
```

6. **Authentication** → Settings → Authorised domains → add:
   - `localhost` (for local dev)
   - `tizaouiamine.github.io` (for GitHub Pages)

---

### 4. Deploy to GitHub Pages

Push to `main` — GitHub Actions auto-deploys:

```bash
git add -A
git commit -m "Deploy beta"
git push origin main
```

The workflow at `.github/workflows/deploy.yml` runs on every push to `main`  
and deploys the `root` directory to GitHub Pages.

Check deployment status: `https://github.com/tizaouiamine/nexai-bot/actions`

---

## How to use

### Live tab
- Shows real-time scanner for all active USDT pairs
- Sorted by AI confidence score (highest first)
- Click any row to load its price chart
- Signal feed shows all signals ≥55% confidence

### Simulation tab
- Bot automatically enters paper trades when AI engine score ≥ your **Min AI Score** threshold
- Toggle **Bot ON/OFF** in header
- Adjust SL, TP, trailing stop, risk per trade in the config panel
- Trade lifecycle: entry → TP1 (breakeven SL) → TP2 (close) or trailing stop

### Training tab
1. Select timeframe and number of pairs to train on
2. Click **Run Training** — runs historically, measures signal accuracy
3. Results show which factors (e.g. "EMA Bull Cross", "RSI Oversold") have highest win rate
4. Learned weights are saved to `localStorage` and applied to all future signals automatically
5. Click **Reset Weights** to clear and retrain from scratch

### Backtest tab
- Enter any symbol + timeframe + candle count
- See Sharpe ratio, max drawdown, win rate, full trade log

---

## Project Structure

```
nexai-bot/
├── index.html                    # Entry point — login overlay + full UI
├── css/
│   └── style.css                 # Design system
├── js/
│   ├── config.js                 # Constants, API URLs, fetchAllPairs()
│   ├── state.js                  # Single source of truth
│   ├── indicators.js             # EMA, RSI, MACD, Bollinger Bands (pure)
│   ├── strategy.js               # Multi-factor signal detect()
│   ├── engine.js                 # AI filters: regime, ATR, patterns, vol, MTF
│   ├── training.js               # Self-learning: train on history, store weights
│   ├── binance.js                # Binance WebSocket + REST adapter
│   ├── mexc.js                   # MEXC WebSocket + REST adapter
│   ├── paper.js                  # Paper trading engine
│   ├── backtest.js               # Historical backtesting engine
│   ├── ui.js                     # All DOM rendering
│   ├── chat.js                   # Claude API chat with live context
│   ├── auth.js                   # Firebase Auth (Google + Email)
│   └── app.js                    # Main orchestrator
├── .github/
│   └── workflows/deploy.yml      # Auto-deploy to GitHub Pages
├── Workflows/
│   └── research-report.md
├── ressources/
│   ├── research-methodology.md
│   └── report-template.md
├── Outputs/                       # gitignored — local reports only
├── claude.md                      # AI agent project context
└── README.md
```

---

## Reference Books (strategy foundation)

| Book | Author | Applied in |
|------|--------|-----------|
| Technical Analysis of the Financial Markets | John J. Murphy | `indicators.js`, `strategy.js` |
| Trading in the Zone | Mark Douglas | `training.js` (probability framework) |
| Market Wizards | Jack D. Schwager | SL/trail logic in `paper.js` |
| Japanese Candlestick Charting | Steve Nison | `engine.js` pattern detector |
| The Black Swan | Nassim Taleb | volatility gate in `engine.js` |
| The Alchemy of Finance | George Soros | sentiment weighting concept |
| Day Trading the Currency Market | Kathy Lien | 4h/1d swing strategy |

Source: [IG UK — Best Trading Books](https://www.ig.com/uk/special-reports/best-trading-books)

---

## Hosting Recommendation for Beta (live trading)

| Option | Cost | Suitable for |
|--------|------|-------------|
| **GitHub Pages** (current) | Free | Paper trading only — no secrets, no backend |
| **Railway.app** | Free / $5/mo | Add Node backend for real order signing |
| **Render.com** | Free / $7/mo | Same as Railway, free tier sleeps after 15min |
| **Hetzner VPS CX11** | €4.5/mo | Best for 24/7 bot — full control, no cold starts |
| **Contabo VPS S** | €5/mo | High storage, EU hosted |

**For real Binance/MEXC order execution:** You need a Node.js backend server to:
- Store exchange API keys securely (never in the browser)
- Sign orders with HMAC-SHA256
- Handle rate limits and order confirmation

GitHub Pages can host the UI; the backend handles order execution. Railway or a VPS is the right next step when ready to go live.

---

## Security

- API keys stored only in `localStorage` — never committed to repo
- CSP meta tag restricts all outbound connections to known domains only
- All prices validated as finite positive numbers before use (`safePrice()`)
- No `eval()`, no `innerHTML` with external data
- Firebase Auth tokens managed by Firebase SDK — not stored manually
- No backend = no server-side attack surface (paper trading mode)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Pure HTML / CSS / ES Modules (no framework, no build step) |
| Charts | Chart.js v4 (CDN) |
| AI Chat | Anthropic Claude Haiku (claude-haiku-4-5-20251001) |
| Exchange A | Binance API v3 — WebSocket + REST |
| Exchange B | MEXC API v3 — WebSocket + REST |
| Auth | Firebase Authentication v10 |
| Hosting | GitHub Pages |
| CI/CD | GitHub Actions (auto-deploy on push to main) |

---

*NEXAI is a paper trading and research tool. It does not place real orders. Past signal accuracy does not guarantee future results. Always apply independent risk management.*

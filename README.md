# NEXAI Trading Bot

An AI-powered crypto trading dashboard with live market scanning, social sentiment analysis, and a Claude-powered chat assistant.

## Live Demo
> Hosted via GitHub Pages — link appears here after deployment

## Features
- Real-time market scanner across 847+ pairs
- AI confidence scoring per signal
- RSI, MACD, manipulation detection
- Social intelligence feed
- Bot configuration panel (TP, SL, trailing stop, risk %)
- **Claude AI assistant** — ask anything about market conditions

## Setup

### 1. Get your Anthropic API key
Create an account at [console.anthropic.com](https://console.anthropic.com) and generate an API key.

### 2. Open the app
Open `index.html` in any modern browser — no server required.

### 3. Set your API key
Paste your API key into the **API Key** field in the Bot Configuration panel and click **Set**.  
The key is stored in your browser's localStorage — never sent anywhere except directly to Anthropic.

## Project Structure

```
├── index.html              # Main trading dashboard (GitHub Pages entry point)
├── trading-bot.html        # Alias / development copy
├── Workflows/              # Agent workflow recipes
│   └── research-report.md
├── ressources/             # Templates and methodology docs
│   ├── research-methodology.md
│   └── report-template.md
├── Outputs/                # Generated reports (gitignored)
└── claude.md               # AI agent configuration
```

## Tech Stack
- Pure HTML / CSS / JavaScript — zero dependencies except Chart.js (CDN)
- [Chart.js](https://www.chartjs.org/) for price charts
- [Anthropic Claude API](https://docs.anthropic.com) for AI assistant

## Security Note
Your API key is stored only in your browser's `localStorage`. It is **never** committed to this repository. Do not hardcode keys in source files.

## Roadmap
- [ ] Connect to live Binance WebSocket API
- [ ] Portfolio tracking panel
- [ ] Trade history persistence
- [ ] Alert notifications (email / Telegram)
- [ ] Backend proxy for secure API key handling

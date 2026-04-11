# Project Context

This workspace is the development environment for **NEXAI Bot** — an AI-powered automated crypto trading website connected to the Binance API. The goal is a fully autonomous trading system where AI handles signal detection, trade execution, risk management, and self-improvement over time.

The project lives at: https://github.com/tizaouiamine/nexai-bot
Live site: https://tizaouiamine.github.io/nexai-bot/

# About Me

I build AI-powered tools for trading and productivity. I want systems that work autonomously, are grounded in data and evidence, and are explainable — not black boxes. I think scientifically: hypotheses, evidence, iteration. I prefer concise, jargon-free output with clear reasoning behind every decision.

# Core Project: NEXAI Auto Trading Bot

## What it is
A browser-based trading dashboard that:
- Scans 847+ crypto pairs on Binance in real time
- Scores each pair using AI (RSI, MACD, volume, manipulation detection, social sentiment)
- Executes trades automatically based on configurable confidence thresholds
- Learns from trade outcomes to improve signal accuracy over time
- Provides a Claude-powered AI assistant for market analysis and config advice

## Key Files
- `index.html` — main trading dashboard (GitHub Pages entry point)
- `trading-bot.html` — development working copy
- `Workflows/` — agent workflow recipes
- `ressources/` — methodology docs and report templates
- `Outputs/` — generated reports (gitignored, local only)

## Tech Stack
- **Frontend:** Pure HTML / CSS / JavaScript (ES modules, no framework)
- **Charts:** Chart.js v4 (CDN)
- **AI Assistant:** Anthropic Claude API (claude-haiku-4-5-20251001)
- **Exchanges:** Binance API + MEXC API (WebSocket + REST)
- **Hosting:** GitHub Pages (static, local server for dev)
- **Version control:** GitHub — branch `main` → auto-deploys to Pages

## Current State (as of 2026-04-11)
- [x] ES module architecture — 10 clean modules (config, state, indicators, strategy, binance, mexc, paper, backtest, ui, chat, engine, app)
- [x] AI engine with 5 filters: EMA200 regime, ATR sizing, candle patterns, vol spike gate, multi-TF confirmation
- [x] Live scanner: fetches all active USDT pairs (~300 Binance, ~200 MEXC) via exchangeInfo
- [x] Paper trading (simulation): full SL/TP1/TP2/trailing/reversal logic, localStorage persistence
- [x] Backtesting tab: Sharpe ratio, max drawdown, per-trade log
- [x] Claude AI chat assistant with live market context injection
- [x] MEXC exchange adapter (switchable from UI)
- [x] GitHub Actions CI/CD (auto-deploy on push)
- [ ] Real trade execution (Binance/MEXC signed orders) — needs backend server
- [ ] Alert system (Telegram / email notifications)
- [ ] Strategy self-improvement (outcome feedback loop)
- [ ] Multi-pair portfolio view with real P&L

# Thinking Approach

Apply scientific reasoning to all decisions in this project:
- **Hypothesis first** — before building anything, state what you expect it to do and why
- **Evidence-based** — back recommendations with data, research, or documented precedent
- **Iterative** — prefer small testable steps over big untested builds
- **Skeptical of hype** — crypto and AI are both hype-prone fields; flag overclaims explicitly
- **Transparent uncertainty** — if something is unknown or contested, say so clearly

# Rules

- Always ask clarifying questions before starting a complex task
- Show your plan and steps before execution
- Keep reports and summaries concise — bullet points over paragraphs
- Save all output files to the `Outputs/` folder
- Cite sources when doing research
- Before touching the trading bot code: state the hypothesis (what change does X produce and why)
- Never hardcode API keys — they go in localStorage or environment variables only
- After any code change: describe how to verify it works (test step)

# Project Structure

- `index.html` — live site entry point
- `trading-bot.html` — dev copy
- `Workflows/` — workflow instruction files (plain English recipes the agent follows)
- `Outputs/` — finished deliverables (reports, drafts, analysis) — gitignored
- `ressources/` — reference docs and templates

# Available Workflows

- **Research & Report** (`Workflows/research-report.md`) — Given any topic, ask clarifying questions, research thoroughly using `ressources/research-methodology.md`, and produce a structured report using `ressources/report-template.md`. Save output to `Outputs/`.
  - Trigger: User says "research [topic]" or "write a report on [topic]"

# Reference Books

Source: [IG UK — The 10 Best Trading Books of All Time](https://www.ig.com/uk/special-reports/best-trading-books)

Use these books as the intellectual foundation for all strategy decisions, signal logic, risk rules, and AI reasoning in NEXAI. When implementing a feature (e.g. trailing stop, position sizing, sentiment analysis), cross-reference the relevant book's framework before coding.

| # | Title | Author | Core Relevance to NEXAI |
|---|-------|--------|------------------------|
| 1 | **Technical Analysis of the Financial Markets** | John J. Murphy | Primary reference for all indicators: EMA, RSI, MACD, Bollinger Bands, volume. 400+ charts. Treat as the indicator bible. |
| 2 | **Trading in the Zone** | Mark Douglas | Psychological foundation: why traders are inconsistent, probability mindset, eliminating emotional bias. Applies to bot config discipline and paper trading evaluation. |
| 3 | **Market Wizards** | Jack D. Schwager | Interviews with the world's top traders. Key patterns: discipline, cut losses fast, let winners run — directly maps to SL/trail logic. |
| 4 | **Japanese Candlestick Charting Techniques** | Steve Nison | Candlestick pattern reference for the engine.js pattern detector (hammer, engulfing, doji, shooting star). |
| 5 | **The Intelligent Investor** | Benjamin Graham | Value investing framework. Use for filtering fundamentally weak assets from the scanner. |
| 6 | **The Black Swan** | Nassim Nicholas Taleb | Fat-tail risk model. Justifies the volatility spike gate in engine.js and conservative position sizing. |
| 7 | **The Alchemy of Finance** | George Soros | Reflexivity theory — markets are shaped by participant beliefs, not just fundamentals. Informs sentiment signal weighting. |
| 8 | **Pit Bull: Lessons from Wall Street's Champion Day Trader** | Martin 'Buzzy' Schwartz | Practical day-trading rules from a champion trader. Discipline, technical setups, managing drawdown. |
| 9 | **The Big Short** | Michael Lewis | Case study in contrarian signal detection and risk management. Relevant to reversal logic and macro regime detection. |
| 10 | **Day Trading and Swing Trading the Currency Market** | Kathy Lien | Technical and fundamental strategies for short-to-mid term trades. Directly applicable to 4h/1d timeframe strategy. |

## How to use these books in development

- **Before adding an indicator**: check what Murphy says about its strengths and failure modes
- **Before tuning SL/TP/trail**: apply Schwager's "cut losses, let winners run" principle
- **Before adding a new filter**: ask if Taleb's fat-tail risk framework would block it
- **When reviewing backtest results**: apply Douglas's probability thinking — a 60% win rate over 50+ trades is meaningful; 3 trades is noise

# GitHub Repository & Libraries

## Project Repo
- **NEXAI Bot** — [github.com/tizaouiamine/nexai-bot](https://github.com/tizaouiamine/nexai-bot)
  - Branch `main` → auto-deploys to GitHub Pages
  - Live site: https://tizaouiamine.github.io/nexai-bot/

## Key Libraries Used (CDN / referenced)
| Library | Version | Purpose | Docs |
|---------|---------|---------|------|
| [Chart.js](https://github.com/chartjs/Chart.js) | v4 | Price charts | https://www.chartjs.org/docs/latest |
| [Anthropic Claude API](https://github.com/anthropics/anthropic-sdk-js) | claude-haiku-4-5 | AI assistant | https://docs.anthropic.com |
| Binance WebSocket API | v3 | Live prices | https://binance-docs.github.io/apidocs |
| MEXC API | v3 | Alternative exchange | https://mexcdevelop.github.io/apidocs |

## Useful Reference Repos (open source strategy research)
| Repo | What it offers |
|------|---------------|
| [freqtrade/freqtrade](https://github.com/freqtrade/freqtrade) | Production crypto bot — study their strategy interface and risk engine |
| [jesse-ai/jesse](https://github.com/jesse-ai/jesse) | Research-grade backtesting framework — compare backtest methodology |
| [ta-lib/ta-lib](https://github.com/TA-Lib/ta-lib) | C indicator library — cross-check our calcEMA/RSI/MACD implementations |
| [twopirllc/pandas-ta](https://github.com/twopirllc/pandas-ta) | 130+ indicators in Python — reference for adding new indicators to indicators.js |

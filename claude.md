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

# AI Agent Engineering Framework

Source: [Top Books to Help You Build AI Agents Like Claude Code in 2026](https://medium.com/@victor.dibia/top-books-to-help-you-build-ai-agents-like-claude-code-in-2026-074ab71ac0c1) — Victor Dibia, 2026

**Mandate:** When engineering any part of the NEXAI AI engine, orchestration, tool use, or agent loop — apply the frameworks from the books below. These define HOW the AI components are architected, not just what they trade. Think of NEXAI as a multi-agent system where each module (strategy.js, engine.js, training.js, chat.js) is an agent with a role, tools, and memory.

---

## Core Books — Apply Now

### 1. Designing Multi-Agent Systems — Victor Dibia (2025)
**The primary architecture reference for NEXAI's AI engine.**

Key concepts to apply directly:
- **Agents, Tools, Memory** — `engine.js` is the orchestrator agent; `strategy.js`, `binance.js`, `training.js` are its tools
- **Six orchestration strategies** — NEXAI uses a *sequential pipeline*: candle → detect → evaluate → applyWeights → tryEnter. Consider upgrading to *parallel multi-agent* (scan multiple TFs simultaneously)
- **Deterministic workflows** — the `onCandle` event loop is a deterministic workflow; each step has a defined input/output contract
- **Trajectory-based testing** — test the bot's decision path end-to-end, not just individual functions
- **Autonomous orchestration** — `app.js` is the master orchestrator; `engine.js` is a sub-agent that returns structured `EnrichedSignal`
- **MCP/A2A protocols** — future: expose NEXAI tools (get_signal, place_order, get_portfolio) as MCP tools so Claude can call them directly

**Apply when:** designing new modules, adding a new AI capability, or refactoring the engine loop.

---

### 2. Generative AI Design Patterns — Lakshmanan & Hapke (2025)
**Pattern library for every AI feature in NEXAI.**

32 patterns — the ones directly applicable:

| Pattern | Where used in NEXAI | How to apply |
|---------|-------------------|-------------|
| **Tool calling** | `chat.js` system prompt gives Claude market data as context | Add real tool calls: `get_signal(pair)`, `get_portfolio()` |
| **Chain-of-Thought** | `engine.js` `filters[]` array is CoT reasoning — each step logged | Expand: make the engine explain each filter decision |
| **Tree-of-Thought** | Not yet implemented | Use for multi-hypothesis: "Is this a LONG or SHORT setup and why?" |
| **RAG (Retrieval-Augmented Generation)** | Not yet implemented | Retrieve relevant historical trades before Claude responds |
| **Reliability + guardrails** | `safePrice()`, vol spike gate, regime filter | Every AI output must be validated before acting on it |
| **Multi-agent collaboration** | `engine.js` + `training.js` + `chat.js` run independently | Wire them: training informs engine; engine informs chat context |

**Apply when:** adding any new AI feature — first identify which pattern it maps to.

---

### 3. Build a Large Language Model (From Scratch) — Sebastian Raschka (2024)
**Foundation for understanding why Claude behaves the way it does in chat.js.**

Key concepts to apply:
- **Context window & token limits** — the `buildSystemPrompt()` in `chat.js` injects live prices and signals; keep it under ~800 tokens to leave room for reasoning
- **Attention mechanisms** — Claude attends to the most recent tokens most strongly; put the most critical market data *last* in the system prompt
- **Finetuning / LoRA** — future: fine-tune a small model on NEXAI's trade history to replace or assist the rule-based strategy
- **Instruction following** — if Claude ignores part of the prompt, the token position matters — reorder, not rewrite

**Apply when:** writing or debugging `chat.js` system prompts, or planning a fine-tuned signal model.

---

### 4. Building Applications with AI Agents — Michael Albada (2025)
**Framework trade-off analysis and human-agent collaboration patterns.**

Key concepts to apply:
- **Framework comparison** (LangGraph / AutoGen style) — NEXAI's `app.js` is a hand-rolled agent orchestrator. It is the right choice for a static JS app. If a Python backend is added later, use LangGraph for the agent loop.
- **Human-agent collaboration** — the "Bot: ON/OFF" toggle and config panel are the human-in-the-loop interface. The bot proposes, the human approves via config (min confidence, SL, TP).
- **Interface design** — the training tab, simulation tab, and chat are three different collaboration surfaces. Each must give the user enough transparency to trust the agent.
- **SFT / DPO / RL** — when trade history is large enough (200+ trades), use outcome data to fine-tune signal confidence weights via RL (reward = profitable close, penalty = SL hit)

**Apply when:** designing the UX for any new bot capability, or planning the Python backend agent.

---

## Upcoming — Monitor for Future Features

### 5. AI Agents with MCP — Kyle Stratis (O'Reilly, late 2026)
- **Apply to:** Building NEXAI as an MCP server so Claude Code / Cursor / Claude Desktop can call `nexai_get_signal`, `nexai_place_order`, `nexai_backtest` as tools
- **Action:** When this ships, expose `js/engine.js` outputs as MCP tool responses

### 6. An Illustrated Guide to AI Agents — Grootendorst & Alammar (O'Reilly, Dec 2026)
- **Apply to:** Visual reasoning about NEXAI's agent memory (candles, weights, paper portfolio) and planning (orchestration of multi-pair, multi-TF scanning)

---

## NEXAI Agent Architecture (derived from above frameworks)

```
┌─────────────────────────────────────────────────────────┐
│                    NEXAI Orchestrator (app.js)           │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │Perception│  │ Reasoning │  │  Action  │  │Memory  │  │
│  │binance.js│→ │engine.js  │→ │paper.js  │  │state.js│  │
│  │mexc.js   │  │strategy.js│  │backtest  │  │weights │  │
│  │(Tools)   │  │training.js│  │chat.js   │  │candles │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘  │
│                                                          │
│  Event bus: CustomEvent('nexai:candle') — decoupled     │
└─────────────────────────────────────────────────────────┘
```

**When adding any new AI feature, place it in the correct layer:**
- **Perception** (new data source) → create a new adapter like `binance.js`
- **Reasoning** (new signal logic) → extend `engine.js` with a new filter
- **Action** (new trade type) → extend `paper.js` or add `orders.js` for real trades
- **Memory** (new persistent state) → add to `state.js` with a localStorage-backed setter

---

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

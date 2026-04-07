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

## Tech Stack
- **Frontend:** Pure HTML / CSS / JavaScript (no framework)
- **Charts:** Chart.js (CDN)
- **AI Assistant:** Anthropic Claude API (claude-haiku-4-5-20251001)
- **Exchange:** Binance API (WebSocket + REST)
- **Hosting:** GitHub Pages (static)
- **Version control:** GitHub — branch `main` → auto-deploys to Pages

## Key Files
- `index.html` — main trading dashboard (GitHub Pages entry point)
- `trading-bot.html` — development working copy
- `Workflows/` — agent workflow recipes
- `ressources/` — methodology docs and report templates
- `Outputs/` — generated reports (gitignored, local only)

## Current State (as of 2026-04-07)
- [x] Dashboard UI complete (scanner, chart, trade log, config panel)
- [x] Claude AI chat assistant wired up with proper API headers
- [x] GitHub repo created and connected
- [x] GitHub Pages live
- [ ] Binance WebSocket for live price feeds (next priority)
- [ ] Binance REST API for real trade execution
- [ ] Portfolio tracker with real P&L
- [ ] Trade history persistence (localStorage or backend)
- [ ] Alert system (Telegram / email)

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

# Marketing Spend Review (NexaGroup demo)

**One-liner:** A quarter-to-date marketing budget-vs-expense dashboard that classifies
every spend line as Promotional or Trade offer and turns a messy spreadsheet into a
review-ready story — running here on fully synthetic data.

## Problem

Group marketing spend usually lives in a workbook with one tab per business unit, dozens of
activity lines per tab, inconsistent labels, and numbers typed in mixed units. Building the
quarterly review means hours of manual tab-hopping, and the classification that leadership
actually asks about ("how much of this was real brand investment vs trade discounting?")
is decided by hand, differently by every analyst.

## Solution

A zero-backend dashboard that reads one tab per business unit, parses the Budget/Expense
rows for 12 months, classifies each line by keyword rules, and renders the review:
achievement vs plan, promotional/trade mix, month phasing, outlier lines and a drill-down —
with automatic data-quality flags so the analyst can defend the numbers. In this portfolio
copy the same code path is fed an embedded synthetic dataset, so it renders offline with no
credentials.

## Features

* Part 1 — quarterly achievement (utilisation) per unit, Promotional vs Trade split,
  monthly budget/expense chart, largest over-budget and unspent lines, filterable activity drill-down.
* Part 2 — full-year plan per unit, share of group, promo/trade mix, spend to date, remaining budget,
  category breakdown.
* Keyword-driven Promotional/Trade classification with per-line overrides (configurable, no code).
* Auto-detected data-quality flags: unbudgeted spend, Q1-only budgets, plain-Taka entries,
  missing month headers, empty template tabs.
* Sortable tables, hover tooltips, % / absolute toggle, light + dark theme, localStorage tab memory.
* Optional read-only edge API (`worker.js`) that discovers new unit tabs automatically.

## Tech stack

Vanilla JavaScript (ES2020, no framework) · hand-rolled SVG/CSS charts · CSV parsing from
scratch · Vite (dev/build/preview, optional) · Cloudflare-Workers-style edge function example.

## Demo disclaimer

All names and numbers are invented for this portfolio piece. "NexaGroup", "Nexa Cement",
"Nexa Steel", "Nexa AgroFeeds", "Nexa Foods" and the other units are fictional; budgets,
expenses and activity labels are generated synthetic data of realistic magnitude. No real
organisation, spreadsheet, ledger or transaction is referenced.

## Run locally

```bash
# no install needed — open the file directly
open public/index.html

# or with Vite
npm install
npm run dev          # http://localhost:5173
```

## Deploy on Vercel

* Import the repository, **Framework Preset: Other** (static).
* **Root Directory: `public`** · Build Command: *empty* · Output Directory: *empty*.
* Alternative: keep root at the repo root with Preset **Vite**, Build Command
  `npm run build` and Output Directory `public/dist`.

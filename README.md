![Quarterly Marketing Review](assets/banner.svg)

# Marketing Spend Review — portfolio demo

[![Deployed on Vercel](https://img.shields.io/badge/Vercel-Live%20demo-0F172A?style=flat&logo=vercel&logoColor=white)](https://vercel.com "Live demo placeholder") [![Static app](https://img.shields.io/badge/build-none%20required-10B981?style=flat)](#run-locally) [![Data](https://img.shields.io/badge/data-synthetic-F59E0B?style=flat)](#demo-data-disclaimer)

A quarterly marketing budget-vs-expense dashboard for a **fictional** group ("NexaGroup").
It reads one spreadsheet tab per business unit, classifies every spend line as
*Promotional* or *Trade offer*, and renders the review a marketing/finance team asks for
each quarter: achievement vs plan, promo/trade mix, month phasing, over/under-budget
lines, full-year summary and a filterable activity drill-down — plus auto-detected
data-quality flags so the analyst can defend every number. Dark-first, data-dense UI
(Fira Sans / Fira Code), zero backend, works offline from a single `index.html`.

![Dashboard screenshot](assets/banner.png)

## Run locally

```bash
open public/index.html   # no install, no network — demo mode is self-contained
npm install              # optional: Vite dev/build/preview
npm run dev              # http://localhost:5173
```

## Features

* **Part 1 — Quarter to date**: utilisation per unit, Promotional vs Trade split, monthly budget/expense chart, largest over-budget and unspent lines, drill-down with SBU/type filters.
* **Part 2 — Full year**: annual plan per unit, share of group, promo/trade mix, spend to date, remaining budget, monthly phasing, category breakdown.
* **Data notes**: methodology, live-detected quality flags (unbudgeted spend, plain-Taka entries, empty template tabs), and every line classified as Trade.
* Keyword-driven Promotional/Trade classification with per-line overrides — config only, no code.
* Sortable tables, hover tooltips, %/absolute toggle, dark+light theme, tab memory via `localStorage`.
* Hand-rolled SVG/CSS charts, no chart library.

## Demo data disclaimer

Every company name, business unit, activity label and figure is **synthetic**
(`public/assets/demo-data.js`). "NexaGroup", "Nexa Cement", "Nexa Steel" etc. are
fictional; no real organisation, ledger or transaction appears. The parsing,
classification and charting code is the production logic — set `demoMode:false` in
`public/assets/config.js` and add your sheet id to point the same dashboard at your
own spreadsheet (read-only; share as *Anyone with the link → Viewer*).

## Files

```
public/index.html             page shell (tabs, top bar)
public/assets/app.js          parsing, classification, aggregation, rendering
public/assets/config.js       settings — edit this, no code changes needed
public/assets/demo-data.js    synthetic dataset, one CSV per business unit
public/assets/styles.css      design system (spec v2 tokens, dark-first)
worker.js / wrangler.toml     optional read-only tab-discovery edge API
```

## Deploy on Vercel

Import the repo → Framework Preset **Other** (static), Root Directory **`public`**, no
build command. Or use Preset **Vite** with `npm run build` and output `public/dist`.
The optional `worker.js` (Cloudflare) is an example only; the app falls back to
`config.js` without it.

## License

MIT — sample portfolio project.

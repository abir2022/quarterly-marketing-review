# Marketing Spend Review — portfolio demo

A budget-vs-expense dashboard for a **fictional** group ("NexaGroup"). It answers two
questions a marketing/finance team asks every quarter:

* **Part 1 – Quarter to date**: actual spend vs plan, split into *Promotional* vs
  *Trade offers*, by business unit, by month, plus the over/under-budget lines and an
  activity drill-down.
* **Part 2 – Full-year view**: annual plan per unit, share of group, promo/trade mix,
  spend to date, remaining budget, monthly phasing and a category breakdown.
* **Data notes**: method, automatically detected data-quality flags, and the list of
  lines classified as Trade.

> **Demo data only.** Every business unit name, activity label and figure is synthetic
> (see `public/assets/demo-data.js`). No real company, ledger or transaction appears.

## Run locally

No build step is required — the data is embedded:

```
open public/index.html          # or, with Vite:
npm install
npm run dev                     # http://localhost:5173
npm run build && npm run preview
```

## Point it at your own spreadsheet (optional)

`public/assets/config.js`:

* `demoMode: false` + `sheetId` / `sheetUrl` — the same code path then reads a
  spreadsheet live (read-only; share it as *Anyone with the link → Viewer*).
* `tabs` / `excludeTabs` – which sheets count as business units (live tab discovery
  overrides this list when it can read the workbook).
* `q1Months` / `quarterLabel` – which columns form the review quarter.
* `tradeKeywords` / `overrides` – Promotional vs Trade classification rules.
* `status` – under / on-plan / over / critical utilisation bands.
* `bdtThreshold` – cells at or above this are treated as plain Taka and converted.

## Files

```
public/index.html             page (demo banner + three tabs)
public/assets/app.js          parsing, classification, aggregation, charts
public/assets/config.js       settings (edit this)
public/assets/demo-data.js    synthetic demo dataset, one CSV per unit
public/assets/styles.css      styling (light + dark)
worker.js                     optional edge API: GET /api/tabs (unit auto-discovery)
wrangler.toml                 optional edge deploy config (static assets + worker)
package.json                  dev / build / preview (Vite)
```

## Deploy

Static hosting is enough (Vercel preset *Other*, root `public`, no build command).
`worker.js` + `wrangler.toml` are included as an example of a tiny read-only
tab-discovery API; the dashboard works without them and falls back to `config.js`.

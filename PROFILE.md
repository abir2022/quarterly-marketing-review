# PROFILE — Marketing Spend Review (NexaGroup portfolio demo)

## 1. Abstract

This artifact is a zero-backend, quarterly marketing budget-vs-expense dashboard for a
fictional multi-business-unit group ("NexaGroup"). It ingests one spreadsheet tab per
business unit, each holding Budget and Expense rows for twelve months in BDT Crore, and
turns the raw grid into a review-ready story: quarter-to-date achievement (utilisation)
per unit, a Promotional vs Trade-offer classification driven by editable keyword rules,
monthly phasing charts, the largest over-budget and unspent lines, an activity
drill-down, a full-year summary, and automatically detected data-quality flags. All
figures in this portfolio copy are synthetic and embedded (`assets/demo-data.js`), fed
through exactly the same parser used against a live sheet, so the dashboard runs
offline with no credentials. The UI follows a shared dark-first design system
(data-dense, Fira Sans/Fira Code, motion-as-feedback). The value proposition is that
the classification and quality-flagging an analyst would do by hand is encoded once,
transparently, in a configuration file.

## 2. Problem Framing

Group marketing spend typically lives in a workbook with one tab per business unit,
dozens of activity lines per tab, inconsistent labels, and numbers typed in mixed
units (sometimes Taka instead of Crore). Preparing the quarterly review means hours of
manual tab-hopping, and the question leadership actually asks — "how much of this was
real brand investment vs trade discounting?" — is answered differently by every
analyst because the Promotional/Trade boundary is decided ad hoc. There is no single
defensible source of the classification, the utilisation bands, or the exceptions. The
artifact exists to make that review reproducible: same parse, same rules, same flags,
every quarter.

## 3. Related Practice

In analyst work this kind of review draws on budget-utilisation (achievement) tracking —
actual spend against phased plan, usually banded red/amber/green around 100% —
expense-mix analysis that separates brand/promotional investment from trade
discounting (dealer commissions, rebates, POSM, sales-boost schemes), because the two
behave very differently in a P&L. Marketing-effectiveness teams also keep ROMI-style
ledgers where every line must be attributable; before ROI can be discussed, spend has
to be *trustworthy*, which is why practical dashboards carry data-quality flags
(unbudgeted spend, template tabs, unit typos) as a first-class feature rather than an
afterthought. Loss-bridge thinking appears in the over/under-budget variance tables:
the story is in the exceptions, not the average.

## 4. Methodology & Data Design

Conceptually the data is a read-only Google Sheet (one tab per SBU, Jul-26 … Jun-27
columns); for the portfolio build, synthetic CSV strings of identical shape live in
`assets/demo-data.js`. Transformation steps: (1) tab discovery — live from the sheet's
`htmlview` tab list, falling back to a worker endpoint or `config.js`; (2) structural
parse — locate the month-header row and the Budget/Expense label column, pair rows per
activity line; (3) unit normalisation — any cell ≥ `bdtThreshold` is treated as plain
Taka and divided by 1e7; (4) classification — a line is Trade if its category or
activity text contains any `tradeKeywords` token, else Promotional, with exact
`overrides`; (5) aggregation at line/SBU/group level. Metric definitions:
achievement/utilisation `U = expense / budget`; variance `V = expense − budget`;
Q1 = sum of the three `q1Months` columns; status bands — under-utilised `U < 70%`,
on plan `70–100%`, slightly over `≤ 110%`, over budget `> 110%`, unbudgeted = expense
with zero budget. Rows that fail validation raise flags instead of being silently kept.

## 5. Analytical Framework

The UI encodes a decision order: first the group-level truth (KPI row: budget, expense,
achievement, promo/trade split), then *where* the story is (utilisation by SBU, sorted
by budget size, colour only as a secondary channel to the status pill), then *what* to
act on (largest over-budget lines and unspent lines as exception tables, each sortable),
then *why* (activity drill-down filtered by SBU/type). The Promotional-vs-Trade mix is
shown on both the quarter and the annual budget because leadership questions about
"real brand investment" are mix questions. Empty or one-quarter-only budgets surface as
flags rather than zeroes, so understated achievement is visible, not hidden.

## 6. System Design

Static site: one HTML shell, four JS/CSS assets, no framework, no build step, no
backend. `app.js` is a single IIFE with a small state object; charts are hand-rolled
SVG (viewBox-scaled) and CSS bar tracks, so there is no chart-library dependency and
the page opens from `file://`. Rendering is full re-render on data change, which is
cheap at this data size (~hundreds of lines). Optional `worker.js` (Cloudflare
Workers style) exposes `GET /api/tabs` for tab discovery when the sheet's htmlview
list is blocked by CORS; the dashboard degrades gracefully to `config.js` names. Vite
exists only as a convenience for dev/preview. The design system lives entirely in
`styles.css` (spec v2 tokens, dark-first, `data-theme` toggle, focus-visible rings,
reduced-motion handling).

## 7. Findings & Design Decisions

The synthetic dataset is shaped like a realistic group: one dominant SBU carrying most
of the trade-offer budget, several units with Q1-only budgets entered, deliberate
unbudgeted spend lines and a plain-Taka typo — so the dashboard exercises every
exception path on first load. Key UI choices: dark-first data-dense palette (blue
`#3B82F6` + amber `#D97706`, no violet), Fira Code for all numerals and headings with
tabular figures, Fira Sans for body; KPI and card hover lift as the only motion beyond
a ≤450 ms first-paint stagger; status communicated by pill + label, never by colour
alone; tables scroll inside their own card to avoid page-level horizontal scroll at
390 px. The % / absolute toggle exists because utilisation ranking and monetary
materiality tell different stories.

## 8. Limitations & Validity

All names, units, activities and figures are **synthetic**; nothing here describes a
real organisation, ledger or transaction, and no real-world statistic is claimed. The
keyword classifier is heuristic — it will mis-file creatively named lines, which is
why overrides and the "lines classed as Trade" audit table exist. The parser assumes
the specific Budget/Expense-per-tab grid; other workbook shapes are out of scope.
Crore-level aggregation hides line-level noise; the drill-down is the remedy but is
capped by what the source sheet contains.

## 9. Reproducibility & Deployment

Run locally: open `public/index.html` directly — no install, no network. With Vite:
`npm install && npm run dev`. Deploy on Vercel: import the repo, Framework Preset
**Other**, Root Directory `public`, no build command (Vite preset with output
`public/dist` also works). The optional worker deploys with `wrangler` per
`wrangler.toml`. To use your own data: put the sheet id in `assets/config.js`, share
it *Anyone with the link → Viewer*, set `demoMode:false`. No environment variables are
required for the static demo.

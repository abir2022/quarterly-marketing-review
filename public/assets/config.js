/* =====================================================================
   DASHBOARD CONFIGURATION  — edit this file, no code changes needed.

   DEMO BUILD: this copy renders from the synthetic dataset in
   assets/demo-data.js (demoMode: true) so it works offline with no
   credentials. To point it at your own spreadsheet instead, paste your
   sheet id/url below, set demoMode to false, and share the sheet as
   "Anyone with the link can view" (it is only ever READ, never edited).
   ===================================================================== */
window.DASH_CONFIG = {
  demoMode: true,

  // placeholder — not a real document
  sheetId: "REPLACE_WITH_YOUR_SHEET_ID",
  sheetUrl: "https://docs.google.com/spreadsheets/d/REPLACE_WITH_YOUR_SHEET_ID/edit",
  fiscalYear: "FY 2026-27",

  // SBU tabs are discovered LIVE from the sheet on every Refresh (renamed,
  // added or removed tabs are picked up automatically). This list is only a
  // fallback if the tab list cannot be read. Tabs in excludeTabs are ignored;
  // tabs without Budget/Expense numbers (e.g. templates) are skipped anyway.
  // In demoMode these are the fictional business units in demo-data.js.
  tabs: ["Nexa Cement", "Nexa Steel", "Nexa AgroFeeds", "Nexa Foods", "Nexa Pharma",
         "Nexa Readymix", "Nexa Electronics", "Nexa AutoCare", "Nexa Travel"],
  excludeTabs: ["Format1", "Format", "Template", "Summary", "Dashboard"],

  // Q1 of the fiscal year (column headers in the sheet)
  q1Months: ["Jul-26", "Aug-26", "Sep-26"],
  quarterLabel: "Q1 (Jul–Sep 2026)",

  // Source unit is BDT Crore. Any single cell >= this value is assumed to be
  // typed in plain Taka by mistake and is converted ( / 1,00,00,000 ).
  bdtThreshold: 100,

  // ---- Promotional vs Trade-offer classification -------------------------
  // A line is "Trade" if its Category OR Activity name contains any keyword
  // (case-insensitive). Everything else is "Promotional".
  tradeKeywords: ["trade", "commission", "incentive", "discount", "offer",
                  "sales boost", "boost-up", "boost up", "sales promotion",
                  "posm", "rebate", "cash back", "cashback"],
  // Exact overrides:  "SBU|Activity name": "Trade" | "Promotional"
  overrides: {
    // "Nexa Travel|Distributor meets & engagement program": "Trade",
  },

  // ---- Utilisation status bands (expense ÷ budget) -----------------------
  status: { under: 0.70, over: 1.00, critical: 1.10 }
};

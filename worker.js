// Edge Worker (optional): serves the static dashboard in public/ and exposes
// GET /api/tabs, which lists the tab names of a spreadsheet so that new
// business-unit tabs appear on the dashboard without redeploying.
//
// Demo build: the sheet id is a PLACEHOLDER, supplied by the SHEET_ID
// environment variable. The dashboard does not need this Worker at all — it
// renders from the synthetic dataset in public/assets/demo-data.js, and it
// falls back to the tab list in config.js if this endpoint is unavailable.
// The endpoint is read-only: it never writes to the sheet.
const PLACEHOLDER = "REPLACE_WITH_YOUR_SHEET_ID";

const unJs = (x) =>
  x
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\(.)/g, "$1");

function parseTabs(html) {
  const re = /items\.push\(\{name: "((?:[^"\\]|\\.)*)"[^}]*?gid: "(\d+)"/g; // fresh lastIndex per call
  const tabs = [];
  let m;
  while ((m = re.exec(html))) tabs.push({ name: unJs(m[1]).trim(), gid: m[2] });
  return tabs;
}

async function listTabs(sheetId) {
  if (!sheetId || sheetId === PLACEHOLDER) {
    return { tabs: [], demo: true, note: "SHEET_ID is a placeholder — set the env var, or let the dashboard use the embedded demo dataset." };
  }
  const r = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`, {
    headers: { "User-Agent": "Mozilla/5.0 (dashboard tab discovery)" },
  });
  if (!r.ok) throw new Error(`Sheet returned HTTP ${r.status}`);
  return { tabs: parseTabs(await r.text()), demo: false };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/tabs") {
      try {
        const body = await listTabs((env && env.SHEET_ID) || PLACEHOLDER);
        return Response.json(body, { headers: { "Cache-Control": "no-store" } });
      } catch (e) {
        return Response.json({ tabs: [], error: String(e) });
      }
    }
    return env.ASSETS.fetch(request);
  },
};

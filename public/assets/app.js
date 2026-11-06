/* Marketing Spend Review — demo build.
   Renders from the synthetic dataset in assets/demo-data.js when
   config.demoMode is true; otherwise reads a Google Sheet live (read-only). */
(function () {
  "use strict";
  const C = window.DASH_CONFIG;
  const CACHE_KEY = "nexa-mkt-review-cache-v1";
  const TAB_KEY = "nexa-mkt-tab";
  const $ = (s) => document.querySelector(s);
  const isDemo = () => !!C.demoMode && !!(window.DASH_DEMO && window.DASH_DEMO.tabs);
  const S = { lines: [], sbus: [], months: [], q1idx: [], issues: [], loadedAt: null, source: "" };

  /* ---------------- utilities ---------------- */
  const sum = (a) => a.reduce((x, y) => x + (y || 0), 0);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function fmt(v) {
    if (v == null || isNaN(v)) return "–";
    const a = Math.abs(v);
    if (a === 0) return "0.00";
    return v.toLocaleString("en-US", { minimumFractionDigits: a < 0.1 ? 3 : 2, maximumFractionDigits: a < 0.1 ? 3 : 2 });
  }
  const pct = (v) => (v == null || !isFinite(v) ? "–" : (v * 100).toFixed(v < 0.1 && v > 0 ? 1 : 0) + "%");
  const util = (e, b) => (b > 0 ? e / b : e > 0 ? Infinity : null);
  function status(e, b) {
    if (b <= 0 && e > 0) return { k: "critical", t: "Unbudgeted", i: "⚠" };
    if (b <= 0) return { k: "none", t: "No budget", i: "–" };
    const u = e / b, st = C.status;
    if (u > st.critical) return { k: "critical", t: "Over budget", i: "▲" };
    if (u > st.over) return { k: "serious", t: "Slightly over", i: "▲" };
    if (u >= st.under) return { k: "good", t: "On plan", i: "✓" };
    return { k: "warn", t: "Under-utilised", i: "▼" };
  }
  const pill = (e, b) => { const s = status(e, b); return `<span class="pill ${s.k}">${s.i} ${s.t}</span>`; };

  function parseCSV(t) {
    const rows = []; let r = [], f = "", q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ",") { r.push(f); f = ""; }
      else if (c === "\n") { r.push(f); rows.push(r); r = []; f = ""; }
      else if (c !== "\r") f += c;
    }
    r.push(f); rows.push(r); return rows;
  }
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

  /* ---------------- classification ---------------- */
  function classify(sbu, cat, act) {
    const ov = C.overrides || {};
    const key = sbu + "|" + act;
    if (ov[key]) return { type: ov[key], kw: "override" };
    const hay = (cat + " " + act).toLowerCase();
    for (const k of C.tradeKeywords) if (hay.includes(k.toLowerCase())) return { type: "Trade", kw: k };
    return { type: "Promotional", kw: "" };
  }

  /* ---------------- parse one SBU tab ---------------- */
  function parseTab(sbu, csv, issues) {
    const rows = parseCSV(csv).map((r) => r.map(clean));
    const monRe = /^[A-Za-z]{3}-\d{2}$/;
    let hi = rows.findIndex((r) => r.filter((x) => monRe.test(x)).length >= 6);
    if (hi < 0) { issues.push({ sbu, row: "-", issue: "Month header row (Jul-26 … Jun-27) not found — tab skipped" }); return { lines: [], months: [] }; }
    const mcols = [], months = [];
    rows[hi].forEach((x, i) => { if (monRe.test(x) && months.length < 12) { mcols.push(i); months.push(x); } });
    // label column = first column (before months) holding Budget/Expense
    let lc = -1;
    for (let c = 0; c < mcols[0] && lc < 0; c++) if (rows.some((r) => /^(budget|expense)$/i.test(r[c] || ""))) lc = c;
    if (lc < 0) { issues.push({ sbu, row: "-", issue: "No Budget/Expense label column found — tab skipped" }); return { lines: [], months }; }
    const catC = 0, actC = lc >= 2 ? lc - 1 : 0;
    const lines = []; let cat = "", item = null;
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i], lab = (r[lc] || "").toLowerCase();
      if (lab !== "budget" && lab !== "expense") {
        if (mcols.some((c) => r[c])) issues.push({ sbu, row: i + 1, issue: `Row has numbers but no Budget/Expense label (“${r[actC] || r[catC]}”) — ignored` });
        continue;
      }
      if (r[catC] && catC !== actC) cat = r[catC];
      const act = r[actC];
      let k = lab === "budget" ? "b" : "e";
      if (act || !item) { item = newItem(sbu, cat || act || "Other", act || "(unnamed)"); lines.push(item); }
      else if (item.has[k]) {
        const other = k === "b" ? "e" : "b";
        if (!item.has[other]) { issues.push({ sbu, row: i + 1, issue: `Second “${r[lc]}” row under “${item.act}” — treated as ${other === "b" ? "Budget" : "Expense"}` }); k = other; }
        else { item = newItem(sbu, cat || "Other", "(unnamed)"); lines.push(item); }
      }
      item.has[k] = true;
      mcols.forEach((c, j) => {
        const raw = r[c]; if (!raw || /^[-–—]+$/.test(raw)) return;
        let v = parseFloat(raw.replace(/[,৳\s]/g, ""));
        if (isNaN(v)) { issues.push({ sbu, row: i + 1, issue: `Non-numeric value “${raw}” in ${months[j]} — ignored` }); return; }
        if (Math.abs(v) >= C.bdtThreshold) { item.conv = true; v = v / 1e7; }
        item[k][j] += v;
      });
    }
    const conv = lines.filter((l) => l.conv);
    if (conv.length) issues.push({ sbu, row: "-", issue: `${conv.length} line(s) entered in plain Taka (e.g. “${conv[0].act}”) — auto-converted to Crore` });
    lines.forEach((l) => { const c = classify(sbu, l.cat, l.act); l.type = c.type; l.kw = c.kw; });
    return { lines: lines.filter((l) => sum(l.b) || sum(l.e) || true), months };
  }
  function newItem(sbu, cat, act) { return { sbu, cat, act, b: new Array(12).fill(0), e: new Array(12).fill(0), has: {} }; }

  /* ---------------- loading ---------------- */
  /* Tabs are discovered LIVE from the sheet on every refresh (name + gid), so
     renamed / added / removed SBU tabs are picked up automatically. Data is
     fetched by gid (stable even when a tab is renamed). */
  const BASE = () => `https://docs.google.com/spreadsheets/d/${C.sheetId}`;
  const csvUrl = (t) => `${BASE()}/gviz/tq?tqx=out:csv&headers=0&${t.gid != null ? "gid=" + t.gid : "sheet=" + encodeURIComponent(t.name)}&_=${Date.now()}`;
  const unJs = (x) => x.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\(.)/g, "$1");
  function parseTabList(html) {
    const out = [], re = /items\.push\(\{name: "((?:[^"\\]|\\.)*)"[^}]*?gid: "(\d+)"/g; let m;
    while ((m = re.exec(html))) out.push({ name: unJs(m[1]).trim(), gid: m[2] });
    return out;
  }
  async function discoverTabs() {
    const ex = new Set((C.excludeTabs || []).map((x) => x.toLowerCase()));
    const keep = (list) => list.filter((t) => t.name && !ex.has(t.name.toLowerCase()));
    // 1) straight from Google (works on the live site and when opened locally)
    try {
      const r = await fetch(`${BASE()}/htmlview?_=${Date.now()}`, { cache: "no-store" });
      if (r.ok) { const list = parseTabList(await r.text()); if (list.length) return { tabs: keep(list), mode: "live" }; }
    } catch (e) {}
    // 2) via the Cloudflare Worker
    if (/^https?:/.test(location.protocol)) {
      try {
        const r = await fetch("/api/tabs?_=" + Date.now(), { cache: "no-store" });
        if (r.ok) { const j = await r.json(); if (j.tabs && j.tabs.length) return { tabs: keep(j.tabs.map((t) => (typeof t === "string" ? { name: t } : t))), mode: "worker" }; }
      } catch (e) {}
    }
    // 3) last resort: names from config.js
    return { tabs: C.tabs.map((n) => ({ name: n })), mode: "config" };
  }

  async function loadAll() {
    setBusy(true);
    try {
      const disc = await discoverTabs();
      const res = await Promise.all(disc.tabs.map(async (t) => {
        const r = await fetch(csvUrl(t), { cache: "no-store" });
        if (!r.ok) throw new Error(`Tab “${t.name}” returned HTTP ${r.status}`);
        const txt = await r.text();
        if (/^\s*</.test(txt)) throw new Error("Sheet is not publicly viewable (got a sign-in page). Share it as “Anyone with the link → Viewer”.");
        return { t: t.name, txt };
      }));
      // Google silently returns the FIRST tab for an unknown tab name — drop duplicates.
      const raw = {}, seen = new Map(), dupes = [];
      res.forEach((x) => { if (seen.has(x.txt)) dupes.push(`${x.t} (same content as ${seen.get(x.txt)})`); else { seen.set(x.txt, x.t); raw[x.t] = x.txt; } });
      S.discovery = { mode: disc.mode, dupes };
      build(raw, new Date(), "live");
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ raw, at: S.loadedAt.toISOString() })); } catch (e) {}
      hideError();
    } catch (err) {
      let cache = null; try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) {}
      if (cache) { build(cache.raw, new Date(cache.at), "cache"); showError(`Could not reach the Google Sheet (${esc(err.message)}). Showing the last synced copy from ${new Date(cache.at).toLocaleString()}.`); }
      else showError(`Could not load the Google Sheet: ${esc(err.message)}`);
    } finally { setBusy(false); }
  }

  /* ---------------- demo mode ---------------- */
  /* No network, no credentials: build() is fed the synthetic CSV strings from
     assets/demo-data.js through exactly the same parser used for live sheets. */
  function loadDemo() {
    const D = window.DASH_DEMO;
    S.discovery = { mode: "demo", dupes: [] };
    build(D.tabs, new Date(D.asOf || Date.now()), "demo");
    hideError();
  }

  function build(raw, at, source) {
    const issues = []; let lines = [], months = [];
    Object.keys(raw).forEach((t) => { const p = parseTab(t, raw[t], issues); lines = lines.concat(p.lines); if (!months.length && p.months.length) months = p.months; });
    S.lines = lines; S.months = months; S.issues = issues; S.loadedAt = at; S.source = source;
    S.q1idx = C.q1Months.map((m) => months.indexOf(m)).filter((i) => i >= 0);
    if (S.q1idx.length !== 3) S.q1idx = [0, 1, 2];
    const hasData = new Set(lines.filter((l) => l.b.some((v) => v) || l.e.some((v) => v)).map((l) => l.sbu));
    Object.keys(raw).forEach((t) => { if (!hasData.has(t)) issues.push({ sbu: t, row: "-", issue: "Tab has no Budget/Expense numbers (template or empty) — not shown" }); });
    lines = lines.filter((l) => hasData.has(l.sbu)); S.lines = lines;
    const D = S.discovery || {};
    if (D.mode === "config") issues.push({ sbu: "(all)", row: "-", issue: "Could not read the sheet's tab list — using tab names from config.js. Renamed tabs may be missing." });
    (D.dupes || []).forEach((d) => issues.push({ sbu: d.split(" (")[0], row: "-", issue: `Tab not found in the sheet (Google returned another tab: ${d}) — skipped` }));
    S.sbus = [...new Set(lines.map((l) => l.sbu))];
    lines.forEach((l) => {
      l.q1b = sum(S.q1idx.map((i) => l.b[i])); l.q1e = sum(S.q1idx.map((i) => l.e[i]));
      l.fyb = sum(l.b); l.fye = sum(l.e);
    });
    // SBU-level quality flags
    S.sbus.forEach((s) => {
      const L = lines.filter((l) => l.sbu === s), fyb = sum(L.map((l) => l.fyb)), q1b = sum(L.map((l) => l.q1b));
      if (fyb > 0 && Math.abs(fyb - q1b) < 1e-9) issues.push({ sbu: s, row: "-", issue: "Budget entered only for Q1 — annual figures for this SBU equal Q1" });
      const ub = L.filter((l) => l.q1e > 0 && l.q1b <= 0);
      if (ub.length) issues.push({ sbu: s, row: "-", issue: `${ub.length} line(s) with Q1 expense but no Q1 budget (unbudgeted spend ${fmt(sum(ub.map((l) => l.q1e)))} Cr)` });
      const later = sum(L.map((l) => sum(l.e.filter((_, i) => !S.q1idx.includes(i)))));
      if (later > 0) issues.push({ sbu: s, row: "-", issue: `${fmt(later)} Cr expense already recorded after Q1 (Oct-26 onward) — counted in full-year, not Q1` });
      if (!L.some((l) => l.fye > 0)) issues.push({ sbu: s, row: "-", issue: "No expense entered yet" });
    });
    renderAll();
  }

  function setBusy(b) {
    const btn = $("#refresh-btn"); btn.disabled = b; btn.classList.toggle("loading", b);
    if (b) $("#sync-status").textContent = isDemo() ? "Rebuilding demo dataset…" : "Syncing with the sheet…";
  }
  function showError(m) { const e = $("#error"); e.innerHTML = m; e.classList.remove("hidden"); }
  function hideError() { $("#error").classList.add("hidden"); }

  /* ---------------- aggregation ---------------- */
  function agg(L) {
    const o = { q1b: 0, q1e: 0, fyb: 0, fye: 0, pq1b: 0, pq1e: 0, tq1b: 0, tq1e: 0, pfyb: 0, tfyb: 0, pfye: 0, tfye: 0, n: L.length };
    L.forEach((l) => {
      o.q1b += l.q1b; o.q1e += l.q1e; o.fyb += l.fyb; o.fye += l.fye;
      if (l.type === "Trade") { o.tq1b += l.q1b; o.tq1e += l.q1e; o.tfyb += l.fyb; o.tfye += l.fye; }
      else { o.pq1b += l.q1b; o.pq1e += l.q1e; o.pfyb += l.fyb; o.pfye += l.fye; }
    });
    return o;
  }
  const bySbu = () => S.sbus.map((s) => Object.assign({ sbu: s }, agg(S.lines.filter((l) => l.sbu === s))));

  /* ---------------- components ---------------- */
  function kpis(el, items) {
    el.innerHTML = items.map((k) => `<div class="kpi"><div class="l">${k.l}</div><div class="v">${k.v}</div><div class="s">${k.s || ""}</div></div>`).join("");
  }

  function bullets(el, rows, mode) {
    const max = Math.max(1e-9, ...rows.map((r) => Math.max(r.b, r.e)));
    const cap = Math.min(2, Math.max(1.2, ...rows.map((r) => (r.b > 0 ? r.e / r.b : 0))));
    el.innerHTML = rows.map((r) => {
      const s = status(r.e, r.b);
      let bw = (r.b / max) * 100, ew = (r.e / max) * 100;
      if (mode === "pct") { const u = r.b > 0 ? r.e / r.b : r.e > 0 ? cap : 0; bw = r.b > 0 ? 100 / cap : 0; ew = (Math.min(u, cap) / cap) * 100; }
      const tip = `<b>${esc(r.label)}</b><br>Budget: ${fmt(r.b)} Cr<br>Expense: ${fmt(r.e)} Cr<br>Utilisation: ${pct(util(r.e, r.b))}<br>${s.i} ${s.t}`;
      const col = s.k === "critical" || s.k === "serious" ? "var(--critical)" : "var(--promo)";
      return `<div class="brow" data-tip="${esc(tip)}"><div class="lab" title="${esc(r.label)}">${esc(r.label)}</div>
        <div class="track"><div class="bud" style="width:${bw}%"></div><div class="act" style="width:${Math.max(ew, r.e > 0 ? 0.4 : 0)}%;background:${col}"></div>${r.b > 0 ? `<div class="tick" style="left:calc(${bw}% - 1px)"></div>` : ""}</div>
        <div class="val">${fmt(r.e)} / ${fmt(r.b)} · <b>${pct(util(r.e, r.b))}</b></div></div>`;
    }).join("") || `<p class="hint">No data.</p>`;
  }

  function stacks(el, rows, mode) { // rows: {label, p, t}; mode 'abs' or 'share'
    const max = Math.max(1e-9, ...rows.map((r) => r.p + r.t));
    el.innerHTML = rows.map((r) => {
      const tot = r.p + r.t, scale = mode === "share" ? (tot > 0 ? 100 / tot : 0) : 100 / max;
      const pw = r.p * scale, tw = r.t * scale;
      const tip = `<b>${esc(r.label)}</b><br>Promotional: ${fmt(r.p)} Cr (${pct(tot ? r.p / tot : null)})<br>Trade offers: ${fmt(r.t)} Cr (${pct(tot ? r.t / tot : null)})<br>Total: ${fmt(tot)} Cr`;
      return `<div class="brow" data-tip="${esc(tip)}"><div class="lab" title="${esc(r.label)}">${esc(r.label)}</div>
        <div class="track"><div class="seg promo" style="left:0;width:${pw}%;border-radius:4px 0 0 4px"></div><div class="seg trade" style="left:calc(${pw}% + ${pw > 0 && tw > 0 ? 2 : 0}px);width:max(0px, calc(${tw}% - ${pw > 0 && tw > 0 ? 2 : 0}px));border-radius:0 4px 4px 0"></div></div>
        <div class="val">${fmt(tot)} · trade ${pct(tot ? r.t / tot : null)}</div></div>`;
    }).join("") || `<p class="hint">No data.</p>`;
  }

  function columns(el, labels, budget, promo, trade) {
    const W = 900, H = 260, padL = 44, padB = 26, padT = 12, n = labels.length;
    const max = Math.max(1e-9, ...budget, ...promo.map((p, i) => p + trade[i])) * 1.08;
    const gw = (W - padL - 8) / n, bw = Math.min(28, gw * 0.32);
    const y = (v) => padT + (H - padT - padB) * (1 - v / max);
    const ticks = 4; let g = "";
    for (let i = 0; i <= ticks; i++) { const v = (max / ticks) * i, yy = y(v); g += `<line class="grid" x1="${padL}" x2="${W - 4}" y1="${yy}" y2="${yy}"/><text x="${padL - 6}" y="${yy + 4}" text-anchor="end">${v.toFixed(v < 1 ? 2 : 1)}</text>`; }
    let bars = "";
    labels.forEach((m, i) => {
      const cx = padL + gw * i + gw / 2, x1 = cx - bw - 1, x2 = cx + 1;
      const b = budget[i], p = promo[i], t = trade[i];
      const tip = `<b>${esc(m)}</b><br>Budget: ${fmt(b)} Cr<br>Promotional exp: ${fmt(p)} Cr<br>Trade exp: ${fmt(t)} Cr<br>Total exp: ${fmt(p + t)} Cr · ${pct(util(p + t, b))}`;
      const base = y(0);
      bars += `<g data-tip="${esc(tip)}"><rect x="${cx - gw / 2}" y="${padT}" width="${gw}" height="${H - padT - padB}" fill="transparent"/>`;
      if (b > 0) bars += `<path d="${roundTop(x1, y(b), bw, base - y(b))}" fill="var(--budget)"/>`;
      if (p > 0) bars += `<path d="${t > 0 ? rect(x2, y(p), bw, base - y(p)) : roundTop(x2, y(p), bw, base - y(p))}" fill="var(--promo)"/>`;
      if (t > 0) { const top = y(p + t), h = y(p) - top - (p > 0 ? 2 : 0); if (h > 0) bars += `<path d="${roundTop(x2, top, bw, h)}" fill="var(--trade)"/>`; }
      bars += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${esc(m)}</text></g>`;
    });
    el.innerHTML = `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly budget vs expense">${g}<line x1="${padL}" x2="${W - 4}" y1="${y(0)}" y2="${y(0)}" stroke="var(--muted)"/>${bars}</svg></div>`;
  }
  function rect(x, y, w, h) { return `M${x},${y}h${w}v${h}h${-w}z`; }
  function roundTop(x, y, w, h) { const r = Math.min(4, h, w / 2); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}z`; }

  // generic sortable table
  function table(el, cols, rows, opt) {
    opt = opt || {};
    const st = el._sort || { k: opt.sortKey, d: opt.sortDir || -1 };
    el._sort = st;
    const sorted = rows.slice();
    if (st.k) { const col = cols.find((c) => c.k === st.k); const val = col && col.sv ? col.sv : (r) => r[st.k];
      sorted.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === "string" ? x.localeCompare(y) : (x ?? -1e18) - (y ?? -1e18)) * st.d; }); }
    const head = cols.map((c) => `<th class="${c.t ? "t" : ""} ${st.k === c.k ? "sorted" + (st.d > 0 ? " asc" : "") : ""}" data-k="${c.k}">${c.h}</th>`).join("");
    const cell = (c, r) => `<td class="${c.t ? "t" : ""} ${c.wrap ? "wrap" : ""}">${c.f ? c.f(r) : esc(r[c.k])}</td>`;
    const body = sorted.slice(0, opt.limit || 1e9).map((r) => `<tr>${cols.map((c) => cell(c, r)).join("")}</tr>`).join("");
    const tot = opt.total ? `<tr class="total">${cols.map((c) => cell(c, opt.total)).join("")}</tr>` : "";
    el.innerHTML = rows.length ? `<table><thead><tr>${head}</tr></thead><tbody>${body}${tot}</tbody></table>` : `<p class="hint">${opt.empty || "Nothing to show."}</p>`;
    el.querySelectorAll("th").forEach((th) => th.addEventListener("click", () => {
      const k = th.dataset.k; if (st.k === k) st.d = -st.d; else { st.k = k; st.d = cols.find((c) => c.k === k).t ? 1 : -1; }
      table(el, cols, rows, opt);
    }));
  }
  const num = (k) => (r) => fmt(r[k]);
  const uf = (e, b) => (r) => { const u = util(r[e], r[b]); return u === Infinity ? "n/a" : pct(u); };

  function fillSelect(el, opts, keep) {
    const cur = el.value; el.innerHTML = opts.map((o) => `<option value="${esc(o.v)}">${esc(o.l)}</option>`).join("");
    if (keep && opts.some((o) => o.v === cur)) el.value = cur;
  }

  /* ---------------- PART 1 ---------------- */
  let q1Scale = "pct";
  function renderQ1() {
    const G = agg(S.lines), rows = bySbu();
    $("#q1-title").textContent = `${C.quarterLabel} achievement — expense vs budget`;
    const unb = S.lines.filter((l) => l.q1e > 0 && l.q1b <= 0), unbV = sum(unb.map((l) => l.q1e));
    kpis($("#q1-kpis"), [
      { l: "Q1 budget", v: fmt(G.q1b), s: "BDT Crore" },
      { l: "Q1 expense", v: fmt(G.q1e), s: `Variance ${fmt(G.q1e - G.q1b)} Cr` },
      { l: "Q1 achievement (utilisation)", v: pct(util(G.q1e, G.q1b)), s: status(G.q1e, G.q1b).t },
      { l: "Promotional expense", v: fmt(G.pq1e), s: `${pct(util(G.pq1e, G.pq1b))} of ${fmt(G.pq1b)} budget` },
      { l: "Trade-offer expense", v: fmt(G.tq1e), s: `${pct(util(G.tq1e, G.tq1b))} of ${fmt(G.tq1b)} budget` },
      { l: "Trade share of Q1 spend", v: pct(G.q1e ? G.tq1e / G.q1e : null), s: `${unb.length} unbudgeted lines · ${fmt(unbV)} Cr` },
    ]);

    // insights
    const r2 = rows.filter((r) => r.q1b > 0 || r.q1e > 0);
    const over = r2.filter((r) => r.q1e > r.q1b * C.status.over).sort((a, b) => (b.q1e - b.q1b) - (a.q1e - a.q1b));
    const under = r2.filter((r) => r.q1b > 0 && r.q1e < r.q1b * C.status.under).sort((a, b) => (b.q1b - b.q1e) - (a.q1b - a.q1e));
    const top = r2.slice().sort((a, b) => b.q1e - a.q1e);
    const ins = [];
    ins.push(`Group spent <b>${fmt(G.q1e)} Cr</b> against a Q1 budget of <b>${fmt(G.q1b)} Cr</b> — <b>${pct(util(G.q1e, G.q1b))}</b> utilisation (${fmt(Math.abs(G.q1b - G.q1e))} Cr ${G.q1e <= G.q1b ? "unspent" : "over"}).`);
    S.q1idx.forEach((i) => {
      const miss = S.sbus.filter((s) => { const L = S.lines.filter((l) => l.sbu === s); return sum(L.map((l) => l.b[i])) > 0 && sum(L.map((l) => l.e[i])) === 0; });
      if (miss.length) ins.push(`<b>No ${esc(S.months[i])} expense entered yet</b> for: ${miss.map(esc).join(", ")} — Q1 achievement for ${miss.length > 1 ? "these SBUs" : "this SBU"} may be understated until the sheet is updated.`);
    });
    if (top.length) ins.push(`<b>${esc(top[0].sbu)}</b> accounts for ${pct(top[0].q1e / (G.q1e || 1))} of Q1 spend (${fmt(top[0].q1e)} Cr)${top[1] ? `, followed by ${esc(top[1].sbu)} (${fmt(top[1].q1e)} Cr)` : ""}.`);
    ins.push(`Trade offers took <b>${pct(G.q1e ? G.tq1e / G.q1e : null)}</b> of Q1 spend (${fmt(G.tq1e)} Cr, ${pct(util(G.tq1e, G.tq1b))} of trade budget); promotional activity used ${pct(util(G.pq1e, G.pq1b))} of its budget.`);
    if (over.length) ins.push(`Over budget in Q1: ${over.map((r) => `<b>${esc(r.sbu)}</b> (${r.q1b > 0 ? pct(r.q1e / r.q1b) : "unbudgeted"}, +${fmt(r.q1e - r.q1b)} Cr)`).join(", ")}.`);
    if (under.length) ins.push(`Under-utilised (&lt;${pct(C.status.under)}): ${under.slice(0, 6).map((r) => `<b>${esc(r.sbu)}</b> (${pct(r.q1e / r.q1b)})`).join(", ")} — check whether activities slipped or expenses are not yet booked.`);
    if (unb.length) ins.push(`${unb.length} activity lines show Q1 expense with no Q1 budget (${fmt(unbV)} Cr) — see “Largest over-budget lines”.`);
    $("#q1-insights").innerHTML = ins.map((x) => `<li>${x}</li>`).join("");

    bullets($("#q1-bullets"), r2.slice().sort((a, b) => b.q1b - a.q1b).map((r) => ({ label: r.sbu, b: r.q1b, e: r.q1e })), q1Scale);
    stacks($("#q1-mix"), r2.slice().sort((a, b) => b.q1e - a.q1e).map((r) => ({ label: r.sbu, p: r.pq1e, t: r.tq1e })), "abs");

    const ml = S.q1idx.map((i) => S.months[i]);
    columns($("#q1-month"), ml, S.q1idx.map((i) => sum(S.lines.map((l) => l.b[i]))),
      S.q1idx.map((i) => sum(S.lines.filter((l) => l.type !== "Trade").map((l) => l.e[i]))),
      S.q1idx.map((i) => sum(S.lines.filter((l) => l.type === "Trade").map((l) => l.e[i]))));

    const cols = [
      { k: "sbu", h: "SBU", t: 1, f: (r) => `<b>${esc(r.sbu)}</b>` },
      { k: "pq1b", h: "Promo budget", f: num("pq1b") }, { k: "pq1e", h: "Promo expense", f: num("pq1e") }, { k: "pu", h: "Promo %", f: uf("pq1e", "pq1b"), sv: (r) => util(r.pq1e, r.pq1b) },
      { k: "tq1b", h: "Trade budget", f: num("tq1b") }, { k: "tq1e", h: "Trade expense", f: num("tq1e") }, { k: "tu", h: "Trade %", f: uf("tq1e", "tq1b"), sv: (r) => util(r.tq1e, r.tq1b) },
      { k: "q1b", h: "Total budget", f: num("q1b") }, { k: "q1e", h: "Total expense", f: num("q1e") },
      { k: "var", h: "Variance", f: (r) => `<span class="${r.q1e > r.q1b ? "neg" : ""}">${fmt(r.q1e - r.q1b)}</span>`, sv: (r) => r.q1e - r.q1b },
      { k: "u", h: "Achievement", f: (r) => `<b>${uf("q1e", "q1b")(r)}</b>`, sv: (r) => util(r.q1e, r.q1b) },
      { k: "st", h: "Status", t: 1, f: (r) => pill(r.q1e, r.q1b), sv: (r) => status(r.q1e, r.q1b).t },
    ];
    table($("#q1-table"), cols, rows, { sortKey: "q1b", total: Object.assign({ sbu: "Group total" }, G) });

    const lc = [
      { k: "sbu", h: "SBU", t: 1 }, { k: "act", h: "Activity", t: 1, wrap: 1 },
      { k: "type", h: "Type", t: 1, f: (r) => `<span class="tag ${r.type}">${r.type}</span>` },
      { k: "q1b", h: "Budget", f: num("q1b") }, { k: "q1e", h: "Expense", f: num("q1e") },
    ];
    table($("#q1-over"), lc.concat([{ k: "d", h: "Over by", f: (r) => `<span class="neg">${fmt(r.q1e - r.q1b)}</span>`, sv: (r) => r.q1e - r.q1b }]),
      S.lines.filter((l) => l.q1e > l.q1b + 1e-9), { sortKey: "d", limit: 12, empty: "No line is over budget." });
    table($("#q1-under"), lc.concat([{ k: "d", h: "Unspent", f: (r) => fmt(r.q1b - r.q1e), sv: (r) => r.q1b - r.q1e }]),
      S.lines.filter((l) => l.q1b > l.q1e + 1e-9), { sortKey: "d", limit: 12 });

    fillSelect($("#q1-sbu"), [{ v: "", l: "All SBUs" }].concat(S.sbus.map((s) => ({ v: s, l: s }))), true);
    renderDrill();
  }
  function renderDrill() {
    const s = $("#q1-sbu").value, t = $("#q1-type").value, act = $("#q1-active").checked;
    const L = S.lines.filter((l) => (!s || l.sbu === s) && (!t || l.type === t) && (!act || l.q1b > 0 || l.q1e > 0));
    const T = agg(L);
    const cols = [{ k: "sbu", h: "SBU", t: 1 }, { k: "cat", h: "Category", t: 1 }, { k: "act", h: "Activity", t: 1, wrap: 1 },
      { k: "type", h: "Type", t: 1, f: (r) => r.type ? `<span class="tag ${r.type}">${r.type}</span>` : "" }];
    S.q1idx.forEach((i) => cols.push({ k: "m" + i, h: S.months[i] + " exp", f: (r) => r.e ? fmt(r.e[i]) : fmt(r["m" + i]), sv: (r) => r.e[i] }));
    cols.push({ k: "q1b", h: "Q1 budget", f: num("q1b") }, { k: "q1e", h: "Q1 expense", f: num("q1e") },
      { k: "u", h: "Achievement", f: uf("q1e", "q1b"), sv: (r) => util(r.q1e, r.q1b) }, { k: "st", h: "Status", t: 1, f: (r) => pill(r.q1e, r.q1b), sv: (r) => status(r.q1e, r.q1b).t });
    const tot = { sbu: "Total", cat: "", act: `${L.length} lines`, type: "", q1b: T.q1b, q1e: T.q1e };
    S.q1idx.forEach((i) => (tot["m" + i] = sum(L.map((l) => l.e[i]))));
    table($("#q1-drill"), cols, L, { sortKey: "q1b", total: tot });
  }

  /* ---------------- PART 2 ---------------- */
  function renderFY() {
    const G = agg(S.lines), rows = bySbu();
    const lastIdx = Math.max(-1, ...S.lines.map((l) => l.e.reduce((m, v, i) => (v ? i : m), -1)));
    const ytdLabel = lastIdx >= 0 ? `All months booked so far (latest entry: ${S.months[lastIdx]})` : "No expense yet";
    kpis($("#fy-kpis"), [
      { l: `Annual budget ${C.fiscalYear}`, v: fmt(G.fyb), s: `${S.sbus.length} SBUs · ${S.lines.length} activity lines` },
      { l: "Expense recorded to date", v: fmt(G.fye), s: ytdLabel },
      { l: "Annual budget consumed", v: pct(util(G.fye, G.fyb)), s: `${fmt(G.fyb - G.fye)} Cr remaining` },
      { l: "Promotional share of budget", v: pct(G.fyb ? G.pfyb / G.fyb : null), s: `${fmt(G.pfyb)} Cr` },
      { l: "Trade-offer share of budget", v: pct(G.fyb ? G.tfyb / G.fyb : null), s: `${fmt(G.tfyb)} Cr` },
    ]);
    const topCat = (s) => { const m = {}; S.lines.filter((l) => l.sbu === s).forEach((l) => (m[l.cat] = (m[l.cat] || 0) + l.fyb)); const e = Object.entries(m).sort((a, b) => b[1] - a[1])[0]; return e && e[1] > 0 ? e[0] : "–"; };
    rows.forEach((r) => { r.share = G.fyb ? r.fyb / G.fyb : 0; r.rem = r.fyb - r.fye; r.top = topCat(r.sbu); r.tshare = r.fyb ? r.tfyb / r.fyb : 0; });
    table($("#fy-table"), [
      { k: "sbu", h: "SBU", t: 1, f: (r) => `<b>${esc(r.sbu)}</b>` },
      { k: "fyb", h: "Annual budget", f: num("fyb") }, { k: "share", h: "% of group", f: (r) => pct(r.share) },
      { k: "pfyb", h: "Promo budget", f: num("pfyb") }, { k: "tfyb", h: "Trade budget", f: num("tfyb") },
      { k: "q1b", h: "Q1 budget", f: num("q1b") }, { k: "q1e", h: "Q1 expense", f: num("q1e") }, { k: "qu", h: "Q1 %", f: uf("q1e", "q1b"), sv: (r) => util(r.q1e, r.q1b) },
      { k: "fye", h: "Expense to date", f: num("fye") }, { k: "fu", h: "Budget used", f: (r) => `<b>${uf("fye", "fyb")(r)}</b>`, sv: (r) => util(r.fye, r.fyb) },
      { k: "rem", h: "Remaining", f: (r) => `<span class="${r.rem < 0 ? "neg" : ""}">${fmt(r.rem)}</span>` },
      { k: "n", h: "Lines" }, { k: "top", h: "Largest category", t: 1 },
    ], rows, { sortKey: "fyb", total: Object.assign({ sbu: "Group total", share: 1, rem: G.fyb - G.fye, top: "" }, G) });

    const sorted = rows.slice().sort((a, b) => b.fyb - a.fyb);
    const maxS = Math.max(1e-9, ...sorted.map((r) => r.share));
    $("#fy-share").innerHTML = sorted.map((r) => `<div class="brow" data-tip="${esc(`<b>${esc(r.sbu)}</b><br>Annual budget: ${fmt(r.fyb)} Cr<br>${pct(r.share)} of group`)}"><div class="lab">${esc(r.sbu)}</div><div class="track"><div class="act" style="top:0;bottom:0;border-radius:0 4px 4px 0;width:${(r.share / maxS) * 100}%"></div></div><div class="val">${fmt(r.fyb)} · <b>${pct(r.share)}</b></div></div>`).join("");
    stacks($("#fy-mix"), sorted.map((r) => ({ label: r.sbu, p: r.pfyb, t: r.tfyb })), "share");

    fillSelect($("#fy-month-sbu"), [{ v: "", l: "All SBUs" }].concat(S.sbus.map((s) => ({ v: s, l: s }))), true);
    fillSelect($("#fy-cat-sbu"), S.sbus.map((s) => ({ v: s, l: s })), true);
    renderFYMonth(); renderFYCat();
  }
  function renderFYMonth() {
    const s = $("#fy-month-sbu").value, L = S.lines.filter((l) => !s || l.sbu === s), idx = S.months.map((_, i) => i);
    columns($("#fy-month"), S.months, idx.map((i) => sum(L.map((l) => l.b[i]))),
      idx.map((i) => sum(L.filter((l) => l.type !== "Trade").map((l) => l.e[i]))), idx.map((i) => sum(L.filter((l) => l.type === "Trade").map((l) => l.e[i]))));
  }
  function renderFYCat() {
    const s = $("#fy-cat-sbu").value, m = {};
    S.lines.filter((l) => l.sbu === s).forEach((l) => { const o = (m[l.cat] = m[l.cat] || { label: l.cat, b: 0, e: 0 }); o.b += l.fyb; o.e += l.fye; });
    let arr = Object.values(m).sort((a, b) => Math.max(b.b, b.e) - Math.max(a.b, a.e));
    if (arr.length > 14) { const rest = arr.slice(13); arr = arr.slice(0, 13).concat([{ label: `Other (${rest.length})`, b: sum(rest.map((x) => x.b)), e: sum(rest.map((x) => x.e)) }]); }
    bullets($("#fy-cat"), arr);
  }

  /* ---------------- NOTES ---------------- */
  function renderNotes() {
    const demo = S.source === "demo";
    $("#method").innerHTML = [
      demo
        ? `<b>Demo mode:</b> every figure below is synthetic — fictional business units, invented budgets and expenses. The dataset lives in <code>assets/demo-data.js</code> and is parsed by exactly the same code path that reads a live sheet, so the whole dashboard works offline.`
        : `Data is read live from the Google Sheet (one tab per SBU) every time you press <b>Refresh data</b> or reload the page. The sheet is never modified.`,
      demo
        ? `To run it against your own numbers: put your sheet id in <code>assets/config.js</code>, share the sheet as <i>Anyone with the link → Viewer</i> and set <code>demoMode: false</code>.`
        : `<b>${C.quarterLabel}</b> = columns ${C.q1Months.join(", ")}. Q1 achievement = Q1 expense ÷ Q1 budget.`,
      `Status bands: Under-utilised &lt; ${pct(C.status.under)} · On plan ${pct(C.status.under)}–${pct(C.status.over)} · Slightly over ≤ ${pct(C.status.critical)} · Over budget &gt; ${pct(C.status.critical)} · Unbudgeted = expense with no budget.`,
      `<b>Trade offers</b> = lines whose category or activity contains: ${C.tradeKeywords.map((k) => `<code>${esc(k)}</code>`).join(" ")}. All other lines are <b>Promotional</b>.`,
      `Values are in BDT Crore. Cells ≥ ${C.bdtThreshold} are treated as plain Taka and divided by 1,00,00,000.`,
      `Totals are re-computed from the monthly cells (the sheet's own Total column is not used).`,
      `Last sync: ${S.loadedAt ? S.loadedAt.toLocaleString() : "–"} (${S.source === "live" ? "live from sheet" : S.source === "demo" ? "synthetic demo dataset" : "offline copy"}).`,
    ].map((x) => `<li>${x}</li>`).join("");
    table($("#notes"), [{ k: "sbu", h: "SBU", t: 1 }, { k: "row", h: "Sheet row", sv: (r) => (r.row === "-" ? 0 : r.row) }, { k: "issue", h: "Flag", t: 1, wrap: 1 }], S.issues, { sortKey: "sbu", sortDir: 1, empty: "No issues detected." });
    const tl = S.lines.filter((l) => l.type === "Trade");
    table($("#class-table"), [{ k: "sbu", h: "SBU", t: 1 }, { k: "cat", h: "Category", t: 1 }, { k: "act", h: "Activity classed as Trade", t: 1, wrap: 1 }, { k: "kw", h: "Matched", t: 1 }, { k: "fyb", h: "Annual budget", f: num("fyb") }, { k: "q1e", h: "Q1 expense", f: num("q1e") }],
      tl, { sortKey: "fyb", empty: "No lines matched the trade keywords." });
  }

  function renderAll() {
    $("#fy-label").textContent = "· " + C.fiscalYear;
    const when = S.loadedAt ? S.loadedAt.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
    const ss = $("#sync-status");
    ss.textContent = S.source === "demo" ? "Demo data (synthetic)" : S.source === "live" ? `Synced ${when}` : `Offline copy · ${when}`;
    ss.classList.toggle("err", S.source === "cache");
    $("#foot-sync").textContent = S.source === "demo" ? "Synthetic demo dataset — no live source." : `Last sync: ${when}.`;
    renderQ1(); renderFY(); renderNotes();
  }

  /* ---------------- tooltip + events ---------------- */
  const tip = $("#tip");
  document.addEventListener("mousemove", (e) => {
    const t = e.target.closest && e.target.closest("[data-tip]");
    if (!t) { tip.classList.remove("on"); return; }
    tip.innerHTML = t.getAttribute("data-tip"); tip.classList.add("on");
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + w > innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > innerHeight - 8) y = e.clientY - h - 14;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  });
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => { x.classList.toggle("active", x === b); x.setAttribute("aria-selected", x === b); });
    ["q1", "fy", "notes"].forEach((k) => $("#tab-" + k).classList.toggle("hidden", k !== b.dataset.tab));
    try { localStorage.setItem(TAB_KEY, b.dataset.tab); } catch (e) {}
  }));
  try { const t = localStorage.getItem(TAB_KEY); if (t) { const b = document.querySelector(`.tab[data-tab="${t}"]`); if (b) b.click(); } } catch (e) {}
  $("#refresh-btn").addEventListener("click", () => {
    if (isDemo()) { setBusy(true); loadDemo(); setBusy(false); return; }
    loadAll();
  });
  ["#q1-sbu", "#q1-type", "#q1-active"].forEach((s) => $(s).addEventListener("change", renderDrill));
  $("#fy-month-sbu").addEventListener("change", renderFYMonth);
  document.querySelectorAll("#q1-scale button").forEach((b) => b.addEventListener("click", () => {
    q1Scale = b.dataset.m; document.querySelectorAll("#q1-scale button").forEach((x) => x.classList.toggle("on", x === b));
    if (S.lines.length) renderQ1();
  }));
  $("#fy-cat-sbu").addEventListener("change", renderFYCat);
  if (isDemo()) $("#sheet-link").classList.add("hidden");
  else $("#sheet-link").href = C.sheetUrl;

  window.__dash = { S, loadAll, loadDemo, build };
  if (isDemo()) loadDemo(); else loadAll();
})();

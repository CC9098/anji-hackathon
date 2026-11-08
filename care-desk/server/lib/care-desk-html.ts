import { asc, desc, eq, gte, and } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import { ensureSeeded } from "./seed.js";
import { ageOn, shortDay, whenLabel } from "./time.js";

// Care Desk is a fictional care-record system: the "host website" the Anji
// Chrome extension sits beside. It is plain server-rendered HTML on purpose,
// like many care systems, and knows nothing about Anji. All data is synthetic.
// The look follows the common layout of UK care-record systems (dark top bar,
// resident sidebar, rounded cards) with its own name and mark.
//
// Anji reads the page through these hooks; keep them when restyling:
// main [data-resident-name], #care-plan ul li, #about-me dd,
// #daily-records tr[data-record-id], #shift-records.

const esc = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const STYLE = `
:root{--ink:#17161c;--muted:#7c7a86;--line:#e6e5ec;--bg:#f2f2f6;--top:#2b0a57;--top-on:#563a85;--link:#1f7ae0;--soft:#eaf8ff;--tile:#9b5cf6;--card:#fff;--ok:#1f9d6b}
*{box-sizing:border-box}
html{scroll-behavior:auto}
body{margin:0;font:15px/1.45 -apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Arial,sans-serif;color:var(--ink);background:var(--bg)}
a{color:var(--link);text-decoration:none}
svg.i{width:20px;height:20px;flex-shrink:0;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.top{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:6px;background:var(--top);color:#fff;padding:0 18px;height:58px}
.logo{display:flex;align-items:center;gap:8px;font-weight:700;font-size:18px;color:#fff;margin-right:18px;letter-spacing:-.2px}
.logo svg{width:26px;height:26px}
.top nav{display:flex;gap:2px}
.top nav a{color:#d9d0ea;font-weight:600;font-size:15px;padding:8px 13px;border-radius:9px}
.top nav a.on{background:var(--top-on);color:#fff}
.top .tools{margin-left:auto;display:flex;gap:16px;align-items:center;color:#e6def3}
.top .tools svg.i{width:22px;height:22px}
.top .home{font-size:13px;color:#cfc4e4;margin-right:4px;white-space:nowrap}
.shell{display:flex;min-height:calc(100vh - 58px)}
aside.side{width:262px;flex-shrink:0;background:#fff;border-right:1px solid var(--line)}
.side .back{display:flex;align-items:center;gap:8px;padding:18px 20px 12px;font-weight:600;font-size:16px}
.side .who{display:flex;align-items:center;gap:12px;margin:0 12px 14px;padding:12px 14px;border:1px solid #dcdbe3;border-radius:16px}
.side .who b{display:block;font-size:17px}
.side .who span{display:block;font-size:13px}
.side .who em{display:block;font-style:normal;font-size:12px;color:var(--ok)}
.side .who svg.i{margin-left:auto;color:#55535e}
.side .grp{border-top:1px solid var(--line)}
.side .item{display:flex;align-items:center;gap:12px;padding:11px 20px;color:var(--ink);font-size:15px}
.side .item .chev{margin-left:auto;width:16px;height:16px;color:#55535e}
.side .item.open{color:var(--link)}
.side .sub{background:#f7f7f9}
.side .sub a{display:block;padding:9px 20px 9px 52px;color:var(--ink);font-size:14.5px}
.side .sub a.on{background:var(--soft);color:var(--link)}
.side .ic{display:inline-grid;place-items:center;width:22px;height:22px}
main{flex:1;min-width:0;padding:20px 22px 40px}
.card{background:var(--card);border-radius:22px;padding:22px 26px;margin-bottom:16px;box-shadow:0 1px 0 rgba(20,10,40,.03)}
.title{display:flex;align-items:center;gap:16px}
h1{font-size:28px;line-height:1.15;margin:0;letter-spacing:-.4px;flex:1}
.btn{display:inline-flex;align-items:center;gap:8px;border:1px solid #c9c8d1;border-radius:12px;padding:9px 14px;font:600 14px/1.2 inherit;color:var(--ink);background:#fff;white-space:nowrap}
.btn.primary{background:var(--top);color:#fff;border-color:var(--top)}
.prof{display:flex;align-items:center;gap:18px;margin-top:16px;padding-top:16px;border-top:1px solid var(--line)}
.prof .nm{font-size:20px;font-weight:700}
.prof .dt{color:var(--muted);font-size:14px}
.tag{display:inline-block;margin-top:6px;border:1px solid #c9c8d1;border-radius:6px;padding:1px 8px;font-size:11.5px;font-weight:700;letter-spacing:.4px}
.facts{margin-left:auto;display:grid;grid-template-columns:auto auto;gap:4px 22px;font-size:13px}
.facts dt{color:var(--muted)}.facts dd{margin:0;font-weight:700}
.sec{display:flex;align-items:center;gap:14px;margin:0 0 14px}
.sec .tile{display:inline-grid;place-items:center;width:40px;height:40px;border-radius:11px;background:var(--tile);color:#fff}
.sec .tile svg.i{width:22px;height:22px}
.sec h2{font-size:21px;margin:0;flex:1;letter-spacing:-.2px}
.sec .edit{display:flex;align-items:center;gap:6px;font-weight:600;font-size:15px}
.sec .edit svg.i{width:17px;height:17px}
h3{font-size:12px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin:16px 0 4px}
ul.plan{list-style:none;margin:0;padding:0}
ul.plan li{padding:9px 0;border-bottom:1px solid #efeef3}
ul.plan li:last-child{border-bottom:0}
.meta{font-size:12.5px;color:var(--muted);margin:8px 0 0}
dl.about{margin:0;display:grid;grid-template-columns:190px 1fr;border:1px solid var(--line);border-radius:12px;overflow:hidden}
dl.about dt,dl.about dd{margin:0;padding:10px 14px;border-bottom:1px solid var(--line)}
dl.about dt{color:var(--muted);background:#fafafc;font-size:14px}
dl.about dt:nth-last-of-type(1),dl.about dd:last-child{border-bottom:0}
table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;font-size:12.5px;color:var(--muted);font-weight:600;border-bottom:1px solid var(--line);padding:8px 10px}
td{border-bottom:1px solid #efeef3;padding:10px;vertical-align:top}
tr:last-child td{border-bottom:0}
.sub2{color:var(--muted);font-size:13px}
.cat{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;white-space:nowrap}
.cat i{width:9px;height:9px;border-radius:50%;display:inline-block}
.av{display:inline-block;border-radius:50%;overflow:hidden;flex-shrink:0;vertical-align:middle}
.rname{display:flex;align-items:center;gap:12px;font-weight:600;color:var(--ink)}
.rname small{display:block;font-weight:400;color:var(--muted);font-size:12.5px}
.search{display:flex;align-items:center;gap:8px;border:1px solid #d6d5de;border-radius:12px;padding:8px 12px;color:var(--muted);font-size:14px;min-width:220px}
.pill{display:inline-block;border-radius:20px;padding:2px 10px;font-size:12px;font-weight:600;background:#f0edf7;color:#4b3a6b}
.foot{font-size:12px;color:var(--muted);margin:22px 4px 0}
.foot button{font:inherit;color:var(--link);background:none;border:0;padding:0;cursor:pointer}
`;

// Line icons (Lucide, ISC licence), drawn inline so the page needs nothing else.
const ICON: Record<string, string> = {
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  lines: '<path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h12"/>',
  chart: '<path d="M3 3v18h18"/><path d="M8 17V9"/><path d="M13 17V5"/><path d="M18 17v-6"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>',
  clip: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  pill: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
  hand: '<path d="M11 17a4 4 0 0 1-8 0V9"/><path d="M7 9V5a2 2 0 0 1 4 0v8"/><path d="M11 9V4a2 2 0 0 1 4 0v9"/><path d="M15 9V6a2 2 0 0 1 4 0v9a6 6 0 0 1-6 6"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  passport: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6"/>',
};
const icon = (name: string, cls = "i") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;

// Coloured sidebar marks, like the small illustrations real systems use.
const COLOUR_ICON: Record<string, string> = {
  user: "#9b5cf6",
  lines: "#6b6a75",
  chart: "#22a06b",
  file: "#8a8996",
  clip: "#e5484d",
  pill: "#f06595",
  hand: "#f2a516",
};
const sideIcon = (name: string) => `<span class="ic" style="color:${COLOUR_ICON[name]}">${icon(name)}</span>`;

const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 29c-6.6-4.3-11-8.6-11-14.2A6.3 6.3 0 0 1 16 10.6a6.3 6.3 0 0 1 11 4.2C27 20.4 22.6 24.7 16 29Z" fill="#ff8a3d"/><path d="M16 29C11 24 9 19.5 9.6 14.2A6.3 6.3 0 0 1 16 10.6Z" fill="#ffc53d"/><circle cx="16" cy="6" r="3.2" fill="#ff5a8a"/></svg>`;

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** A small drawn portrait, so residents are not just initials. Deterministic per name. */
function avatar(name: string, size: number) {
  const h = hash(name);
  const pick = <T,>(list: T[], salt: number) => list[(h >>> salt) % list.length];
  const bg = pick(["#efe8fd", "#e6f4fb", "#fdeee6", "#e9f6ee"], 1);
  const shirt = pick(["#f5a524", "#6d8ef0", "#e46b94", "#38a88f", "#8d6be8"], 4);
  const skin = pick(["#f6cfb6", "#eab796", "#c98f6b", "#f2d3c0"], 7);
  const hair = pick(["#d9d9de", "#bfbfc6", "#eeeeee", "#a7a1a0"], 10);
  const glasses = (h >>> 13) % 2 === 0;
  const id = `av${h.toString(36)}${size}`;
  return `<span class="av" style="width:${size}px;height:${size}px"><svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><defs><clipPath id="${id}"><circle cx="50" cy="50" r="50"/></clipPath></defs><g clip-path="url(#${id})"><rect width="100" height="100" fill="${bg}"/><path d="M14 104c2-22 16-32 36-32s34 10 36 32Z" fill="${shirt}"/><path d="M42 62h16v14c0 5-16 5-16 0Z" fill="${skin}"/><ellipse cx="50" cy="46" rx="19" ry="22" fill="${skin}"/><path d="M30 44c-2-16 9-25 20-25s23 8 20 25c-3-8-10-12-20-12s-17 4-20 12Z" fill="${hair}"/><circle cx="43" cy="48" r="1.8" fill="#3a2a2a"/><circle cx="57" cy="48" r="1.8" fill="#3a2a2a"/><path d="M45 58c3 2 7 2 10 0" stroke="#a8604a" stroke-width="1.8" fill="none" stroke-linecap="round"/>${glasses ? `<g fill="none" stroke="#4a3d52" stroke-width="1.6"><circle cx="43" cy="48" r="5.5"/><circle cx="57" cy="48" r="5.5"/><path d="M48.5 48h3"/></g>` : ""}</g></svg></span>`;
}

const CAT_COLOUR: Record<string, string> = { Food: "#f5a524", Fluid: "#2f8fe0", Night: "#6b5bd6", Wellbeing: "#22a06b", Note: "#8a8996" };
const cat = (c: string) => `<span class="cat"><i style="background:${CAT_COLOUR[c] ?? "#8a8996"}"></i>${esc(c)}</span>`;
const by = (o: { recordedBy: string; source: string }) =>
  `<span style="white-space:nowrap">${esc(o.recordedBy)}</span>${o.source !== "Care Desk" ? ` <span class="sub2">via ${esc(o.source)}</span>` : ""}`;

const HOME = "Hollybrook House";

function page(title: string, active: "residents" | "logs", side: string, body: string) {
  const nav = [
    ["Team", "#team", ""],
    ["Residents", "/desk", "residents"],
    ["Logs", "/desk/shift", "logs"],
    ["To-Do's", "#todo", ""],
    ["Rota", "#rota", ""],
    ["Reports", "#reports", ""],
  ]
    .map(([label, href, key]) => `<a href="${href}" class="${key === active ? "on" : ""}">${label}</a>`)
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Care Desk</title><style>${STYLE}</style></head>
<body>
<header class="top"><a class="logo" href="/desk">${LOGO}Care Desk</a><nav>${nav}</nav>
<span class="tools"><span class="home">${HOME}</span>${icon("bell")}${icon("help")}${icon("gear")}</span></header>
<div class="shell">
${side}
<main>${body}
<p class="foot">Care Desk is a fictional care system made for this demo; every resident and record is synthetic. <button type="button" id="cd-reset">Reset demo data to now</button></p>
</main></div>
<script>
document.getElementById("cd-reset").addEventListener("click", async () => {
  if (!confirm("Rebuild the synthetic demo home? All demo changes are cleared.")) return;
  await fetch("/_agent-native/actions/reset-demo", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  location.reload();
});
</script>
</body></html>`;
}

/** The home-level sidebar for list pages. */
function homeSide(active: "residents" | "logs", count: number) {
  const a = (on: boolean) => (on ? ' class="on"' : "");
  return `<aside class="side">
<div class="back" style="color:var(--ink)">${HOME}</div>
<div class="grp">
<div class="item open">${sideIcon("user")}Residents${icon("up", "i chev")}</div>
<div class="sub"><a href="/desk"${a(active === "residents")}>Current residents (${count})</a><a href="#pre-admission">Pre-admission</a><a href="#former">Former residents</a></div>
<a class="item" href="/desk/shift">${sideIcon("lines")}Daily Logs</a>
<div class="sub"><a href="/desk/shift"${a(active === "logs")}>Today's logs</a><a href="#handover">Handover</a></div>
<div class="item">${sideIcon("chart")}Charts${icon("down", "i chev")}</div>
<div class="item">${sideIcon("clip")}Care Planning${icon("down", "i chev")}</div>
<div class="item">${sideIcon("pill")}Medication${icon("down", "i chev")}</div>
</div></aside>`;
}

export async function renderResidentList() {
  await ensureSeeded();
  const now = new Date();
  const residents = await getDb()
    .select()
    .from(schema.residents)
    .orderBy(asc(schema.residents.fullName));
  const rows = residents
    .map(
      (r) => `<tr>
<td><a class="rname" href="/desk/residents/${esc(r.id)}">${avatar(r.fullName, 38)}<span>${esc(r.fullName)}<small>Prefers ${esc(r.preferredName)}</small></span></a></td>
<td>${esc(r.room.split(",")[0])}</td>
<td>${esc(r.room.split(",")[1]?.trim() ?? "")}</td>
<td>${ageOn(r.dateOfBirth, now)}</td>
<td><span class="pill">Residential</span></td></tr>`,
    )
    .join("");
  return page(
    "Residents",
    "residents",
    homeSide("residents", residents.length),
    `<section class="card"><div class="title"><h1>Residents</h1><span class="search">${icon("search")}Search residents</span><span class="btn primary">${icon("plus")}Add resident</span></div></section>
<section class="card"><table><thead><tr><th>Name</th><th>Room</th><th>Zone</th><th>Age</th><th>Care type</th></tr></thead><tbody>${rows}</tbody></table></section>`,
  );
}

export async function renderResident(residentId: string, days = 2) {
  await ensureSeeded();
  const db = getDb();
  const now = new Date();
  const [resident] = await db
    .select()
    .from(schema.residents)
    .where(eq(schema.residents.id, residentId));
  if (!resident) return null;
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const [plan, records] = await Promise.all([
    db
      .select()
      .from(schema.carePlanLines)
      .where(eq(schema.carePlanLines.residentId, residentId))
      .orderBy(asc(schema.carePlanLines.position)),
    db
      .select()
      .from(schema.observations)
      .where(
        and(
          eq(schema.observations.residentId, residentId),
          gte(schema.observations.recordedAt, since),
        ),
      )
      .orderBy(desc(schema.observations.recordedAt))
      .limit(Math.max(40, days * 20)),
  ]);

  const sections = [...new Set(plan.map((l) => l.section))]
    .map((section) => {
      const lines = plan.filter((l) => l.section === section);
      const latest = lines.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b));
      return `<h3>${esc(section)}</h3><ul class="plan">${lines
        .map((l) => `<li data-line-id="${esc(l.id)}">${esc(l.text)}</li>`)
        .join("")}</ul><p class="meta">Last updated ${esc(whenLabel(latest.updatedAt, now))} by ${esc(latest.updatedBy)}</p>`;
    })
    .join("");
  const about = resident.aboutMe
    .map((s) => `<dt data-about="${esc(s.label)}">${esc(s.label)}</dt><dd data-about="${esc(s.label)}">${esc(s.text)}</dd>`)
    .join("");
  const recordRows = records
    .map(
      (o) => `<tr data-record-id="${esc(o.id)}"><td style="white-space:nowrap">${esc(whenLabel(o.recordedAt, now))}</td><td>${cat(o.category)}</td><td>${esc(o.note)}</td><td>${by(o)}</td></tr>`,
    )
    .join("");
  const reviewDue = plan[0]?.reviewDue;
  const [roomNo, zone] = resident.room.split(",").map((s) => s.trim());
  const dob = new Date(`${resident.dateOfBirth}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  const side = `<aside class="side">
<a class="back" href="/desk">${icon("back")}Residents list</a>
<div class="who">${avatar(resident.fullName, 44)}<div><b>${esc(resident.preferredName)}</b><span>${esc(resident.fullName)}</span><em>Residential</em></div>${icon("down")}</div>
<div class="grp">
<div class="item">${sideIcon("user")}Profile${icon("down", "i chev")}</div>
<a class="item" href="#daily-records">${sideIcon("lines")}Daily Logs</a>
<div class="item">${sideIcon("chart")}Charts${icon("down", "i chev")}</div>
<div class="item">${sideIcon("file")}Documentation${icon("down", "i chev")}</div>
<div class="item open">${sideIcon("clip")}Care Planning${icon("up", "i chev")}</div>
<div class="sub"><a href="#care-plan" class="on">Care Plan</a><a href="#about-me">About Me</a><a href="#risk">Risk Assessments</a><a href="#reviews">Reviews</a></div>
<div class="item">${sideIcon("pill")}Medication${icon("down", "i chev")}</div>
<div class="item">${sideIcon("hand")}Consent${icon("down", "i chev")}</div>
</div></aside>`;

  return page(
    resident.fullName,
    "residents",
    side,
    `<section class="card"><div class="title"><h1><span data-resident-name>${esc(resident.fullName)}</span>'s Care Plan</h1><span class="btn">${icon("passport")}Hospital Passport</span></div>
<div class="prof">${avatar(resident.fullName, 64)}<div><div class="nm">${esc(resident.preferredName)}</div><div class="dt">${esc(resident.fullName)} • ${esc(dob)} (${ageOn(resident.dateOfBirth, now)})</div><span class="tag">RESIDENTIAL</span></div>
<dl class="facts"><dt>Room</dt><dd>${esc(roomNo)}</dd><dt>Zone</dt><dd>${esc(zone ?? "")}</dd><dt>Care team</dt><dd>All carers</dd></dl></div></section>
<section class="card" id="care-plan"><div class="sec"><span class="tile">${icon("clip")}</span><h2>Care plan</h2><a class="edit" href="#care-plan">${icon("pen")}Edit</a></div>${sections}
${reviewDue ? `<p class="meta">Next review due ${esc(shortDay(reviewDue))}</p>` : ""}</section>
<section class="card" id="daily-records"><div class="sec"><span class="tile">${icon("lines")}</span><h2>Daily logs</h2><span class="sub2">Last ${days} days, newest first</span></div>
<table><thead><tr><th>When</th><th>Type</th><th>Log</th><th>By</th></tr></thead><tbody>${recordRows}</tbody></table></section>
<section class="card" id="about-me"><div class="sec"><span class="tile">${icon("heart")}</span><h2>About me</h2><a class="edit" href="#about-me">${icon("pen")}Edit</a></div><dl class="about">${about}</dl></section>`,
  );
}

/** The carers' page: today's records for the whole home, newest first. */
export async function renderShift() {
  await ensureSeeded();
  const db = getDb();
  const now = new Date();
  const startOfDay = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const [residents, records] = await Promise.all([
    db.select().from(schema.residents).orderBy(asc(schema.residents.fullName)),
    db
      .select()
      .from(schema.observations)
      .where(gte(schema.observations.recordedAt, startOfDay))
      .orderBy(desc(schema.observations.recordedAt))
      .limit(80),
  ]);
  const names = new Map(residents.map((r) => [r.id, r]));
  const today = records.filter((o) => whenLabel(o.recordedAt, now).startsWith("today"));
  const rows = today
    .map((o) => {
      const r = names.get(o.residentId);
      return `<tr data-record-id="${esc(o.id)}"><td style="white-space:nowrap">${esc(whenLabel(o.recordedAt, now).replace("today ", ""))}</td><td><a class="rname" href="/desk/residents/${esc(o.residentId)}">${avatar(r?.fullName ?? o.residentId, 28)}${esc(r?.preferredName ?? o.residentId)}</a></td><td>${cat(o.category)}</td><td>${esc(o.note)}</td><td>${by(o)}</td></tr>`;
    })
    .join("");
  return page(
    "Today's logs",
    "logs",
    homeSide("logs", residents.length),
    `<section class="card"><div class="title"><h1>Today's logs</h1><span class="btn primary">${icon("plus")}Add log</span></div><p class="sub2" style="margin:8px 0 0">${HOME} · Day shift · ${residents.length} residents</p></section>
<section class="card" id="shift-records"><div class="sec"><span class="tile">${icon("lines")}</span><h2>Logs</h2><span class="sub2">Newest first</span></div>
<table><thead><tr><th>Time</th><th>Resident</th><th>Type</th><th>Log</th><th>By</th></tr></thead><tbody>${rows}</tbody></table></section>`,
  );
}

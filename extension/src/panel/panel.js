import { backendKindFor, createBackends } from "../backend/backend.js";

// The side panel: follows the care-system tab, shows Anji's brief for the
// resident on screen (or the home overview), relays plan checks to the page
// and sends the manager's decisions to the backend. The AI only suggests;
// a person accepts, edits or dismisses.
//
// The briefing and the chat are one conversation with Anji, and both are
// linked to the page: every source chip and citation scrolls the page to its
// evidence; a flag clicked or text selected on the page becomes a question in
// the chat; when the agent points at something (show-on-page), the page
// follows.

const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const norm = (text) =>
  String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[.;,\s]+$/, "")
    .trim()
    .toLowerCase();

const state = {
  backend: null,
  backends: null,
  backendKind: null,
  unsubscribe: null,
  tabId: null,
  context: null,
  brief: null,
  overview: null,
  placement: { found: [], missing: [] },
  editing: null,
  busy: null,
  notice: null,
  error: null,
  verify: null,
  previousChecks: new Map(),
  chatCount: 0,
  briefingOpen: false,
  chat: { url: null, frame: null, ready: false, queue: [] },
  focusNonce: undefined,
  planText: new Map(),
  // Survives the page change it causes: "Fix the plan" from the whole-home
  // list opens the resident, then points at the line and drafts the fix.
  pendingJump: null,
  // The carer's shift view.
  shift: null,
  shiftNote: "",
  shiftPreview: null,
};

// ---------- tab and page context ----------

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function askPage(message) {
  if (state.tabId == null) return null;
  try {
    return await chrome.tabs.sendMessage(state.tabId, message);
  } catch {
    return null;
  }
}

async function followActiveTab() {
  const tab = await activeTab();
  if (state.tabId != null && state.tabId !== tab?.id) {
    chrome.tabs.sendMessage(state.tabId, { type: "angel:panel", open: false }).catch(() => {});
  }
  state.tabId = tab?.id ?? null;
  askPage({ type: "angel:panel", open: true });
  const context = await askPage({ type: "angel:get-context" });
  setContext(context);
}

function sameResident(a, b) {
  return a?.page === b?.page && a?.residentId === b?.residentId;
}

/** The backend follows the page (Care Desk → Agent-Native). */
function useBackendFor(context) {
  if (!state.backends || !context) return false;
  const kind = backendKindFor(context);
  if (kind === state.backendKind) return false;
  state.unsubscribe?.();
  state.backendKind = kind;
  state.backend = state.backends[kind];
  state.focusNonce = undefined;
  state.unsubscribe = state.backend.subscribe(scheduleRefresh, setStatus);
  return true;
}

function setContext(context) {
  const switched = useBackendFor(context);
  const changed = switched || !sameResident(state.context, context);
  state.context = context;
  if (changed) {
    // A new resident clears everything that belonged to the last one.
    state.brief = null;
    state.overview = null;
    state.editing = null;
    state.notice = null;
    state.error = null;
    state.previousChecks = new Map();
    state.chatCount = 0;
    state.briefingOpen = false;
    state.planText = new Map();
    updateChat();
  }
  if (state.verify && context?.residentId === state.verify.residentId) {
    const shown = (context.planLines || []).some((t) => norm(t) === norm(state.verify.text));
    state.notice = shown
      ? { tone: "ok", text: "Saved in Care Desk and read back from the page." }
      : { tone: "warn", text: "Saved, but Care Desk does not show the new wording yet. Refresh the page to check." };
    state.verify = null;
    requestAnimationFrame(() => $("view").scrollTo(0, 0));
  }
  render();
  refresh();
}

// ---------- data ----------

let refreshTimer = null;
let refreshSeq = 0;

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 250);
}

async function refresh() {
  const ctx = state.context;
  if (!state.backend || !ctx) return;
  followAgentFocus();
  const seq = ++refreshSeq;
  try {
    if (ctx.page === "resident" && ctx.residentId) {
      const brief = await state.backend.getResidentBrief(ctx.residentId, ctx);
      if (seq !== refreshSeq) return;
      noticeNewRecords(brief);
      state.brief = brief;
      for (const c of brief.checks) state.planText.set(c.lineId, c.lineText);
      state.error = null;
      const placement = await askPage({ type: "angel:annotate", checks: brief.checks });
      state.placement = placement || { found: [], missing: brief.checks.map((c) => c.lineId) };
    } else if (ctx.page === "home") {
      const overview = await state.backend.homeOverview();
      if (seq !== refreshSeq) return;
      state.overview = overview;
      state.error = null;
    } else if (ctx.page === "shift" && state.backend.shiftStillDue) {
      const shift = await state.backend.shiftStillDue();
      if (seq !== refreshSeq) return;
      state.shift = shift;
      state.error = null;
    }
  } catch (error) {
    if (seq === refreshSeq) state.error = error.message;
  }
  render();
  if (seq === refreshSeq) runPendingJump();
}

/** Finish a jump started on the whole-home list, once the resident's page is annotated. */
async function runPendingJump() {
  const jump = state.pendingJump;
  const ctx = state.context;
  if (!jump || ctx?.page !== "resident" || ctx.residentId !== jump.residentId || !state.brief) return;
  state.pendingJump = null;
  const check = state.brief.checks.find((c) => c.lineId === jump.lineId);
  if (!check) return;
  await focusPage({ kind: "plan", lineText: check.lineText });
  if (jump.fix && !check.draft) await suggest(check.lineId);
  else document.querySelector(".check-draft, .check-gap, .check-drift")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function noticeNewRecords(brief) {
  for (const check of brief.checks) {
    const before = state.previousChecks.get(check.lineId);
    if (before === "gap" && check.state === "recorded") {
      state.notice = { tone: "ok", text: `New record: ${check.label}. The plan line is no longer flagged.` };
    }
  }
  state.previousChecks = new Map(brief.checks.map((c) => [c.lineId, c.state]));
}

// ---------- decisions ----------

async function run(label, work) {
  state.busy = label;
  state.error = null;
  render();
  try {
    await work();
  } catch (error) {
    state.error = error.message;
  } finally {
    state.busy = null;
    render();
  }
}

function findDraft(draftId) {
  return state.brief?.checks.find((c) => c.draft?.id === draftId)?.draft || null;
}

function suggest(lineId) {
  return run("Preparing a suggestion", async () => {
    await state.backend.draftPlanUpdate({ lineId });
    state.notice = { tone: "info", text: "Suggestion shown as tracked changes on the care plan. Nothing changes until you accept." };
    await refresh();
    document.querySelector(".check-draft")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function accept(draftId, finalText) {
  return run("Saving to Care Desk", async () => {
    const result = await state.backend.acceptPlanUpdate({ draftId, finalText });
    state.editing = null;
    state.verify = { residentId: result.residentId, text: result.text };
    state.notice = { tone: "info", text: "Saved. Reading it back from Care Desk..." };
    render();
    // Reload the care system's page and check the saved wording is there.
    const reloaded = await askPage({ type: "angel:reload" });
    if (!reloaded) {
      state.verify = null;
      state.notice = { tone: "ok", text: `Saved in Care Desk: "${result.text}"` };
      await refresh();
    }
  });
}

function dismiss(draftId) {
  return run("Dismissing", async () => {
    await state.backend.dismissPlanUpdate({ draftId });
    state.editing = null;
    state.notice = { tone: "info", text: "Suggestion dismissed. The care plan is unchanged." };
    await refresh();
  });
}

function askShift(lineId) {
  return run("Asking the shift", async () => {
    const result = await state.backend.askTheShift(lineId);
    state.notice = {
      tone: "info",
      text: result.alreadyAsked
        ? "Already asked. It closes itself when a record arrives."
        : `Asked the shift at ${result.time}. It closes itself when a record arrives.`,
    };
    await refresh();
  });
}

function jumpTo(residentId, lineId, fix) {
  if (!state.context) return;
  const template = "residentPath" in state.context ? state.context.residentPath : "/desk/residents/{id}";
  if (!template) return;
  state.pendingJump = { residentId, lineId, fix };
  state.notice = fix ? { tone: "info", text: "Opening the plan line and drafting the fix…" } : null;
  render();
  const base = new URL(state.context.url);
  askPage({ type: "angel:navigate", url: `${base.origin}${template.replace("{id}", encodeURIComponent(residentId))}` });
}

function previewNote() {
  const text = state.shiftNote.trim();
  if (text.length < 3) return;
  return run("Reading your note", async () => {
    const preview = await state.backend.previewShiftNote(text);
    state.shiftPreview = { text, ...preview, keep: preview.items.map((_, i) => i) };
  });
}

function saveNote() {
  const p = state.shiftPreview;
  if (!p?.keep.length) return;
  return run("Saving to Care Desk", async () => {
    const result = await state.backend.fileShiftNote({ text: p.text, keep: p.keep });
    const n = result.saved.length;
    const answered = result.answered.length;
    state.notice = {
      tone: "ok",
      text: `Saved ${n} record${n === 1 ? "" : "s"} to Care Desk.${answered ? ` Replied to ${answered} request${answered === 1 ? "" : "s"} from the manager.` : ""}`,
    };
    state.shiftNote = "";
    state.shiftPreview = null;
    await askPage({ type: "angel:reload" });
    await refresh();
  });
}

function startNote(prompt) {
  state.shiftNote = state.shiftNote.trim() ? `${state.shiftNote.trim()} ${prompt}` : prompt;
  state.shiftPreview = null;
  render();
  const box = document.querySelector("textarea[data-shift]");
  box?.focus();
  box?.setSelectionRange(box.value.length, box.value.length);
}

function startEdit(draftId) {
  const draft = findDraft(draftId);
  if (!draft) return;
  state.editing = { draftId, text: draft.afterText };
  render();
  const box = document.querySelector("textarea[data-edit]");
  box?.focus();
  box?.setSelectionRange(box.value.length, box.value.length);
}

// ---------- linking the page and the chat ----------

async function lineTextFor(lineId) {
  if (state.planText.has(lineId)) return state.planText.get(lineId);
  const residentId = state.context?.residentId;
  if (!residentId || !state.backend.getCareRecord) return null;
  try {
    const record = await state.backend.getCareRecord(residentId);
    const visit = (value) => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (value && typeof value === "object") {
        if (typeof value.id === "string" && typeof value.text === "string") state.planText.set(value.id, value.text);
        Object.values(value).forEach(visit);
      }
    };
    visit(record?.plan);
  } catch {
    return null;
  }
  return state.planText.get(lineId) || null;
}

/** Scroll the care system's page to a piece of evidence and highlight it. */
async function focusPage(target) {
  if (!target) return;
  let resolved = target;
  if (target.kind === "plan" && !target.lineText && target.lineId) {
    const lineText = await lineTextFor(target.lineId);
    if (!lineText) return;
    resolved = { kind: "plan", lineText };
  }
  const result = await askPage({ type: "angel:focus", target: resolved });
  if (result && !result.found) {
    state.notice = { tone: "warn", text: "That evidence is not on this page view, so Anji cannot point at it." };
    render();
  }
}

async function followAgentFocus() {
  if (!state.backend?.getPageFocus) return;
  let focus;
  try {
    focus = await state.backend.getPageFocus();
  } catch {
    return;
  }
  const nonce = focus?.nonce ?? null;
  // The first read only sets the baseline, so an old pointer is not replayed.
  if (state.focusNonce === undefined) {
    state.focusNonce = nonce;
    return;
  }
  if (!nonce || nonce === state.focusNonce) return;
  state.focusNonce = nonce;
  if (focus.residentId && focus.residentId === state.context?.residentId) focusPage(focus.target);
}

function chatOrigin() {
  try {
    return new URL(state.chat.url).origin;
  } catch {
    return null;
  }
}

/** Put a question to Anji in the chat, with hidden context for the agent. */
function askChat(message, context) {
  if (!state.chat.url) {
    state.notice = { tone: "info", text: "Anji's chat is not available beside this care system yet." };
    render();
    return;
  }
  const item = { type: "angel:ask", message, context };
  if (state.chat.ready && state.chat.frame?.contentWindow) {
    state.chat.frame.contentWindow.postMessage(item, chatOrigin());
  } else {
    state.chat.queue.push(item);
  }
}

function residentLabel() {
  const r = state.brief?.resident;
  return r ? `${r.fullName} (${r.id})` : state.context?.residentId || "";
}

function askFromPage({ target, label, selection }) {
  const who = state.brief?.resident?.preferredName || "this resident";
  if (selection) {
    askChat(
      `What should I know about this, for ${who}? “${selection}”`,
      `The manager selected this text on the Care Desk page for ${residentLabel()}. Where it sits: ${JSON.stringify(target)}.`,
    );
  } else if (target?.kind === "plan") {
    askChat(
      `Tell me about this care plan line: “${target.lineText}”${label ? ` (Anji's flag: ${label})` : ""}`,
      `The manager clicked Anji's flag on this plan line on the Care Desk page for ${residentLabel()}.`,
    );
  }
}

// ---------- rendering ----------

const STATE_LABEL = {
  gap: "No record found",
  recorded: "Recorded",
  drift: "Off their usual",
  updated: "Plan updated",
  unclear: "Unclear record",
  stale: "Plan changed",
};

function renderContext() {
  const ctx = state.context;
  let html;
  if (!ctx) {
    html = `<span class="muted">Open Care Desk in this tab and Anji follows along.</span>`;
  } else if (ctx.page === "resident") {
    const r = state.brief?.resident;
    html = `<span class="dot-live"></span><span class="muted">Following</span> <strong>${esc(r?.fullName || ctx.residentName || "resident")}</strong>${r ? ` <span class="muted">· ${esc(r.room)}</span>` : ""}`;
  } else if (ctx.page === "home") {
    html = `<span class="dot-live"></span>Whole home <span class="muted">· ${esc(ctx.system)}</span>`;
  } else if (ctx.page === "shift") {
    html = `<span class="dot-live"></span>My shift <span class="muted">· carer view · ${esc(ctx.system)}</span>`;
  } else {
    html = `<span class="muted">${esc(ctx.system)}: open a resident or the resident list.</span>`;
  }
  $("context").innerHTML = html;
}

function sourceChip(source, title, target) {
  if (!target) return `<span class="chip" title="${esc(title || source)}">${esc(source)}</span>`;
  return `<button type="button" class="chip chip-link" data-act="focus" data-target="${esc(JSON.stringify(target))}" title="Show on the page${title ? `: ${esc(title)}` : ""}">${esc(source)}</button>`;
}

function renderKnow(brief) {
  const r = brief.resident;
  const parts = brief.knowThem.parts
    .map((p) => `<mark title="${esc(p.fullText)}">${esc(p.text)}</mark>`)
    .join(" ");
  return `<section class="card know">
    <h2>Getting to know ${esc(r.preferredName)}</h2>
    <p class="know-line">${esc(r.preferredName)}, ${esc(r.age)}. ${parts}</p>
    <div class="chips"><span class="muted small">Quoted from</span>${brief.knowThem.parts
      .map((p) => sourceChip(p.source, p.fullText, p.target))
      .join("")}</div>
  </section>`;
}

function renderPoints(brief) {
  if (!brief.keyPoints.length) {
    return `<section class="card"><h2>Today</h2><p class="muted">Nothing to flag from the last 3 days of records.</p></section>`;
  }
  return `<section class="card">
    <h2>Today</h2>
    <ol class="points">${brief.keyPoints
      .map(
        (p, i) => `<li class="point point-${p.kind}">
          <span class="kind">${p.kind === "safety" ? "Safety" : p.kind === "change" ? "Change" : "Note"}</span>
          <div><p class="point-text">${esc(p.text)}</p>
          ${p.detail && p.detail !== p.text ? `<p class="small muted">${esc(p.detail)}</p>` : ""}
          <div class="chips">${sourceChip(p.source, null, p.target)}<button type="button" class="link" data-act="ask-point" data-index="${i}">Ask why</button></div></div>
        </li>`,
      )
      .join("")}</ol>
  </section>`;
}

function renderDiff(before, after) {
  return AngelDiff.readableDiff(before, after)
    .map((part) =>
      part.op === "del"
        ? `<del>${esc(part.text)}</del>`
        : part.op === "ins"
          ? `<ins>${esc(part.text)}</ins>`
          : esc(part.text),
    )
    .join("");
}

function renderDraft(check) {
  const d = check.draft;
  const busy = Boolean(state.busy);
  if (state.editing?.draftId === d.id) {
    return `<div class="draft">
      <p class="small muted">Edit the wording, then accept. Anji saves exactly what you write.</p>
      <textarea data-edit rows="6">${esc(state.editing.text)}</textarea>
      <div class="row">
        <button class="btn primary" data-act="accept-edit" data-id="${esc(d.id)}" ${busy ? "disabled" : ""}>Accept edited</button>
        <button class="btn" data-act="cancel-edit">Cancel</button>
      </div>
    </div>`;
  }
  return `<div class="draft">
    <p class="small"><strong>Suggested change</strong> <span class="muted">by ${esc(d.author)}</span></p>
    <p class="diff">${renderDiff(d.beforeText, d.afterText)}</p>
    <p class="small muted">Why: ${esc(d.reason)}</p>
    <ul class="evidence">${d.evidence.map((e) => `<li><strong>${esc(e.label)}:</strong> ${esc(e.detail)}</li>`).join("")}</ul>
    <div class="row">
      <button class="btn primary" data-act="accept" data-id="${esc(d.id)}" ${busy ? "disabled" : ""}>Accept</button>
      <button class="btn" data-act="edit" data-id="${esc(d.id)}" ${busy ? "disabled" : ""}>Edit</button>
      <button class="btn" data-act="dismiss" data-id="${esc(d.id)}" ${busy ? "disabled" : ""}>Dismiss</button>
    </div>
    <p class="small muted">Anji only suggests. Nothing changes in Care Desk until you accept.</p>
  </div>`;
}

function renderChecks(brief) {
  if (!brief.checks.length) return "";
  const missing = new Set(state.placement?.missing || []);
  return `<section class="card">
    <h2>Care plan against records</h2>
    ${brief.checks
      .map(
        (c) => `<article class="check check-${c.draft ? "draft" : c.state}">
          <div class="check-head"><span class="pill pill-${c.draft ? "draft" : c.state}">${c.draft ? "Suggestion" : STATE_LABEL[c.state]}</span><span class="small muted">${esc(c.section)}</span></div>
          <blockquote><button type="button" class="quote-link" data-act="focus" data-target="${esc(JSON.stringify({ kind: "plan", lineText: c.lineText }))}" title="Show on the page">${esc(c.lineText)}</button></blockquote>
          <p class="check-label">${esc(c.label)}</p>
          ${c.detail ? `<p class="small muted">${esc(c.detail)}</p>` : ""}
          ${missing.has(c.lineId) ? `<p class="small warn-text">This line is not visible on the page, so it is shown here only.</p>` : ""}
          ${c.draft ? renderDraft(c) : c.canSuggest !== false && c.state === "drift" && c.kind === "appetite" ? `<div class="row"><button class="btn" data-act="suggest" data-line="${esc(c.lineId)}" ${state.busy ? "disabled" : ""}>Suggest an update</button></div>` : ""}
          ${renderAsk(c)}
        </article>`,
      )
      .join("")}
  </section>`;
}

/** "Ask the shift" on a line with no record found, and what became of it. */
function renderAsk(c) {
  if (!state.backend?.askTheShift) return "";
  if (c.ask?.answered) {
    return `<p class="small muted">Asked the shift at ${esc(c.ask.time)}. Reply received at ${esc(c.ask.answered.time)} by ${esc(c.ask.answered.by)}. ${c.state === "gap" ? "Follow-up still needed." : "Care targets are checked separately."}</p>`;
  }
  if (c.ask) return `<p class="small muted">Asked the shift at ${esc(c.ask.time)}. Waiting for a relevant reply; care targets are checked separately.</p>`;
  if (c.state !== "gap") return "";
  return `<div class="row"><button class="btn" data-act="ask-shift" data-line="${esc(c.lineId)}" ${state.busy ? "disabled" : ""}>Ask the shift</button></div>`;
}

function renderCompact(brief) {
  const r = brief.resident;
  const points = brief.keyPoints
    .map((p) => `<li class="line line-${p.kind}"><span class="kind">${p.kind === "safety" ? "Safety" : p.kind === "change" ? "Change" : "Note"}</span><span>${esc(p.text)}</span></li>`)
    .join("");
  const pending = brief.checks.filter((c) => c.draft).length;
  return `<section class="card compact">
    <p class="compact-know">${esc(brief.knowThem?.text)}</p>
    <ol class="compact-points">${points}</ol>
    ${pending ? `<p class="small muted">${pending} plan suggestion waiting for you</p>` : ""}
    <button type="button" class="link" data-act="briefing-open">Show the full briefing for ${esc(r.preferredName)}</button>
  </section>`;
}

function renderResident() {
  const brief = state.brief;
  if (!brief) return state.error ? "" : `<p class="loading">Reading ${esc(state.context.residentName || "the record")}…</p>`;
  const editingOrDraft = state.editing || brief.checks.some((c) => c.draft);
  if (state.chatCount > 0 && !state.briefingOpen && !editingOrDraft) return renderCompact(brief);
  const collapse = state.chatCount > 0 ? `<button type="button" class="link" data-act="briefing-close">Show less</button>` : "";
  return (brief.knowThem ? renderKnow(brief) : "") + renderPoints(brief) + renderChecks(brief) + collapse;
}

function renderHome() {
  const o = state.overview;
  if (!o) return state.error ? "" : `<p class="loading">Checking the home…</p>`;
  const busy = state.busy ? "disabled" : "";
  const action = (row, p) => {
    if (!p.lineId) return "";
    const id = esc(row.resident.id);
    const line = esc(p.lineId);
    if (p.state === "drift" && p.checkKind === "appetite") {
      return `<button class="btn btn-sm primary" data-act="jump-fix" data-id="${id}" data-line="${line}" ${busy}>${row.pendingDrafts ? "Review the fix" : "Fix the plan"}</button>`;
    }
    if (p.state === "gap" && state.backend?.askTheShift) {
      return p.ask && !p.ask.answered
        ? `<span class="small muted">Asked the shift at ${esc(p.ask.time)}</span>`
        : `<button class="btn btn-sm" data-act="ask-shift" data-line="${line}" ${busy}>Ask the shift</button>`;
    }
    if (p.kind === "note") return "";
    return `<button class="btn btn-sm" data-act="jump" data-id="${id}" data-line="${line}" ${busy}>Show me</button>`;
  };
  const kindLabel = (p) => (p.kind === "safety" ? "Safety" : p.kind === "change" ? "Change" : "Reply");
  const rows = o.flagged
    .map(
      (row) => `<li class="resident">
        <button class="resident-name" data-act="open" data-id="${esc(row.resident.id)}">${esc(row.resident.fullName)} <span class="muted small">${esc(row.resident.room)}</span></button>
        ${row.points
          .map(
            (p) => `<div class="line line-${p.kind === "note" ? "done" : p.kind}"><span class="kind">${kindLabel(p)}</span><div class="line-body"><span>${esc(p.text)}</span>${action(row, p)}</div></div>`,
          )
          .join("")}
        ${row.pendingDrafts ? `<span class="small muted">${row.pendingDrafts} plan suggestion waiting for you</span>` : ""}
      </li>`,
    )
    .join("");
  return `<section class="card">
    <h2>Whole home today</h2>
    <p class="small muted">${o.flagged.length} of ${o.checkedResidents} residents need a look. Safety first.</p>
    <ol class="overview">${rows}</ol>
    ${o.note ? `<p class="small muted">${esc(o.note)}</p>` : ""}
    ${o.nothingToFlag.length ? `<p class="small muted">Nothing to flag: ${o.nothingToFlag.map((r) => esc(r.fullName)).join(", ")}.</p>` : ""}
  </section>`;
}

function renderShift() {
  const sh = state.shift;
  if (!sh) return state.error ? "" : `<p class="loading">Reading the shift…</p>`;
  const busy = state.busy ? "disabled" : "";
  const asks = sh.asks.length
    ? `<section class="card asks"><h2>From the manager</h2>${sh.asks
        .map(
          (a) => `<div class="ask"><p class="ask-text">${esc(a.text)}</p><div class="row"><span class="small muted">Asked at ${esc(a.askedAt ? new Date(a.askedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }) : "")} by ${esc(a.askedBy)}</span><button class="link" data-act="start-note" data-prompt="${esc(a.prompt)}">Start a note</button></div></div>`,
        )
        .join("")}</section>`
    : "";
  const p = state.shiftPreview;
  const preview = p
    ? `<div class="preview">
        <p class="small muted">Anji will save ${p.keep.length} record${p.keep.length === 1 ? "" : "s"}. Untick anything that is wrong.</p>
        <ul class="items">${p.items
          .map(
            (it, i) => `<li><label><input type="checkbox" data-keep="${i}" ${p.keep.includes(i) ? "checked" : ""}><span class="item-who">${esc(it.residentName)}</span><span class="item-what">${esc(it.summary)}</span><span class="item-note">${esc(it.note)}</span></label></li>`,
          )
          .join("")}</ul>
        ${p.notSaved.map((n) => `<p class="small warn-text">Not saved: “${esc(n.said)}”. ${esc(n.reason)}</p>`).join("")}
        <div class="row"><button class="btn primary" data-act="save-note" ${busy || (p.keep.length ? "" : "disabled")}>Save ${p.keep.length} record${p.keep.length === 1 ? "" : "s"} to Care Desk</button><button class="btn" data-act="edit-note">Change the note</button></div>
      </div>`
    : `<div class="row"><button class="btn primary" data-act="preview-note" ${busy}>Check before saving</button></div>`;
  const note = `<section class="card say">
      <h2>Tell Anji once</h2>
      <p class="small muted">Everything from your round, in your own words. Anji files one record per resident.</p>
      <textarea data-shift rows="4" placeholder="Margaret drank 200 ml of tea. Jane had all her lunch and 150 ml of water." ${p ? "readonly" : ""}>${esc(state.shiftNote)}</textarea>
      ${preview}
    </section>`;
  const due = `<section class="card">
      <h2>Still to record this shift</h2>
      ${sh.due.length
        ? `<ul class="due">${sh.due
            .map(
              (d) => `<li class="due-${d.kind}"><div><p>${esc(d.text)}</p><p class="small muted">${esc(d.detail)}</p></div><button class="link" data-act="start-note" data-prompt="${esc(d.prompt)}">Start a note</button></li>`,
            )
            .join("")}</ul>`
        : `<p class="muted">Nothing the care plans are still waiting for.</p>`}
    </section>`;
  return asks + note + due;
}

function render() {
  const focused = document.activeElement?.matches?.("textarea[data-shift]");
  const caret = focused ? document.activeElement.selectionStart : null;
  renderContext();
  const parts = [];
  if (state.notice) parts.push(`<p class="notice notice-${state.notice.tone}">${esc(state.notice.text)}</p>`);
  if (state.error) parts.push(`<p class="notice notice-error">${esc(state.error)}</p>`);
  if (state.busy) parts.push(`<p class="notice notice-info">${esc(state.busy)}…</p>`);
  const ctx = state.context;
  if (ctx?.page === "resident") parts.push(renderResident());
  else if (ctx?.page === "home") parts.push(renderHome());
  else if (ctx?.page === "shift") parts.push(renderShift());
  else
    parts.push(`<section class="card empty"><img class="empty-mark" src="icons/angel.svg" alt=""><h2>Anji is ready</h2><p class="muted">Open a resident in Care Desk. Anji reads who is on screen and checks their plan against their records.</p></section>`);
  $("view").innerHTML = parts.join("");
  if (focused) {
    const box = document.querySelector("textarea[data-shift]");
    box?.focus();
    if (caret != null) box?.setSelectionRange(caret, caret);
  }
  document.body.classList.toggle("chatting", state.chatCount > 0);
  $("foot").innerHTML = state.backend
    ? `Brain: ${esc(state.backend.name)} · ${esc(state.backend.baseUrl.replace(/^https?:\/\//, ""))} · ${esc(state.backend.dataLabel || "synthetic demo data")}`
    : "";
}

// ---------- the chat with Anji ----------

function updateChat() {
  const section = $("chat");
  const ctx = state.context;
  const url = ctx?.page === "resident" ? state.backend?.chatUrl(ctx) : ctx?.page === "home" ? state.backend?.chatUrl({}) : null;
  section.hidden = !url;
  if (url === state.chat.url) return;
  state.chat = { url, frame: null, ready: false, queue: [] };
  section.innerHTML = "";
  if (!url) return;
  const frame = document.createElement("iframe");
  frame.title = "Conversation with Anji";
  frame.src = url;
  section.appendChild(frame);
  state.chat.frame = frame;
}

window.addEventListener("message", (event) => {
  const chat = state.chat;
  if (!chat.frame || event.source !== chat.frame.contentWindow || event.origin !== chatOrigin()) return;
  const data = event.data;
  if (data?.source !== "angel-chat") return;
  if (data.type === "angel:chat-ready") {
    chat.ready = true;
    for (const item of chat.queue.splice(0)) chat.frame.contentWindow.postMessage(item, chatOrigin());
  }
  if (data.type === "angel:chat-count" && typeof data.count === "number") {
    if (data.count !== state.chatCount) {
      state.chatCount = data.count;
      render();
    }
  }
  if (data.type === "angel:focus") focusPage(data.target);
});

// ---------- events ----------

$("view").addEventListener("click", (event) => {
  const button = event.target.closest("[data-act]");
  if (!button) return;
  const { act, id, line } = button.dataset;
  if (act === "suggest") suggest(line);
  if (act === "ask-shift") askShift(line);
  if (act === "jump-fix") jumpTo(id, line, true);
  if (act === "jump") jumpTo(id, line, false);
  if (act === "preview-note") previewNote();
  if (act === "save-note") saveNote();
  if (act === "edit-note") {
    state.shiftPreview = null;
    render();
  }
  if (act === "start-note") startNote(button.dataset.prompt || "");
  if (act === "accept") accept(id);
  if (act === "edit") startEdit(id);
  if (act === "dismiss") dismiss(id);
  if (act === "cancel-edit") {
    state.editing = null;
    render();
  }
  if (act === "accept-edit") {
    const text = document.querySelector("textarea[data-edit]")?.value?.trim();
    if (text) accept(id, text);
  }
  if (act === "focus") {
    try {
      focusPage(JSON.parse(button.dataset.target));
    } catch {
      // Malformed target; nothing to point at.
    }
  }
  if (act === "ask-point") {
    const point = state.brief?.keyPoints?.[Number(button.dataset.index)];
    if (point) {
      askChat(
        `Why is this flagged for ${state.brief.resident.preferredName}: “${point.text}”`,
        `Anji's briefing point for ${residentLabel()}: ${JSON.stringify(point)}`,
      );
    }
  }
  if (act === "briefing-open" || act === "briefing-close") {
    state.briefingOpen = act === "briefing-open";
    render();
  }
  if (act === "open" && state.context) {
    // The adapter says how the care system addresses a resident; null means it is not known.
    const template = "residentPath" in state.context ? state.context.residentPath : "/desk/residents/{id}";
    if (!template) {
      state.notice = { tone: "info", text: `Open this resident in ${state.context.system} and Anji follows.` };
      render();
      return;
    }
    const base = new URL(state.context.url);
    askPage({ type: "angel:navigate", url: `${base.origin}${template.replace("{id}", encodeURIComponent(id))}` });
  }
});

$("view").addEventListener("change", (event) => {
  const box = event.target.closest?.("input[data-keep]");
  if (!box || !state.shiftPreview) return;
  const i = Number(box.dataset.keep);
  const keep = new Set(state.shiftPreview.keep);
  if (box.checked) keep.add(i);
  else keep.delete(i);
  state.shiftPreview.keep = [...keep].sort((a, b) => a - b);
  render();
});

$("view").addEventListener("input", (event) => {
  if (event.target.matches("textarea[data-edit]") && state.editing) {
    state.editing.text = event.target.value;
  }
  if (event.target.matches("textarea[data-shift]")) state.shiftNote = event.target.value;
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.tab?.id !== state.tabId) return;
  if (message?.type === "angel:context") setContext(message.context);
  if (message?.type === "angel:placement" && message.placement) {
    state.placement = message.placement;
    render();
  }
  if (message?.type === "angel:suggest") suggest(message.lineId);
  if (message?.type === "angel:ask-about") askFromPage(message);
  if (message?.type === "angel:decision") {
    if (message.action === "accept") accept(message.draftId);
    if (message.action === "edit") startEdit(message.draftId);
    if (message.action === "dismiss") dismiss(message.draftId);
  }
});

chrome.tabs.onActivated.addListener(() => followActiveTab());
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (tabId === state.tabId && info.status === "complete") followActiveTab();
});

function setStatus(value) {
  const el = $("status");
  el.dataset.state = value;
  el.textContent =
    value === "live" ? "Live" : value === "reconnecting" ? "Reconnecting" : value === "signed-out" ? "Signed out" : "Connecting";
}

window.addEventListener("pagehide", () => {
  if (state.tabId != null) chrome.tabs.sendMessage(state.tabId, { type: "angel:panel", open: false }).catch(() => {});
});

(async function start() {
  state.backends = await createBackends();
  useBackendFor({ system: "Care Desk" });
  await followAgentFocus();
  render();
  await followActiveTab();
})();

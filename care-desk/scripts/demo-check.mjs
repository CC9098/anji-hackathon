// End-to-end check of the four demo moments, run against the real app and the
// real unpacked extension in Chrome for Testing (isolated profile). Writes
// 1440-wide screenshots: the Care Desk page and the side panel, captured from
// the two live surfaces and placed side by side.
//
//   node scripts/demo-check.mjs            (app must be running on :5490)
//
// Env: CHROME_PATH (Chrome for Testing binary), APP_URL, OUT_DIR.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const APP = process.env.APP_URL || "http://localhost:5490";
const EXT = resolve(here, "../../extension");
const OUT = resolve(process.env.OUT_DIR || join(here, "../docs/screenshots")); // guard:allow-env-credential — output folder path
const CHROME =
  process.env.CHROME_PATH || // guard:allow-env-credential — browser binary path
  join(
    homedir(),
    "Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  );
const PORT = 9333;
const SCRATCH = mkdtempSync(join(tmpdir(), "angel-shots-"));
const results = [];
mkdirSync(OUT, { recursive: true });

function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function action(name, body) {
  const res = await fetch(`${APP}/_agent-native/actions/${name}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${name}: ${json.error}`);
  return json;
}

// Minimal CDP client for the side panel, which Playwright does not expose.
async function panelSession(match = (url) => url.endsWith("/sidepanel.html")) {
  for (let i = 0; i < 80; i += 1) {
    const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
    const target = list.find((t) => match(t.url));
    if (target) {
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((ok, fail) => {
        ws.onopen = ok;
        ws.onerror = fail;
      });
      let id = 0;
      const pending = new Map();
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && pending.has(msg.id)) {
          pending.get(msg.id)(msg);
          pending.delete(msg.id);
        }
      };
      const send = (method, params = {}) =>
        new Promise((ok) => {
          id += 1;
          pending.set(id, ok);
          ws.send(JSON.stringify({ id, method, params }));
        });
      const evaluate = async (expression) => {
        const msg = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
        return msg.result?.result?.value;
      };
      return { send, evaluate, close: () => ws.close() };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Side panel did not open");
}

async function waitFor(label, fn, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await fn();
    if (value) return { value, ms: Date.now() - start };
    await new Promise((r) => setTimeout(r, 100));
  }
  return { value: null, ms: Date.now() - start, label };
}

async function shot(page, panel, name) {
  const pagePng = join(SCRATCH, `${name}-page.png`);
  const panelPng = join(SCRATCH, `${name}-panel.png`);
  await page.screenshot({ path: pagePng });
  const capture = await panel.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(panelPng, Buffer.from(capture.result.data, "base64"));
  const out = join(OUT, `${name}.png`);
  execFileSync("python3", [
    "-c",
    `
import sys
from PIL import Image
a = Image.open(sys.argv[1]).convert("RGB"); b = Image.open(sys.argv[2]).convert("RGB")
h = max(a.height, b.height)
canvas = Image.new("RGB", (a.width + 1 + b.width, h), (205, 210, 207))
canvas.paste(a, (0, 0)); canvas.paste(b, (a.width + 1, 0))
canvas.save(sys.argv[3])
print(canvas.size)
`,
    pagePng,
    panelPng,
    out,
  ]);
  console.log(`      screenshot ${out}`);
}

const panelText = (panel) => panel.evaluate("document.body.textContent");
const pageTags = (page) => page.$$eval(".angel-tag", (els) => els.map((e) => e.textContent));
const focused = (page) => page.$eval(".angel-focus", (el) => el.textContent.trim()).catch(() => null);
const clickPanel = (panel, selector) =>
  panel.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); if (!b) return false; b.click(); return true; })()`);

await action("reset-demo", {});
const profile = mkdtempSync(join(tmpdir(), "angel-demo-"));
const context = await chromium.launchPersistentContext(profile, {
  headless: false,
  executablePath: CHROME,
  viewport: null,
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    `--remote-debugging-port=${PORT}`,
    "--window-size=1440,900",
    "--lang=en-GB",
  ],
});

try {
  const page = context.pages()[0] || (await context.newPage());

  // Home overview.
  await page.goto(`${APP}/desk`);
  await page.click(".angel-launcher");
  const panel = await panelSession();
  const home = await waitFor("overview", async () => /Whole home today/.test((await panelText(panel)) || ""));
  const homeText = (await panelText(panel)) || "";
  check("Overview opens on the Care Desk home page", home.value);
  await page.waitForTimeout(800);
  const order = ["Margaret Ellis", "John Parker", "Arthur Bennett"].map((n) => homeText.indexOf(n));
  check("Overview lists only residents with something to look at, safety first", order.every((i) => i >= 0) && order[0] < order[2] && order[1] < order[2] && /Nothing to flag: Jane Whitfield/.test(homeText), order.join(","));
  await shot(page, panel, "0-home-overview");

  // Moment 1: auto-follow and getting to know her.
  await page.goto(`${APP}/desk/residents/res-margaret`);
  const follow = await waitFor("follow", async () => /Getting to know Margaret/.test((await panelText(panel)) || ""));
  const text = (await panelText(panel)) || "";
  check("Moment 1: panel follows to Margaret", follow.value, `${follow.ms} ms`);
  check("Moment 1: know-her line quotes About me", text.includes("Margaret, 87. Former nurse. Settles with tea and 1940s music.") && /About me, My life/.test(text) && /About me, What helps me settle/.test(text));
  const firstKind = await panel.evaluate(`document.querySelector(".points .kind")?.textContent`);
  check("Moment 1: first key point is safety", firstKind === "Safety", firstKind);

  // One conversation: the chat sits under the briefing, without framework chrome.
  const chatShown = await panel.evaluate(`(() => { const c = document.querySelector("#chat"); return Boolean(c && !c.hidden && c.querySelector("iframe")) && !document.querySelector("#ask-toggle"); })()`);
  check("Linking: the chat sits under the briefing in one panel", chatShown);
  const chatFrame = await panelSession((url) => url.includes("/angel/ask?residentId=res-margaret"));
  const plainComposer = await waitFor("composer", () =>
    chatFrame.evaluate(`(() => { const box = document.querySelector("textarea, [contenteditable=true]"); if (!box) return false; const text = document.body.innerText; return !/GPT-6|Claude Opus|Sonnet/.test(text) ? (box.getAttribute("placeholder") || box.getAttribute("aria-placeholder") || box.dataset.placeholder || "set") : false; })()`), 20000);
  check("Linking: chat composer has no model picker and speaks to the manager", plainComposer.value, String(plainComposer.value));

  // Moment 2: page annotation.
  const gapTag = await waitFor("gap tag", async () => (await pageTags(page)).find((t) => t === "No record found yesterday after 14:00"));
  check("Moment 2: fluid line underlined with 'No record found yesterday after 14:00'", gapTag.value);
  const underlined = await page.$eval(".angel-gap", (el) => el.textContent.startsWith("Offer at least 1.5 litres of fluid daily")).catch(() => false);
  check("Moment 2: annotation is on the fluid plan line", underlined);
  await shot(page, panel, "1-know-her-and-annotation");

  // Linking, panel to page: a source chip scrolls the page to its evidence.
  await clickPanel(panel, `.points [data-act="focus"]`);
  const chipFocus = await waitFor("chip focus", () => focused(page), 4000);
  check("Linking: a briefing source chip highlights its line on the page", chipFocus.value?.startsWith("Offer at least 1.5 litres"), chipFocus.value?.slice(0, 40));
  await clickPanel(panel, `.know [data-act="focus"]`);
  const aboutFocus = await waitFor("about focus", async () => ((await focused(page)) || "").startsWith("Former nurse"), 4000);
  check("Linking: an About me chip highlights the quoted words on the page", aboutFocus.value);

  // Linking, page to chat: selecting text offers to ask Anji about it.
  const settle = page.locator("#about-me dd", { hasText: "Vera Lynn" });
  await settle.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const box = await settle.boundingBox();
  await page.mouse.move(box.x + 2, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 5, box.y + box.height - 5, { steps: 8 });
  await page.mouse.up();
  const chipShown = true;
  const askChip = await waitFor("ask chip", () => page.$eval(".angel-ask-chip", (el) => !el.hidden).catch(() => false), 3000);
  const selDebug = askChip.value ? "" : await page.evaluate(() => JSON.stringify({ sel: window.getSelection().toString().slice(0, 40), chip: document.querySelector(".angel-ask-chip")?.hidden, n: document.querySelectorAll(".angel-ask-chip").length }));
  check("Linking: selecting text on the page offers 'Ask Anji about this'", chipShown && askChip.value, selDebug);
  await page.evaluate(() => window.getSelection().removeAllRanges());
  await page.keyboard.press("Escape");

  // Moment 3: a Cardputer-style HTTP record turns the line green live.
  const posted = Date.now();
  const logged = await action("log-observation", { text: "Margaret drank 120 ml of tea", source: "HTTP", recordedBy: "Tom Walsh" });
  const green = await waitFor("green", async () => (await pageTags(page)).find((t) => t === `Recorded 120 ml, ${logged.time}`), 8000);
  check("Moment 3: line turns green without a page refresh", green.value, `${Date.now() - posted} ms after the POST`);
  check("Moment 3: green class applied", await page.$(".angel-recorded").then(Boolean));
  await page.waitForTimeout(1700);
  await shot(page, panel, "2-recorded-live");

  // Moment 4: revision mode, dismiss, edit, accept.
  const appetite = (await action("list-plan-gaps?residentId=res-margaret")).checks.find((c) => c.kind === "appetite");
  check("Moment 4: appetite drift detected", appetite?.state === "drift", appetite?.label);
  await clickPanel(panel, `[data-act="suggest"]`);
  const revise = await waitFor("revise", () => page.$(".angel-revise del, .angel-revise ins"));
  check("Moment 4: suggestion shown on the plan as red deletions and green insertions", revise.value, `${revise.ms} ms`);
  await shot(page, panel, "3-revision-mode");

  await clickPanel(panel, `[data-act="dismiss"]`);
  const dismissed = await waitFor("dismissed", async () => !(await page.$(".angel-revise")) && (await pageTags(page)).some((t) => t.startsWith("Eating less than usual")));
  check("Moment 4: Dismiss removes the suggestion and leaves the plan unchanged", dismissed.value);

  await clickPanel(panel, `[data-act="suggest"]`);
  await waitFor("revise again", () => page.$(".angel-revise"));
  await clickPanel(panel, `[data-act="edit"]`);
  const edited = "Offer smaller portions more often, with a fortified snack mid-morning and mid-afternoon. Record what Margaret eats at every meal.";
  await panel.evaluate(`(() => { const t = document.querySelector("textarea[data-edit]"); t.value = ${JSON.stringify(edited)}; t.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
  await clickPanel(panel, `[data-act="accept-edit"]`);
  const readBack = await waitFor("read back", async () => /Saved in Care Desk and read back from the page/.test((await panelText(panel)) || ""), 10000);
  const pageHasEdit = await page.$$eval("#care-plan li", (els, want) => els.some((e) => e.textContent.trim().startsWith(want)), edited.slice(0, 40));
  check("Moment 4: Edit then Accept writes the edited wording back to Care Desk", readBack.value && pageHasEdit);
  await page.waitForTimeout(600);
  check("Moment 4: the read-back notice is in view", (await panel.evaluate(`document.querySelector("#view").scrollTop`)) === 0);
  await shot(page, panel, "4-accepted-read-back");

  // Plain Accept on a fresh copy of the demo.
  await action("reset-demo", {});
  await page.reload();
  await waitFor("gap again", async () => (await pageTags(page)).includes("No record found yesterday after 14:00"));
  await clickPanel(panel, `[data-act="suggest"]`);
  await waitFor("revise 3", () => page.$(".angel-revise"));
  await page.click(".angel-revise .angel-btn:not(.angel-btn-primary)");
  const editor = await waitFor("editor", () => panel.evaluate(`Boolean(document.querySelector("textarea[data-edit]"))`));
  check("Moment 4: Edit on the page opens the editor in the side panel", editor.value);
  await clickPanel(panel, `[data-act="cancel-edit"]`);
  await page.click(".angel-revise .angel-btn-primary");
  const accepted = await waitFor("accepted", async () => /Saved in Care Desk and read back from the page/.test((await panelText(panel)) || ""), 10000);
  const plan = await page.$$eval("#care-plan li", (els) => els.map((e) => e.textContent.trim()));
  check("Moment 4: Accept from the page writes the suggestion back to Care Desk", accepted.value && plan.some((t) => t.startsWith("Margaret's appetite has been lower than usual")));

  // A plan line the page does not show stays in the side panel only.
  await page.goto(`${APP}/desk/residents/res-jane`);
  await waitFor("jane", async () => /Getting to know Jane/.test((await panelText(panel)) || ""));
  await page.evaluate(() => {
    const li = [...document.querySelectorAll("#care-plan li")].find((e) => e.textContent.includes("fluid"));
    if (li) li.textContent = "Fluids: see the hydration chart.";
  });
  await action("log-observation", { text: "Jane drank 150 ml of water", source: "HTTP" });
  const missing = await waitFor("missing", async () => /not visible on the page, so it is shown here only/.test((await panelText(panel)) || ""));
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  check("Unmatched plan line is reported in the panel only, without errors", missing.value && errors.length === 0);

  // Story 2 (manager): one button from the whole-home list.
  await action("reset-demo", {});
  await page.goto(`${APP}/desk`);
  await waitFor("overview again", async () => /Whole home today/.test((await panelText(panel)) || ""));
  const buttons = await waitFor("buttons", () => panel.evaluate(`(() => [...document.querySelectorAll(".overview [data-act]")].map((b) => b.dataset.act + ":" + (b.dataset.line || b.dataset.id)))()`).then((v) => (v?.includes("jump-fix:res-margaret-plan-3") ? v : null)));
  check("Story 2: the whole-home list offers Fix the plan and Ask the shift", buttons.value?.includes("ask-shift:res-margaret-plan-1"), (buttons.value || []).join(" "));
  await clickPanel(panel, `[data-act="ask-shift"][data-line="res-margaret-plan-1"]`);
  const askedShift = await waitFor("asked shift", async () => /Asked the shift at \d\d:\d\d/.test((await panelText(panel)) || ""));
  check("Story 2: Ask the shift is sent and shown on the list", askedShift.value);
  const jumpStart = Date.now();
  await clickPanel(panel, `[data-act="jump-fix"][data-line="res-margaret-plan-3"]`);
  const fixed = await waitFor("jump and fix", async () => page.url().includes("/desk/residents/res-margaret") && (await page.$(".angel-revise ins")), 15000);
  const jumpFocus = await waitFor("jump focus", () => focused(page), 4000);
  check("Story 2: Fix the plan opens the resident with the fix drafted on the plan line", fixed.value && (jumpFocus.value || "").includes("Margaret eats well"), `${Date.now() - jumpStart} ms, focus: ${(jumpFocus.value || "").slice(0, 30)}`);
  await page.waitForTimeout(800);
  await shot(page, panel, "7-fix-the-plan");

  // Story 1 (carer): say it once on the shift page.
  await page.goto(`${APP}/desk/shift`);
  const carer = await waitFor("carer view", async () => /Tell Anji once/.test((await panelText(panel)) || ""));
  const carerText = (await panelText(panel)) || "";
  check("Story 1: the shift page switches Anji to the carer's view", carer.value && /Logs/.test(await page.textContent(".top nav a.on")));
  check("Story 1: the manager's question is at the top of the carer's view", /From the manager.*Margaret: no fluid record found/s.test(carerText));
  check("Story 1: still to record lists what the plans expect", (new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour12: false }) < "07:01" || /Margaret: 0 of 1,500 ml so far today/.test(carerText)) && (!/\b(1[4-9]|2\d):/.test(new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/London" })) || /Jane: lunch not recorded yet/.test(carerText)));
  const note = "Margaret drank 200 ml of tea. Jane had all her lunch and drank 150 ml of water.";
  await panel.evaluate(`(() => { const t = document.querySelector("textarea[data-shift]"); t.value = ${JSON.stringify(note)}; t.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
  await clickPanel(panel, `[data-act="preview-note"]`);
  const items = await waitFor("preview", () => panel.evaluate(`(() => { const l = [...document.querySelectorAll(".items li")].map((li) => li.textContent.replace(/\\s+/g, " ").trim()); return l.length ? l : null; })()`));
  check("Story 1: one note becomes one record per resident per item, shown before saving", items.value?.length === 3 && /Margaret\s*Fluid · 200 ml/.test(items.value[0]) && /Jane\s*Food · Lunch · All/.test(items.value[1]) && /Jane\s*Fluid · 150 ml/.test(items.value[2]), (items.value || []).join(" | "));
  await shot(page, panel, "8-shift-preview");
  await clickPanel(panel, `[data-act="save-note"]`);
  const saved = await waitFor("saved", async () => /Saved 3 records to Care Desk\. Replied to 1 request from the manager/.test((await panelText(panel)) || ""), 10000);
  const rows = await waitFor("page rows", () => page.$$eval("#shift-records tbody tr", (trs) => trs.map((t) => t.textContent)).then((r) => (r.filter((t) => /via Anji/.test(t)).length >= 3 ? r : null)).catch(() => null), 8000);
  check("Story 1: Save writes the records to Care Desk's own page, marked via Anji", saved.value && rows.value);
  const after = (await panelText(panel)) || "";
  check("Story 1: the answered question and the recorded items leave the lists by themselves", !/From the manager/.test(after) && !/Margaret: 0 of 1,500/.test(after) && !/Jane: lunch not recorded yet/.test(after));
  await page.waitForTimeout(600);
  await shot(page, panel, "9-shift-saved");

  // The loop closes: the manager's list shows the answer.
  await page.goto(`${APP}/desk`);
  const closed = await waitFor("loop closed", async () => /Reply from the shift at \d\d:\d\d: Drank 200 ml of tea/.test((await panelText(panel)) || ""));
  check("Stories meet: the manager's question closes itself on the carer's record", closed.value);
  await shot(page, panel, "10-loop-closed");

  // Reliability regressions: normal page navigation, real side-panel preview/save.
  await action("reset-demo", {});
  await page.goto(`${APP}/desk/residents/res-margaret`);
  await waitFor("fresh gap", async () => (await pageTags(page)).includes("No record found yesterday after 14:00"));
  await clickPanel(panel, `[data-act="ask-shift"]`);
  await waitFor("asked", async () => /Waiting for a relevant reply/.test((await panelText(panel)) || ""));
  await page.goto(`${APP}/desk/shift`);
  await waitFor("shift ready", () => panel.evaluate(`Boolean(document.querySelector("textarea[data-shift]"))`));
  async function previewNote(text) {
    await panel.evaluate(`(() => { const t = document.querySelector("textarea[data-shift]"); t.value = ${JSON.stringify(text)}; t.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    await clickPanel(panel, `[data-act="preview-note"]`);
    await waitFor("preview ready", () => panel.evaluate(`Boolean(document.querySelector(".items li"))`));
    return panel.evaluate(`[...document.querySelectorAll(".items li")].map(e => e.innerText)`);
  }
  for (const phrase of ["did not drink 200 ml", "refused the 200 ml tea", "offered 200 ml"]) {
    const preview = await previewNote(`Margaret ${phrase}.`);
    check(`Reliability preview: ${phrase}`, preview.length === 1 && !preview[0].includes("Fluid · 200 ml") && !/Drank (refused|offered)/.test(preview[0]), preview.join(" | "));
    await clickPanel(panel, `[data-act="edit-note"]`);
  }
  await previewNote("Margaret refused the 200 ml tea.");
  await clickPanel(panel, `[data-act="save-note"]`);
  await waitFor("refusal saved", async () => /Saved 1 record/.test((await panelText(panel)) || ""));
  check("Reliability: refusal saved as original wording in Care Desk", (await waitFor("refusal row", async () => /Refused the 200 ml tea/.test(await page.textContent("#shift-records")))).value);
  await page.goto(`${APP}/desk/residents/res-margaret`);
  const followup = await waitFor("follow-up", async () => (await pageTags(page)).some(t => /intake still needs follow-up/.test(t)));
  check("Reliability: refusal replies to manager but stays amber with follow-up", followup.value && /Reply received.*Follow-up still needed/s.test((await panelText(panel)) || "") && !(await page.$(".angel-recorded")));
  check("Reliability: unknown intake is not displayed as confirmed zero", !/Recorded 0 ml|Confirmed intake recorded today: 0 ml/.test((await panelText(panel)) || ""));
  await shot(page, panel, "11-refusal-follow-up");
  await page.goto(`${APP}/desk/shift`);
  await waitFor("shift again", () => panel.evaluate(`Boolean(document.querySelector("textarea[data-shift]"))`));
  const mixed = await previewNote("Margaret refused 200 ml tea then drank 80 ml water. Arthur ate all his breakfast.");
  check("Reliability: refusal, actual intake and another resident stay separate", mixed.length === 3 && /not consumed/.test(mixed[0]) && /80 ml/.test(mixed[1]) && /Arthur/.test(mixed[2]), mixed.join(" | "));
  await shot(page, panel, "12-mixed-note-preview");
  await clickPanel(panel, `[data-act="save-note"]`);
  await waitFor("mixed saved", async () => /Saved 3 records/.test((await panelText(panel)) || ""));
  await page.goto(`${APP}/desk/residents/res-margaret`);
  check("Reliability: only the 80 ml actually drunk becomes a green record", (await waitFor("80 ml", async () => (await pageTags(page)).some(t => /^Recorded 80 ml/.test(t)))).value);

  await clickPanel(panel, `[data-act="suggest"]`);
  await waitFor("draft", () => page.$(".angel-revise"));
  await clickPanel(panel, `[data-act="edit"]`);
  const unrelated = "Margaret likes the curtains open in the morning.";
  await panel.evaluate(`(() => { const t = document.querySelector("textarea[data-edit]"); t.value = ${JSON.stringify(unrelated)}; t.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await clickPanel(panel, `[data-act="accept-edit"]`);
  await waitFor("unrelated readback", async () => /Saved in Care Desk and read back from the page/.test((await panelText(panel)) || ""));
  await waitFor("updated check arrives", async () => /still needs review/.test((await panelText(panel)) || "") && (await page.textContent("#care-plan")).includes(unrelated));
  const finalPanel = (await panelText(panel)) || "";
  check("Reliability: unrelated edited plan is saved without declaring the concern resolved", (await page.textContent("#care-plan")).includes(unrelated) && /still needs review/.test(finalPanel) && !/plan now reflects it/.test(finalPanel));
  const updatedColour = await page.$eval(".angel-tag-updated", e => getComputedStyle(e).backgroundColor);
  check("Reliability: plan update is amber, not the green recorded state", updatedColour === "rgb(255, 240, 205)", updatedColour);
  await shot(page, panel, "13-plan-updated-not-resolved");

  // Optional: the agent in the side panel (needs a model key; costs a little).
  if (process.env.WITH_AGENT) { // guard:allow-env-credential — opt-in test flag
    await action("reset-demo", {});
    await page.goto(`${APP}/desk/residents/res-margaret`);
    await waitFor("margaret", async () => /Getting to know Margaret/.test((await panelText(panel)) || ""));
    const chat = await panelSession((url) => url.includes("/angel/ask?residentId=res-margaret"));
    await waitFor("chat ready", () => chat.evaluate(`Boolean(document.querySelector("textarea, [contenteditable=true]"))`), 20000);

    // Page to chat: clicking Anji's flag on the page asks about that line.
    await page.waitForTimeout(1500);
    await page.click(".angel-tag-ask.angel-tag-gap");
    const asked = await waitFor("flag question", () => chat.evaluate(`document.body.innerText.includes("Tell me about this care plan line")`), 15000);
    check("Agent: clicking a flag on the page puts the question in the chat", asked.value);

    // Chat to page: the answer links its evidence, and the agent points at it.
    const pointed = await waitFor("agent points", () => focused(page), 180000);
    check("Agent: show-on-page scrolls the page to what the answer is about", pointed.value, pointed.value?.slice(0, 40));
    const linked = await waitFor("citation links", () => chat.evaluate(`document.querySelectorAll('a[href^="#plan:"], a[href^="#record:"], a[href^="#about:"]').length`), 120000);
    check("Agent: the answer's citations are links to the page", linked.value > 0, `${linked.value} links`);
    await page.evaluate(() => document.querySelectorAll(".angel-focus").forEach((n) => n.classList.remove("angel-focus")));
    await chat.evaluate(`document.querySelector('a[href^="#plan:"], a[href^="#record:"], a[href^="#about:"]')?.click()`);
    const cited = await waitFor("citation focus", () => focused(page), 4000);
    check("Agent: clicking a citation highlights it on the page", cited.value, cited.value?.slice(0, 40));
    await page.waitForTimeout(1200);
    await shot(page, panel, "5-chat-linked");

    // The agent drafts the plan change itself; it appears on the plan.
    // Sent the way the panel sends questions: into the chat iframe.
    const typed = await panel.evaluate(`(() => { const f = document.querySelector("#chat iframe"); if (!f) return false; f.contentWindow.postMessage({ type: "angel:ask", message: "Draft a care plan update for Margaret's eating" }, new URL(f.src).origin); return true; })()`);
    const drafted = await waitFor("agent draft", () => page.$(".angel-revise"), 180000);
    const gaps = await action("list-plan-gaps?residentId=res-margaret");
    const draft = gaps.checks.find((c) => c.draft)?.draft;
    check("Agent: its draft appears on the plan as tracked changes", drafted.value && draft, `${Math.round(drafted.ms / 1000)} s, author ${draft?.author}, typed ${typed}`);
    await page.waitForTimeout(4000);
    await shot(page, panel, "6-agent-draft");
    chat.close();
  }

  chatFrame.close();
  panel.close();
} finally {
  await context.close();
  await action("reset-demo", {}).catch(() => {});
}

writeFileSync(join(OUT, "demo-check.json"), JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);

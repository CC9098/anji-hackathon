// Runs inside the care system's page. Reports page context to the side panel
// and draws Anji's annotations. Nothing here writes to the care system; every
// decision is sent to the side panel, which calls the backend.
(function () {
  const adapter = AngelAdapters.pick(location);
  if (!adapter) return;

  let lastContext = null;
  let lastChecks = [];

  function send(message) {
    try {
      chrome.runtime.sendMessage(message).catch(() => {});
    } catch {
      // Extension reloaded; this page's script is orphaned until refresh.
    }
  }

  function reportContext(force = false) {
    const context = adapter.readContext(document);
    const key = JSON.stringify(context);
    if (!force && key === JSON.stringify(lastContext)) return;
    lastContext = context;
    send({ type: "angel:context", context });
  }

  // ---------- annotations ----------

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    node.setAttribute("data-angel", "");
    return node;
  }

  function clearAnnotations() {
    // The launcher and the ask chip stay; everything else Anji drew goes.
    document
      .querySelectorAll("[data-angel]:not(.angel-launcher):not(.angel-ask-chip)")
      .forEach((node) => node.remove());
    document.querySelectorAll(".angel-orig").forEach((wrap) => {
      wrap.replaceWith(...wrap.childNodes);
    });
    document.querySelectorAll(".angel-line").forEach((line) => {
      line.classList.remove(
        "angel-line",
        "angel-gap",
        "angel-recorded",
        "angel-drift",
        "angel-updated",
        "angel-revise",
        "angel-flash",
        "angel-unclear",
        "angel-stale",
      );
    });
  }

  function decisionButton(label, action, draftId, primary) {
    const button = el("button", `angel-btn${primary ? " angel-btn-primary" : ""}`, label);
    button.type = "button";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      send({ type: "angel:decision", action, draftId });
    });
    return button;
  }

  /** Wrap the host's own text so Anji's marks style it and nothing else. */
  function wrapHostText(line) {
    const wrap = document.createElement("span");
    wrap.className = "angel-orig";
    while (line.firstChild) wrap.appendChild(line.firstChild);
    line.appendChild(wrap);
  }

  function renderRevision(line, check) {
    const diff = el("span", "angel-diff");
    for (const part of AngelDiff.readableDiff(check.draft.beforeText, check.draft.afterText)) {
      const tag = part.op === "del" ? "del" : part.op === "ins" ? "ins" : "span";
      diff.appendChild(el(tag, `angel-${part.op}`, part.text));
    }
    line.appendChild(diff);
    const bar = el("span", "angel-bar");
    bar.appendChild(el("span", "angel-tag angel-tag-draft", `Suggested by Anji · ${check.label}`));
    bar.appendChild(decisionButton("Accept", "accept", check.draft.id, true));
    bar.appendChild(decisionButton("Edit", "edit", check.draft.id));
    bar.appendChild(decisionButton("Dismiss", "dismiss", check.draft.id));
    line.appendChild(bar);
  }

  function annotate(checks) {
    const previous = new Map(lastChecks.map((c) => [c.lineId, c.state]));
    lastChecks = checks;
    clearAnnotations();
    const found = [];
    const missing = [];
    for (const check of checks) {
      const line = adapter.findPlanLine(document, check.lineText);
      if (!line) {
        missing.push(check.lineId);
        continue;
      }
      found.push(check.lineId);
      line.classList.add("angel-line");
      // On pages Anji does not own, the host's nodes are never moved.
      if (adapter.wrapLines !== false) wrapHostText(line);
      if (check.draft) {
        line.classList.add("angel-revise");
        renderRevision(line, check);
        continue;
      }
      line.classList.add(`angel-${check.state}`);
      const changed = previous.has(check.lineId) && previous.get(check.lineId) !== check.state;
      if (changed) line.classList.add("angel-flash");
      const bar = el("span", "angel-bar");
      if (adapter.askFromPage === false) {
        const tag = el("span", `angel-tag angel-tag-${check.state}`, check.label);
        tag.title = `Anji: ${check.detail || check.label}`;
        bar.appendChild(tag);
      } else {
        const tag = el("button", `angel-tag angel-tag-${check.state} angel-tag-ask`, check.label);
        tag.type = "button";
        tag.title = "Ask Anji about this line";
        tag.addEventListener("click", (event) => {
          event.preventDefault();
          askAbout({ kind: "plan", lineText: check.lineText }, { label: check.label });
        });
        bar.appendChild(tag);
      }
      if (check.canSuggest !== false && check.state === "drift" && check.kind === "appetite") {
        const suggest = el("button", "angel-btn", "Suggest an update");
        suggest.type = "button";
        suggest.addEventListener("click", () => send({ type: "angel:suggest", lineId: check.lineId }));
        bar.appendChild(suggest);
      }
      line.appendChild(bar);
    }
    return { found, missing };
  }

  // ---------- linking the page and the chat ----------

  function askAbout(target, extra = {}) {
    send({ type: "angel:ask-about", target, ...extra });
  }

  let focusTimer = null;
  function focus(target) {
    const node = adapter.findTarget(document, target);
    document.querySelectorAll(".angel-focus").forEach((n) => n.classList.remove("angel-focus"));
    if (!node) return { found: false };
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    // Restart the pulse even when the same element is focused twice.
    void node.offsetWidth;
    node.classList.add("angel-focus");
    clearTimeout(focusTimer);
    focusTimer = setTimeout(() => node.classList.remove("angel-focus"), 2600);
    return { found: true };
  }

  const askChip = el("button", "angel-ask-chip", "Ask Anji about this");
  askChip.type = "button";
  askChip.hidden = true;
  let selected = null;
  askChip.addEventListener("mousedown", (event) => event.preventDefault());
  askChip.addEventListener("click", () => {
    if (selected) askAbout(selected.target, { selection: selected.text });
    askChip.hidden = true;
    window.getSelection()?.removeAllRanges();
  });
  document.body.appendChild(askChip);

  function showAskChip() {
    const selection = window.getSelection();
    const text = selection?.toString().replace(/\s+/g, " ").trim() || "";
    if (!selection || selection.isCollapsed || text.length < 3) {
      askChip.hidden = true;
      selected = null;
      return;
    }
    const anchor = selection.anchorNode?.nodeType === Node.TEXT_NODE ? selection.anchorNode.parentElement : selection.anchorNode;
    const target = adapter.describe(anchor);
    if (!target || anchor?.closest?.("[data-angel]")) {
      askChip.hidden = true;
      selected = null;
      return;
    }
    selected = { text: text.slice(0, 600), target };
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    askChip.style.top = `${window.scrollY + rect.bottom + 8}px`;
    askChip.style.left = `${Math.max(8, window.scrollX + rect.left)}px`;
    askChip.hidden = false;
  }

  document.addEventListener("mouseup", () => setTimeout(showAskChip, 0));
  document.addEventListener("keyup", (event) => {
    if (event.key === "Escape") askChip.hidden = true;
  });

  // ---------- launcher ----------

  const launcher = el("button", "angel-launcher", "Anji");
  launcher.type = "button";
  launcher.title = "Open Anji beside this page";
  launcher.addEventListener("click", () => send({ type: "angel:open-panel" }));
  document.body.appendChild(launcher);

  // ---------- messages ----------

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "angel:get-context") {
      lastContext = adapter.readContext(document);
      sendResponse(lastContext);
      return;
    }
    if (message?.type === "angel:annotate") {
      const placement = annotate(message.checks || []);
      watchAnnotations(placement);
      sendResponse(placement);
      return;
    }
    if (message?.type === "angel:focus") {
      sendResponse(focus(message.target));
      return;
    }
    if (message?.type === "angel:panel") {
      launcher.hidden = Boolean(message.open);
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "angel:reload") {
      location.reload();
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "angel:navigate" && typeof message.url === "string") {
      const target = new URL(message.url, location.href);
      if (target.origin === location.origin) location.assign(target.href);
      sendResponse({ ok: true });
    }
  });

  // ---------- single-page apps (Care Office) ----------
  //
  // The host may render plan text after Anji annotates, re-render and drop
  // Anji's flags, or change the URL without a reload. For such adapters,
  // re-check for a while and tell the side panel when the placement changes.

  let watchTimer = null;
  let lastPlacement = null;
  function watchAnnotations(placement) {
    if (!adapter.spa) return;
    lastPlacement = placement;
    clearInterval(watchTimer);
    let tries = 0;
    watchTimer = setInterval(() => {
      tries += 1;
      if (!lastChecks.length || tries > 30) {
        clearInterval(watchTimer);
        return;
      }
      const bars = document.querySelectorAll(".angel-line > .angel-bar[data-angel]").length;
      if (!lastPlacement.missing.length && bars >= lastPlacement.found.length) return;
      const next = annotate(lastChecks);
      if (JSON.stringify(next) !== JSON.stringify(lastPlacement)) {
        lastPlacement = next;
        send({ type: "angel:placement", placement: next });
      }
    }, 2000);
  }

  if (adapter.spa) {
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      lastChecks = [];
      clearInterval(watchTimer);
      clearAnnotations();
      reportContext();
    }, 800);
  }

  window.addEventListener("popstate", () => reportContext());
  window.addEventListener("hashchange", () => reportContext());
  reportContext(true);
})();

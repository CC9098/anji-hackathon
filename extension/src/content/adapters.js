// Page adapters read only two things from the host page: which resident is on
// screen, and where each care-plan line sits. Everything else comes from the
// backend. CareDeskAdapter serves the Care Desk demo; another care system
// needs only its own adapter here.
//
// interface PageAdapter {
//   name: string;
//   matches(location: Location): boolean;
//   readContext(doc: Document): {
//     system: string;
//     page: "home" | "resident" | "shift" | "other";
//     residentId?: string;
//     residentName?: string;
//     planLines: string[];
//     url: string;
//   };
//   findPlanLine(doc: Document, text: string): HTMLElement | null;
//   findTarget(doc: Document, target): HTMLElement | null;
//     target = { kind: "plan", lineText } | { kind: "record", recordId }
//            | { kind: "about", label }
//   // Optional, for pages Anji does not own:
//   spa?: boolean;              // the URL changes without a reload; watch it
//   wrapLines?: boolean;        // false: never move the host's own nodes
//   askFromPage?: boolean;      // false: flags are labels, not chat questions
// }
(function (root) {
  const normalise = (text) =>
    String(text || "")
      .replace(/\s+/g, " ")
      .replace(/[.;,\s]+$/, "")
      .trim()
      .toLowerCase();

  /** Text of a host element, ignoring anything Anji added. */
  function hostText(el) {
    let text = "";
    el.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
      else if (node.nodeType === Node.ELEMENT_NODE && !node.hasAttribute("data-angel")) {
        text += node.classList.contains("angel-orig") ? node.textContent : hostText(node);
      }
    });
    return text;
  }

  const CareDeskAdapter = {
    name: "Care Desk",
    matches(location) {
      return /^\/desk(\/|$)/.test(location.pathname);
    },
    readContext(doc) {
      const url = doc.location.href;
      const path = doc.location.pathname;
      const resident = path.match(/^\/desk\/residents\/([^/?#]+)/);
      if (resident) {
        return {
          system: this.name,
          page: "resident",
          residentId: decodeURIComponent(resident[1]),
          residentName: (doc.querySelector("main [data-resident-name]") || doc.querySelector("main h1"))?.textContent?.trim() || "",
          planLines: this.planLineElements(doc).map((el) => hostText(el).trim()),
          url,
        };
      }
      if (/^\/desk\/?$/.test(path)) {
        return { system: this.name, page: "home", planLines: [], url };
      }
      if (/^\/desk\/shift\/?$/.test(path)) {
        // The carers' shift page: Anji switches to the carer's view.
        return { system: this.name, page: "shift", planLines: [], url };
      }
      return { system: this.name, page: "other", planLines: [], url };
    },
    planLineElements(doc) {
      return Array.from(doc.querySelectorAll("#care-plan ul li"));
    },
    findPlanLine(doc, text) {
      const want = normalise(text);
      return this.planLineElements(doc).find((el) => normalise(hostText(el)) === want) || null;
    },
    findTarget(doc, target) {
      if (target?.kind === "plan" && target.lineText) return this.findPlanLine(doc, target.lineText);
      if (target?.kind === "record" && target.recordId) {
        return doc.querySelector(`#daily-records tr[data-record-id="${CSS.escape(target.recordId)}"]`);
      }
      if (target?.kind === "about" && target.label) {
        const want = normalise(target.label);
        return Array.from(doc.querySelectorAll("#about-me dd")).find(
          (el) => normalise(el.previousElementSibling?.textContent) === want,
        ) || null;
      }
      return null;
    },
    /** Describe a host element the manager clicked or selected in, for Anji. */
    describe(el) {
      const plan = el?.closest?.("#care-plan ul li");
      if (plan) return { kind: "plan", lineText: hostText(plan).trim() };
      const record = el?.closest?.("#daily-records tr[data-record-id]");
      if (record) return { kind: "record", recordId: record.getAttribute("data-record-id") };
      const about = el?.closest?.("#about-me dd");
      if (about) return { kind: "about", label: about.previousElementSibling?.textContent?.trim() || "" };
      return null;
    },
  };

  const adapters = [CareDeskAdapter];
  root.AngelAdapters = {
    pick(location) {
      return adapters.find((a) => a.matches(location)) || null;
    },
    hostText,
  };
})(globalThis);

// Word-level diff used for "tracked changes" on a care-plan line. Classic
// script so both the content script and the side panel can load it.
(function (root) {
  function tokens(text) {
    return String(text).match(/\s+|[^\s]+/g) || [];
  }

  /** @returns {Array<{op: "same"|"del"|"ins", text: string}>} */
  function wordDiff(before, after) {
    const a = tokens(before);
    const b = tokens(after);
    const n = a.length;
    const m = b.length;
    const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    const out = [];
    const push = (op, text) => {
      const last = out[out.length - 1];
      if (last && last.op === op) last.text += text;
      else out.push({ op, text });
    };
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        push("same", a[i]);
        i += 1;
        j += 1;
      } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
        push("del", a[i]);
        i += 1;
      } else {
        push("ins", b[j]);
        j += 1;
      }
    }
    while (i < n) push("del", a[i++]);
    while (j < m) push("ins", b[j++]);
    // Treat whitespace between two changes as part of one changed run, so
    // the reader sees one deletion followed by one insertion.
    const grouped = [];
    for (let k = 0; k < out.length; ) {
      if (out[k].op === "same") {
        grouped.push(out[k]);
        k += 1;
        continue;
      }
      let del = "";
      let ins = "";
      while (k < out.length) {
        const part = out[k];
        const bridge =
          part.op === "same" && /^\s+$/.test(part.text) && out[k + 1] && out[k + 1].op !== "same";
        if (part.op === "same" && !bridge) break;
        if (part.op !== "ins") del += part.text;
        if (part.op !== "del") ins += part.text;
        k += 1;
      }
      if (del.trim()) grouped.push({ op: "del", text: del });
      if (ins.trim()) grouped.push({ op: "ins", text: ins });
    }
    return grouped;
  }

  /**
   * Tracked changes a person can read: word by word for light edits, but a
   * whole deletion followed by the whole new wording when most words change.
   */
  function readableDiff(before, after) {
    const parts = wordDiff(before, after);
    const words = (t) => (t.match(/[^\s]+/g) || []).length;
    const kept = parts.filter((p) => p.op === "same").reduce((n, p) => n + words(p.text), 0);
    if (kept / Math.max(words(before), words(after), 1) >= 0.5) return parts;
    return [
      { op: "del", text: before },
      { op: "ins", text: ` ${after}` },
    ];
  }

  root.AngelDiff = { wordDiff, readableDiff };
})(typeof self !== "undefined" ? self : globalThis);

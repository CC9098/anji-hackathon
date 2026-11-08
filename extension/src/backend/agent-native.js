// Backend over an Agent-Native app: every call is one of the app's actions at
// /_agent-native/actions/<name>, the same action the app's agent and HTTP
// clients (the Cardputer) call. Live updates use the framework's change
// stream, /_agent-native/events.

export class AgentNativeBackend {
  constructor(baseUrl) {
    this.name = "Agent-Native";
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async call(action, args = {}, method = "POST") {
    let url = `${this.baseUrl}/_agent-native/actions/${action}`;
    const init = { method, headers: {} };
    if (method === "GET") {
      const query = new URLSearchParams(
        Object.entries(args).filter(([, v]) => v != null && v !== ""),
      ).toString();
      if (query) url += `?${query}`;
    } else {
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify(args);
    }
    let response;
    try {
      response = await fetch(url, init);
    } catch {
      throw new Error(`Anji is not reachable at ${this.baseUrl}. Is the app running?`);
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `Anji returned ${response.status}`);
    }
    return body;
  }

  getResidentBrief(residentId) {
    return this.call("get-resident-brief", { residentId }, "GET");
  }

  listPlanGaps(residentId) {
    return this.call("list-plan-gaps", { residentId }, "GET");
  }

  logObservation({ text, residentId, source = "Care Desk" }) {
    return this.call("log-observation", { text, residentId, source });
  }

  draftPlanUpdate({ lineId, afterText }) {
    return this.call("draft-plan-update", { lineId, afterText });
  }

  acceptPlanUpdate({ draftId, finalText }) {
    return this.call("accept-plan-update", { draftId, finalText });
  }

  dismissPlanUpdate({ draftId }) {
    return this.call("dismiss-plan-update", { draftId });
  }

  homeOverview() {
    return this.call("home-overview", {}, "GET");
  }

  getCareRecord(residentId) {
    return this.call("get-care-record", { residentId }, "GET");
  }

  previewShiftNote(text) {
    return this.call("preview-shift-note", { text });
  }

  fileShiftNote({ text, keep }) {
    return this.call("file-shift-note", { text, keep, source: "Anji" });
  }

  shiftStillDue() {
    return this.call("shift-still-due", {}, "GET");
  }

  askTheShift(lineId) {
    return this.call("ask-the-shift", { lineId });
  }

  getPageFocus() {
    return this.call("get-page-focus", {}, "GET");
  }

  subscribe(onChange, onStatus = () => {}) {
    let source = null;
    let closed = false;
    let retry = null;
    const open = () => {
      if (closed) return;
      source = new EventSource(`${this.baseUrl}/_agent-native/events`);
      source.onopen = () => onStatus("live");
      source.onerror = () => {
        onStatus("reconnecting");
        source?.close();
        clearTimeout(retry);
        retry = setTimeout(open, 2000);
      };
      source.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (data?.source === "action" || data?.source === "screen-refresh") onChange(data);
      };
    };
    open();
    return () => {
      closed = true;
      clearTimeout(retry);
      source?.close();
    };
  }

  chatUrl(context) {
    const params = new URLSearchParams();
    if (context?.residentId) params.set("residentId", context.residentId);
    return `${this.baseUrl}/angel/ask?${params}`;
  }
}

// The side panel talks to Anji's brain only through this interface. Which
// backend answers follows the page; in this build Care Desk uses the
// Agent-Native backend. Another backend plugs in here and nothing else in the
// extension changes.
//
// interface Backend {
//   name: string;
//   baseUrl: string;
//   dataLabel?: string;                          // footer note on where data comes from
//   readOnly?: boolean;                          // no suggestions, Accept or writes
//   getResidentBrief(residentId): Promise<Brief>;
//   listPlanGaps(residentId?): Promise<{ checks: PlanCheck[] }>;
//   logObservation({ text, residentId?, source? }): Promise<LoggedRecord>;
//   draftPlanUpdate({ lineId, afterText? }): Promise<Draft>;
//   acceptPlanUpdate({ draftId, finalText? }): Promise<Accepted>;
//   dismissPlanUpdate({ draftId }): Promise<void>;
//   homeOverview(): Promise<Overview>;
//   getCareRecord?(residentId): Promise<Record>;   // plan line ids → wording
//   getPageFocus?(): Promise<{ residentId, target, nonce }>;  // what Anji points at
//   subscribe(onChange, onStatus): () => void;   // live updates
//   chatUrl(context): string | null;             // optional agent surface
// }

import { AgentNativeBackend } from "./agent-native.js";

export const DEFAULT_BACKEND_URL = "http://localhost:5490";

/** Which backend serves a page context. No context keeps the Care Desk default. */
export function backendKindFor(context) {
  return "agent-native";
}

/** One instance of each backend, created once; the panel picks per page. */
export async function createBackends() {
  const { backendUrl } = await chrome.storage.local.get(["backendUrl"]);
  return {
    "agent-native": new AgentNativeBackend(backendUrl || DEFAULT_BACKEND_URL),
  };
}

export async function createBackend() {
  return (await createBackends())["agent-native"];
}

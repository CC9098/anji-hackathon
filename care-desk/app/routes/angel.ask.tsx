import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { AgentChatSurface } from "@agent-native/toolkit/app/chat";
import { useEffect } from "react";
import { useSearchParams } from "react-router";

// "Ask Anji": the agent chat shown inside the Chrome extension's side panel,
// under Anji's briefing. The panel passes the resident on screen; navigation
// state carries it to the agent's <current-screen>, so "her" and "this plan"
// mean that resident.
//
// The chat and the care system's page are linked both ways through the
// panel (window.parent):
// - a citation link in an answer (#plan:<id>, #record:<id>, #about:<label>)
//   asks the panel to scroll the page there and highlight it;
// - the panel sends questions in ("angel:ask"), for example when the manager
//   clicks a flag on the page or selects text, and they go to this chat.

const RESIDENT_NAMES: Record<string, string> = {
  "res-margaret": "Margaret",
  "res-john": "John",
  "res-jane": "Jane",
  "res-arthur": "Arthur",
};

const CITATION = /^#(plan|record|about):(.+)$/;

function parentOrigin(): string | null {
  const ancestors = window.location.ancestorOrigins;
  return ancestors && ancestors.length ? ancestors[0] : null;
}

function toPanel(message: Record<string, unknown>) {
  const origin = parentOrigin();
  if (!origin || window.parent === window) return;
  window.parent.postMessage({ source: "angel-chat", ...message }, origin);
}

function usePanelBridge(residentId: string) {
  useEffect(() => {
    const origin = parentOrigin();

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== origin) return;
      const data = event.data;
      if (data?.type !== "angel:ask" || typeof data.message !== "string") return;
      sendToAgentChat({
        message: data.message,
        context: typeof data.context === "string" ? data.context : undefined,
        submit: true,
        openSidebar: false,
        // Inside the side panel's iframe the default target is the parent
        // window; this chat is the one that should answer.
        chatTarget: "local",
      });
    };

    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]");
      const href = link?.getAttribute("href") ?? "";
      const match = href.match(CITATION);
      if (!match) return;
      event.preventDefault();
      event.stopPropagation();
      const [, kind, value] = match;
      const id = decodeURIComponent(value);
      toPanel({
        type: "angel:focus",
        residentId,
        target:
          kind === "plan"
            ? { kind: "plan", lineId: id }
            : kind === "record"
              ? { kind: "record", recordId: id }
              : { kind: "about", label: id },
      });
    };

    window.addEventListener("message", onMessage);
    document.addEventListener("click", onClick, true);
    toPanel({ type: "angel:chat-ready", residentId });
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", onClick, true);
    };
  }, [residentId]);
}

export function meta() {
  return [{ title: "Ask Anji" }];
}

export default function AngelAskRoute() {
  const [params] = useSearchParams();
  const residentId = params.get("residentId") ?? "";
  const name = RESIDENT_NAMES[residentId];
  usePanelBridge(residentId);
  const suggestions = name
    ? [
        `Why is ${name} flagged today?`,
        `Draft a care plan update for ${name}'s eating`,
        `What should I tell ${name}'s family?`,
      ]
    : [
        "Who needs my attention first today?",
        "Which care plans have not caught up with the records?",
      ];
  return (
    <div className="angel-ask dark h-screen w-full bg-background text-foreground">
      <AgentChatSurface
        key={residentId || "home"}
        mode="page"
        className="h-full"
        storageKey={`angel-ask-${residentId || "home"}`}
        showTabBar={false}
        showPageHeader={false}
        showModelSelector={false}
        composerPlaceholder={name ? `Ask Anji about ${name}…` : "Ask Anji about the home…"}
        emptyStateText={
          name
            ? `Ask about ${name}, or click a flag on the page. Anji answers from Care Desk records and links each point to the page.`
            : "Ask about the home. Anji answers from Care Desk records and links each point to the page."
        }
        emptyStateDisplay="hidden"
        suggestionPlacement="context-chips"
        suggestions={suggestions}
        dynamicSuggestions={false}
        onMessageCountChange={(count: number) => toPanel({ type: "angel:chat-count", residentId, count })}
      />
    </div>
  );
}

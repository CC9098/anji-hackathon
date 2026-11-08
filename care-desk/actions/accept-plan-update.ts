import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Manager accepts a pending care-plan suggestion, optionally with edited wording, and writes it back to the Care Desk plan. People only: the agent cannot accept its own suggestions.",
  schema: z.object({
    draftId: z.string().describe("Pending suggestion id"),
    finalText: z
      .string()
      .min(10)
      .max(800)
      .optional()
      .describe("Edited wording to save instead of the suggestion; omit to accept as suggested"),
  }),
  agentTool: false,
  run: async ({ draftId, finalText }) => {
    const db = getDb();
    const [draft] = await db
      .select()
      .from(schema.planDrafts)
      .where(eq(schema.planDrafts.id, draftId));
    if (!draft) fail(`No suggestion ${draftId}`, { errorCode: "not_found", statusCode: 404 });
    if (draft.status !== "pending") {
      fail(`This suggestion was already ${draft.status}.`, { errorCode: "already_decided", statusCode: 409 });
    }
    const [line] = await db
      .select()
      .from(schema.carePlanLines)
      .where(eq(schema.carePlanLines.id, draft.lineId));
    if (!line) fail("The care-plan line no longer exists.", { errorCode: "not_found", statusCode: 404 });
    if (line.text !== draft.beforeText) {
      fail("The plan changed after this suggestion was made. Dismiss it and ask again.", {
        errorCode: "stale_suggestion",
        statusCode: 409,
      });
    }
    const text = finalText?.trim() || draft.afterText;
    const now = new Date().toISOString();
    await db.transaction(async (tx) => {
      await tx
        .update(schema.carePlanLines)
        .set({
          text,
          updatedAt: now,
          updatedBy: finalText ? "Manager (edited Anji suggestion)" : "Manager (accepted Anji suggestion)",
        })
        .where(eq(schema.carePlanLines.id, line.id));
      await tx
        .update(schema.planDrafts)
        .set({ status: "accepted", finalText: text, decidedAt: now })
        .where(eq(schema.planDrafts.id, draftId));
    });
    const [saved] = await db
      .select({ text: schema.carePlanLines.text })
      .from(schema.carePlanLines)
      .where(eq(schema.carePlanLines.id, line.id));
    return {
      id: draftId,
      lineId: line.id,
      residentId: line.residentId,
      text: saved.text,
      _receipt: {
        changed: true,
        verified: saved.text === text,
        summary: "Care plan line saved in Care Desk and read back.",
        subject: line.id,
      },
    };
  },
});

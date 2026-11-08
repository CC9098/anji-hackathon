import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Manager dismisses a pending care-plan suggestion. The plan stays as it is.",
  schema: z.object({
    draftId: z.string().describe("Pending suggestion id"),
  }),
  run: async ({ draftId }) => {
    const db = getDb();
    const [draft] = await db
      .select()
      .from(schema.planDrafts)
      .where(eq(schema.planDrafts.id, draftId));
    if (!draft) fail(`No suggestion ${draftId}`, { errorCode: "not_found", statusCode: 404 });
    if (draft.status !== "pending") return { id: draftId, status: draft.status };
    await db
      .update(schema.planDrafts)
      .set({ status: "dismissed", decidedAt: new Date().toISOString() })
      .where(eq(schema.planDrafts.id, draftId));
    return { id: draftId, lineId: draft.lineId, residentId: draft.residentId, status: "dismissed" };
  },
});

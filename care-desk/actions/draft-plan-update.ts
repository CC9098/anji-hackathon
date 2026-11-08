import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { appetiteTemplate, listPlanChecks } from "../server/lib/rules.js";

export default defineAction({
  description:
    "Suggest a change to one care-plan line that no longer matches what records show (a check in state drift). Saves a pending suggestion that the manager sees as tracked changes on the plan and must Accept, Edit or Dismiss; nothing in the plan changes until a person accepts. Pass afterText to propose your own wording (plain, specific, no diagnosis, no blame); omit it to use the standard wording.",
  schema: z.object({
    lineId: z.string().describe("Care-plan line id from list-plan-gaps or get-resident-brief"),
    afterText: z
      .string()
      .min(10)
      .max(800)
      .optional()
      .describe("Proposed replacement text for the whole line; omit to use the standard wording"),
    reason: z
      .string()
      .max(300)
      .optional()
      .describe("One sentence on why, citing the records; omit to use the check's own reason"),
  }),
  run: async ({ lineId, afterText, reason }, ctx) => {
    const db = getDb();
    const [line] = await db
      .select()
      .from(schema.carePlanLines)
      .where(eq(schema.carePlanLines.id, lineId));
    if (!line) fail(`No care-plan line ${lineId}`, { errorCode: "not_found", statusCode: 404 });
    const check = (await listPlanChecks(line.residentId)).find(
      (c) => c.lineId === lineId,
    );
    if (!check || check.state !== "drift") {
      fail("Records do not show a change against this line, so there is nothing to suggest.", {
        errorCode: "no_drift",
        statusCode: 409,
      });
    }
    const [resident] = await db
      .select()
      .from(schema.residents)
      .where(eq(schema.residents.id, line.residentId));
    const days = Number(check.label.match(/for (\d+) days/)?.[1] ?? 3);
    const proposed =
      afterText?.trim() ||
      (check.kind === "appetite"
        ? appetiteTemplate(resident.preferredName, days)
        : `${line.text} Records show: ${check.label.toLowerCase()}. Review at the next handover.`);
    if (proposed === line.text) {
      fail("The suggestion is the same as the current plan.", { errorCode: "no_change" });
    }
    const fromAgent = ctx?.caller === "tool" || ctx?.caller === "a2a" || Boolean(afterText);
    const values = {
      reason: reason?.trim() || `${check.label}.`,
      beforeText: line.text,
      afterText: proposed,
      evidence: check.evidence,
      author: fromAgent ? "Anji (agent)" : "Anji (rules)",
      createdAt: new Date().toISOString(),
    };
    const [existing] = await db
      .select({ id: schema.planDrafts.id })
      .from(schema.planDrafts)
      .where(
        and(
          eq(schema.planDrafts.lineId, lineId),
          eq(schema.planDrafts.status, "pending"),
        ),
      );
    let id = existing?.id;
    if (id) {
      await db.update(schema.planDrafts).set(values).where(eq(schema.planDrafts.id, id));
    } else {
      id = `draft-${crypto.randomUUID()}`;
      await db.insert(schema.planDrafts).values({
        id,
        residentId: line.residentId,
        lineId,
        status: "pending",
        ...values,
      });
    }
    return {
      id,
      lineId,
      residentId: line.residentId,
      beforeText: values.beforeText,
      afterText: values.afterText,
      author: values.author,
      message:
        "Suggestion saved as tracked changes on the care plan. A manager must Accept, Edit or Dismiss it.",
    };
  },
});

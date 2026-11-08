import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { listPlanChecks } from "../server/lib/rules.js";
import { listAsks } from "../server/lib/shift.js";
import { clock } from "../server/lib/time.js";

export default defineAction({
  description:
    "Ask whoever is on shift about a care-plan line with no record found (for example a fluid gap). The question appears at the top of the carers' shift page and closes itself when a matching record arrives; nobody ticks it off. Only call when the manager asked for this.",
  schema: z.object({
    lineId: z.string().describe("Care-plan line id with a gap, from get-resident-brief or home-overview"),
    askedBy: z.string().max(80).default("Ruth Adams").describe("Who is asking"),
  }),
  run: async ({ lineId, askedBy }) => {
    const db = getDb();
    const [line] = await db.select().from(schema.carePlanLines).where(eq(schema.carePlanLines.id, lineId));
    if (!line) fail(`No care-plan line ${lineId}`, { errorCode: "not_found", statusCode: 404 });
    const [resident] = await db.select().from(schema.residents).where(eq(schema.residents.id, line.residentId));
    const check = (await listPlanChecks(line.residentId)).find((c) => c.lineId === lineId);
    const open = (await listAsks()).find((a) => a.lineId === lineId && !a.answeredBy);
    if (open) return { id: open.id, askedAt: open.askedAt, alreadyAsked: true, text: open.text };
    const askedAt = new Date().toISOString();
    const text = check
      ? `${resident.preferredName}: ${check.label.replace("No record found", `no ${line.checkKind ?? ""} record found`).replace(/\s+/g, " ")}. Please record what you see.`
      : `${resident.preferredName}: please record against "${line.text}".`;
    const id = `ask-${crypto.randomUUID()}`;
    await db.insert(schema.shiftAsks).values({
      id,
      residentId: line.residentId,
      lineId,
      kind: line.checkKind ?? "note",
      text,
      askedAt,
      askedBy,
    });
    return { id, askedAt, time: clock(askedAt), alreadyAsked: false, text };
  },
});

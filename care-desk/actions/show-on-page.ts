import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import type { PageTarget } from "../server/db/schema.js";
import { ensureSeeded } from "../server/lib/seed.js";

export default defineAction({
  description:
    "Point at something on the Care Desk page the manager is looking at: the page scrolls to it and highlights it. Give exactly one of lineId (a care-plan line from get-resident-brief), recordId (a daily record from list-observations) or aboutLabel (an About me heading such as \"My life\"). Use it once when your answer is about one specific line or record.",
  schema: z.object({
    residentId: z.string().describe('Resident id, for example "res-margaret"'),
    lineId: z.string().optional().describe("Care-plan line id"),
    recordId: z.string().optional().describe("Daily record id"),
    aboutLabel: z.string().optional().describe('About me heading, e.g. "What helps me settle"'),
  }),
  run: async ({ residentId, lineId, recordId, aboutLabel }) => {
    await ensureSeeded();
    const db = getDb();
    let target: PageTarget | null = null;
    if (lineId) {
      const [line] = await db
        .select()
        .from(schema.carePlanLines)
        .where(and(eq(schema.carePlanLines.id, lineId), eq(schema.carePlanLines.residentId, residentId)));
      if (line) target = { kind: "plan", lineText: line.text };
    } else if (recordId) {
      const [record] = await db
        .select()
        .from(schema.observations)
        .where(and(eq(schema.observations.id, recordId), eq(schema.observations.residentId, residentId)));
      if (record) target = { kind: "record", recordId: record.id };
    } else if (aboutLabel) {
      target = { kind: "about", label: aboutLabel };
    }
    if (!target) fail("Nothing to point at: give a lineId, recordId or aboutLabel for this resident.", { errorCode: "not_found", statusCode: 404 });
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const row = { id: "current", residentId, target, nonce, createdAt: new Date().toISOString() };
    await db.delete(schema.pageFocus);
    await db.insert(schema.pageFocus).values(row);
    return { shown: target, residentId };
  },
});

import { defineAction } from "@agent-native/core/action";
import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { ensureSeeded } from "../server/lib/seed.js";
import { whenLabel } from "../server/lib/time.js";

export default defineAction({
  description:
    "List one resident's daily records (newest first) for evidence: category Food, Fluid, Night, Wellbeing, Fall or Observation. Each row has a London time label to cite.",
  schema: z.object({
    residentId: z.string().describe('Resident id, for example "res-margaret"'),
    days: z.coerce
      .number()
      .int()
      .min(1)
      .max(14)
      .default(3)
      .describe("How many days back to read, 1 to 14; defaults to 3"),
    category: z
      .string()
      .optional()
      .describe('Only this category, e.g. "Food" or "Fluid"; omit for all'),
  }),
  http: { method: "GET" },
  run: async ({ residentId, days, category }) => {
    await ensureSeeded();
    const now = new Date();
    const since = new Date(now.getTime() - days * 86_400_000).toISOString();
    const rows = await getDb()
      .select()
      .from(schema.observations)
      .where(
        and(
          eq(schema.observations.residentId, residentId),
          gte(schema.observations.recordedAt, since),
          category ? eq(schema.observations.category, category) : undefined,
        ),
      )
      .orderBy(desc(schema.observations.recordedAt))
      .limit(120);
    return {
      records: rows.map((r) => ({
        id: r.id,
        when: whenLabel(r.recordedAt, now),
        category: r.category,
        note: r.note,
        fluidMl: r.fluidMl,
        portion: r.portion,
        source: r.source,
      })),
    };
  },
});

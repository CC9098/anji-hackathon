import { defineAction, fail } from "@agent-native/core/action";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { ensureSeeded } from "../server/lib/seed.js";
import { ageOn } from "../server/lib/time.js";

export default defineAction({
  description:
    "Read one resident's Care Desk record as the care system shows it: details, About me, care plan lines by section and the last 3 days of daily records.",
  schema: z.object({
    residentId: z.string().describe('Resident id, for example "res-margaret"'),
  }),
  http: { method: "GET" },
  run: async ({ residentId }) => {
    await ensureSeeded();
    const db = getDb();
    const [resident] = await db
      .select()
      .from(schema.residents)
      .where(eq(schema.residents.id, residentId));
    if (!resident) fail(`No resident ${residentId}`, { errorCode: "not_found", statusCode: 404 });
    const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const [plan, records] = await Promise.all([
      db
        .select()
        .from(schema.carePlanLines)
        .where(eq(schema.carePlanLines.residentId, residentId))
        .orderBy(asc(schema.carePlanLines.position)),
      db
        .select()
        .from(schema.observations)
        .where(
          and(
            eq(schema.observations.residentId, residentId),
            gte(schema.observations.recordedAt, since),
          ),
        )
        .orderBy(desc(schema.observations.recordedAt))
        .limit(80),
    ]);
    return {
      resident: { ...resident, age: ageOn(resident.dateOfBirth, new Date()) },
      plan,
      records,
    };
  },
});

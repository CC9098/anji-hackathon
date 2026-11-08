import { defineAction } from "@agent-native/core/action";
import { asc } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { ensureSeeded } from "../server/lib/seed.js";
import { ageOn } from "../server/lib/time.js";

export default defineAction({
  description: "List the residents in the Care Desk demo home with id, name, age and room.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    await ensureSeeded();
    const now = new Date();
    const rows = await getDb()
      .select({
        id: schema.residents.id,
        fullName: schema.residents.fullName,
        preferredName: schema.residents.preferredName,
        dateOfBirth: schema.residents.dateOfBirth,
        room: schema.residents.room,
      })
      .from(schema.residents)
      .orderBy(asc(schema.residents.fullName));
    return {
      residents: rows.map(({ dateOfBirth, ...r }) => ({
        ...r,
        age: ageOn(dateOfBirth, now),
      })),
    };
  },
});

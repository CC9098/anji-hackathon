import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { parseObservation } from "../server/lib/parse-observation.js";
import { listPlanChecks } from "../server/lib/rules.js";
import { insertObservation } from "../server/lib/shift.js";
import { ensureSeeded } from "../server/lib/seed.js";
import { clock } from "../server/lib/time.js";

export default defineAction({
  description:
    'Record what a carer observed, e.g. "Margaret drank 120 ml of tea". Writes one Care Desk daily record (Fluid, Food or Note) and returns the updated plan checks for that resident. The resident is taken from residentId or found by first name in the text. Only call when a person asked for this exact record; never invent amounts.',
  schema: z.object({
    text: z.string().min(3).max(500).describe("The observation in plain English"),
    residentId: z
      .string()
      .optional()
      .describe("Resident id; omit to find the resident by name in the text"),
    source: z
      .enum(["Care Desk", "Cardputer", "Anji", "HTTP"])
      .default("HTTP")
      .describe('Where the record came from: "Care Desk", "Cardputer", "Anji" or "HTTP"; defaults to "HTTP"'),
    recordedBy: z
      .string()
      .max(80)
      .default("Care Desk user")
      .describe('Who observed it; defaults to "Care Desk user"'),
  }),
  run: async ({ text, residentId, source, recordedBy }) => {
    await ensureSeeded();
    const db = getDb();
    const residents = await db.select().from(schema.residents);
    let resident = residentId
      ? residents.find((r) => r.id === residentId)
      : undefined;
    if (!resident && !residentId) {
      const matches = residents.filter((r) =>
        new RegExp(`\\b${r.preferredName}\\b`, "i").test(text),
      );
      if (matches.length > 1) {
        fail("More than one resident is named in this note. Say one name.", {
          errorCode: "ambiguous_resident",
        });
      }
      resident = matches[0];
    }
    if (!resident) {
      fail("No resident found for this note. Start with their first name.", {
        errorCode: "resident_not_found",
        statusCode: 404,
      });
    }
    const parsed = parseObservation(text);
    const now = new Date();
    const note = text.trim().replace(/^\w/, (c) => c.toUpperCase());
    const { id } = await insertObservation({
      residentId: resident.id,
      category: parsed.category,
      note,
      fluidMl: parsed.fluidMl,
      meal: parsed.meal,
      portion: parsed.portion,
      source,
      recordedBy,
      at: now,
    });
    const checks = await listPlanChecks(resident.id);
    return {
      id,
      residentId: resident.id,
      residentName: resident.fullName,
      category: parsed.category,
      fluidMl: parsed.fluidMl,
      time: clock(now.toISOString()),
      message: `Recorded for ${resident.preferredName} at ${clock(now.toISOString())}: ${note}`,
      checks,
    };
  },
});

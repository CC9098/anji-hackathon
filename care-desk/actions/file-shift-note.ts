import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { listAsks, previewShiftNote, insertObservation } from "../server/lib/shift.js";

export default defineAction({
  description:
    "Save a carer's shift note to Care Desk as one record per resident per item. The note is split again here with the same rules as preview-shift-note, so what is saved is exactly what the carer saw; keep chooses which preview items to save (by index). Only call when the carer asked to save. Returns the saved records and any manager requests they answered.",
  schema: z.object({
    text: z.string().min(3).max(2000).describe("The same note that was previewed"),
    keep: z.array(z.number().int().min(0)).optional().describe("Indexes of preview items to save; omit to save all"),
    recordedBy: z.string().max(80).default("Priya Sharma").describe("The carer saving the note"),
    source: z.enum(["Anji", "Care Desk", "HTTP"]).default("Anji").describe("Where the note came from"),
  }),
  run: async ({ text, keep, recordedBy, source }) => {
    const preview = await previewShiftNote(text);
    const items = keep ? preview.items.filter((_, i) => keep.includes(i)) : preview.items;
    if (items.length === 0) fail("Nothing to save: no item in this note names a resident.", { errorCode: "nothing_to_save" });
    const before = new Date(Date.now() - 1000);
    const openBefore = (await listAsks()).filter((a) => !a.answeredBy).map((a) => a.id);
    const saved = [];
    for (const item of items) {
      const { id, recordedAt } = await insertObservation({
        residentId: item.residentId,
        category: item.category,
        note: item.note,
        fluidMl: item.fluidMl,
        meal: item.meal,
        portion: item.portion,
        source,
        recordedBy,
      });
      saved.push({ id, recordedAt, residentId: item.residentId, residentName: item.residentName, summary: item.summary, note: item.note });
    }
    const answered = (await listAsks())
      .filter((a) => a.answeredBy && openBefore.includes(a.id) && a.answeredBy.at >= before.toISOString())
      .map((a) => ({ id: a.id, residentId: a.residentId, text: a.text }));
    return { saved, answered, notSaved: preview.notSaved };
  },
});

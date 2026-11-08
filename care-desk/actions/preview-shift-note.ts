import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { previewShiftNote } from "../server/lib/shift.js";

export default defineAction({
  description:
    'Split a carer\'s shift note in their own words (e.g. "Margaret drank 200 ml of tea and ate half her lunch. Jane had all her lunch.") into one Care Desk record per resident per item, without saving anything. Returns items to show the carer, and any part of the note that names no resident (never saved). Amounts, meals and portions are only filled in when the carer said them.',
  schema: z.object({
    text: z.string().min(3).max(2000).describe("The carer's note, as written or said"),
  }),
  readOnly: true,
  run: async ({ text }) => previewShiftNote(text),
});

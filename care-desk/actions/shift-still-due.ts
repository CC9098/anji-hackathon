import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { shiftStillDue } from "../server/lib/shift.js";

export default defineAction({
  description:
    "What the care plans still expect on this shift: open requests from the manager (they close themselves when a matching record arrives), residents behind on fluid against their plan's daily target, and meals not recorded after their usual time. Says what the records show; never says care was not given.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => shiftStillDue(),
});

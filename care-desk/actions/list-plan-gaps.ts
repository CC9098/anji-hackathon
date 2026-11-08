import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { listPlanChecks } from "../server/lib/rules.js";

export default defineAction({
  description:
    "List care-plan checks: for each checked plan line, whether records back it up. state is gap (no record found), recorded (a record closed the gap), drift (the resident is off their own usual and the plan may not have caught up) or updated (plan changed to match). Includes any pending suggested plan change. Omit residentId for the whole home.",
  schema: z.object({
    residentId: z
      .string()
      .optional()
      .describe("Resident id; omit to check every resident in the home"),
  }),
  http: { method: "GET" },
  run: async ({ residentId }) => ({ checks: await listPlanChecks(residentId) }),
});

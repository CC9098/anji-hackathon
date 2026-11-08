import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { resetDemo } from "../server/lib/seed.js";

export default defineAction({
  description:
    "Rebuild the synthetic demo home relative to the current time (or to `now`, an ISO time, so a later take matches an earlier one). Clears every record, plan change and suggestion.",
  schema: z.object({ now: z.string().datetime({ offset: true }).optional() }),
  agentTool: false,
  run: async ({ now }) => resetDemo(now ? new Date(now) : undefined),
});

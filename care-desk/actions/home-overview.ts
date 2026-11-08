import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { homeOverview } from "../server/lib/rules.js";

export default defineAction({
  description:
    "Whole-home overview for the manager: only residents with something to look at today, safety first (falls, no fluid record found), then changes against each resident's own usual. Also lists residents with nothing to flag.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => homeOverview(),
});

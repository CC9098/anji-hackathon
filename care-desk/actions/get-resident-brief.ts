import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { residentBrief } from "../server/lib/rules.js";

export default defineAction({
  description:
    "Get the manager brief for one resident: a 'know them' line quoted from their About me (with sources), up to three key points with safety first, the care-plan checks (fluid gaps, changes against their own usual) and any pending plan suggestions. Synthetic demo data.",
  schema: z.object({
    residentId: z.string().describe('Resident id, for example "res-margaret"'),
  }),
  http: { method: "GET" },
  run: async ({ residentId }) => {
    const brief = await residentBrief(residentId);
    if (!brief) fail(`No resident ${residentId}`, { errorCode: "not_found", statusCode: 404 });
    return brief;
  },
});

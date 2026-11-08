import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "The last thing Anji pointed at on the Care Desk page (read by the side panel). Not needed in chat.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => {
    const [row] = await getDb().select().from(schema.pageFocus);
    return row ? { residentId: row.residentId, target: row.target, nonce: row.nonce } : { nonce: null };
  },
});

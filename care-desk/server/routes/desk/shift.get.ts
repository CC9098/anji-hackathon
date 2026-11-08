import { defineEventHandler } from "h3";

import { renderShift } from "../../lib/care-desk-html.js";

export default defineEventHandler(async () => {
  return new Response(await renderShift(), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
});

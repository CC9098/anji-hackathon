import { defineEventHandler, getQuery, getRouterParam } from "h3";

import { renderResident } from "../../../lib/care-desk-html.js";

export default defineEventHandler(async (event) => {
  // ?days=N (1-14) shows more of the daily log; the default stays 2 days.
  const days = Math.min(14, Math.max(1, Number(getQuery(event).days) || 2));
  const html = await renderResident(getRouterParam(event, "id") ?? "", days);
  return new Response(html ?? "<!doctype html><p>Resident not found.</p>", {
    status: html ? 200 : 404,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
});

import { describe, expect, it } from "vitest";

import { splitShiftNote } from "./shift.js";

const residents = [
  { id: "res-margaret", preferredName: "Margaret" },
  { id: "res-arthur", preferredName: "Arthur" },
  { id: "res-jane", preferredName: "Jane" },
] as Parameters<typeof splitShiftNote>[1];

const summaries = (text: string) =>
  splitShiftNote(text, residents).items.map((i) => `${i.residentName}: ${i.summary}`);

describe("splitShiftNote", () => {
  it("keeps an amount after a comma with the drink it belongs to", () => {
    expect(summaries("Margaret had a cup of tea, about 120 ml. Arthur ate all his breakfast.")).toEqual([
      "Margaret: Fluid · 120 ml",
      "Arthur: Food · Breakfast · All",
    ]);
  });

  it("still splits two drinks with their own amounts", () => {
    expect(summaries("Margaret drank 200 ml of tea, then 150 ml of water.")).toEqual([
      "Margaret: Fluid · 200 ml",
      "Margaret: Fluid · 150 ml",
    ]);
  });

  it("does not invent an amount the carer did not say", () => {
    expect(summaries("Margaret had a cup of tea.")).toEqual(["Margaret: Fluid · amount not said"]);
  });
});

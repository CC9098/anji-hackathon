import { describe, expect, it } from "vitest";
import { parseObservation } from "./parse-observation.js";
import { splitShiftNote, answerFor } from "./shift.js";
import { fluidCheck, lastPlanUpdate, appetiteCheck } from "./rules.js";
import { londonTime } from "./time.js";

const residents = [{ id: "m", preferredName: "Margaret" }, { id: "a", preferredName: "Arthur" }] as Parameters<typeof splitShiftNote>[1];
const now = new Date("2026-11-08T12:00:00Z");
const line = { id: "line", residentId: "m", section: "Fluid", text: "Offer 1.5 litres daily", updatedAt: now.toISOString() } as Parameters<typeof fluidCheck>[0];
const record = (note: string, extra = {}) => ({ id: "obs", residentId: "m", category: "Fluid", recordedAt: "2026-11-08T11:59:00Z", note, fluidMl: parseObservation(note).fluidMl, ...extra });
const data = (records: unknown[]) => ({ observations: records, lines: [], drafts: [], decided: [], resident: residents[0] }) as Parameters<typeof fluidCheck>[1];

describe("intake meaning", () => {
  it.each(["did not drink 200 ml", "refused the 200 ml tea", "offered 200 ml", "may have had 200 ml tea", "200 ml water", "drank some water"])("does not invent intake for %s", text => {
    expect(parseObservation(text).fluidMl).toBeNull();
    const result = splitShiftNote(`Margaret ${text}`, residents).items[0];
    expect(result.note).not.toMatch(/^Drank (?:refused|offered)/);
    expect(result.fluidMl).toBeNull();
  });
  it("only counts the consumed amount after a refusal", () => {
    expect(parseObservation("refused 200 ml tea then drank 80 ml water").fluidMl).toBe(80);
    const items = splitShiftNote("Margaret refused 200 ml tea then drank 80 ml water. Arthur drank 150 ml juice and ate all his breakfast.", residents).items;
    expect(items.map(x => [x.residentId, x.category, x.fluidMl])).toEqual([["m", "Fluid", null], ["m", "Fluid", 80], ["a", "Fluid", 150], ["a", "Food", null]]);
    expect(items[0].note).toBe("Refused 200 ml tea.");
  });
  it("keeps the original example and explicit drink continuation", () => {
    expect(splitShiftNote("Margaret had a cup of tea, about 120 ml. Arthur ate all his breakfast.", residents).items.map(x => x.summary)).toEqual(["Fluid · 120 ml", "Food · Breakfast · All"]);
    expect(splitShiftNote("Margaret drank 200 ml tea then 150 ml water", residents).items.map(x => x.fluidMl)).toEqual([200, 150]);
  });
  it("does not carry a resident across a rejected ambiguous item", () => {
    const p = splitShiftNote("Margaret drank 80 ml. Margaret with Arthur drank 200 ml. Then drank 100 ml.", residents);
    expect(p.items).toHaveLength(1);
    expect(p.notSaved).toHaveLength(2);
  });
});

describe("reply versus fluid follow-up", () => {
  const ask = { residentId: "m", kind: "fluid", askedAt: "2026-11-08T11:00:00Z" } as Parameters<typeof answerFor>[0];
  it.each(["refused 200 ml tea", "offered 200 ml", "drank some water"])("accepts a care reply but keeps follow-up for %s", note => {
    const obs = record(note);
    expect(answerFor(ask, [obs] as Parameters<typeof answerFor>[1])).not.toBeNull();
    const check = fluidCheck(line, data([obs]), now);
    expect(check.state).toBe("gap");
    expect(check.label).not.toContain("Recorded 0 ml");
    expect(check.detail).toContain("not a complete total");
  });
  it("ignores another resident, an old record and an ambiguous same-category note", () => {
    expect(answerFor(ask, [record("drank 120 ml", { residentId: "a" }), record("drank 100 ml", { recordedAt: ask.askedAt }), record("200 ml tea")] as Parameters<typeof answerFor>[1])).toBeNull();
  });
  it("shows a genuine positive record without claiming the target is met", () => {
    const check = fluidCheck(line, data([record("drank 80 ml water")]), now);
    expect(check.state).toBe("recorded");
    expect(check.label).toContain("80 ml");
    expect(check.detail).toContain("does not confirm the daily target");
  });
});

describe("plan update evidence", () => {
  const accepted = { lineId: "line", status: "accepted", finalText: line.text, decidedAt: line.updatedAt };
  it("requires the current text and update time to match the accepted final wording", () => {
    const d = { ...data([]), decided: [accepted] } as Parameters<typeof lastPlanUpdate>[1];
    expect(lastPlanUpdate(line, d, now)?.state).toBe("updated");
    expect(lastPlanUpdate({ ...line, text: "A later unrelated plan edit" }, d, now)).toBeNull();
    expect(lastPlanUpdate(line, { ...d, decided: [{ ...accepted, finalText: "Different wording" }] } as typeof d, now)).toBeNull();
  });
  it("an unrelated accepted edit does not claim the eating concern is resolved", () => {
    const meals = Array.from({ length: 14 }, (_, i) => [8, 13, 18].map(hour => record("meal", { category: "Food", portion: i < 3 ? "Half" : "All", recordedAt: londonTime(now, -(i + 1), `${hour}:00`).toISOString() }))).flat();
    const d = { ...data(meals), decided: [accepted] } as Parameters<typeof appetiteCheck>[1];
    const check = appetiteCheck(line, d, now);
    expect(check?.state).toBe("updated");
    expect(check?.detail).toContain("still needs review");
    expect(check?.detail).not.toContain("now reflects it");
  });
});

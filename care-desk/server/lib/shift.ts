import { asc, desc, gte } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import { parseObservation, type ParsedObservation } from "./parse-observation.js";
import { ensureSeeded } from "./seed.js";
import { clock, daysAgo, londonParts, londonTime } from "./time.js";

// The carer's side: one note in their own words becomes one record per
// resident per item, and the plan says what is still to record this shift.
// Deliberately rule-based, like parse-observation: a carer's note is never
// stored with an invented resident, meal or amount.

type Resident = typeof schema.residents.$inferSelect;
type Observation = typeof schema.observations.$inferSelect;
type Ask = typeof schema.shiftAsks.$inferSelect;

export type ShiftItem = {
  residentId: string;
  residentName: string;
  category: ParsedObservation["category"];
  note: string;
  fluidMl: number | null;
  meal: string | null;
  portion: string | null;
  /** Short label for the preview, e.g. "Fluid · 200 ml". */
  summary: string;
  /** The words the item came from, as the carer wrote them. */
  said: string;
};

export type ShiftPreview = {
  items: ShiftItem[];
  /** Parts of the note Anji could not tie to one resident; never saved. */
  notSaved: Array<{ said: string; reason: string }>;
};

const capital = (text: string) => text.replace(/^\w/, (c) => c.toUpperCase());
const sentence = (text: string) => {
  const t = capital(text.trim());
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

function namesIn(text: string, residents: Resident[]) {
  return residents.filter((r) => new RegExp(`\\b${r.preferredName}\\b`, "i").test(text));
}

function summaryOf(p: ParsedObservation) {
  if (p.category === "Fluid") {
    if (p.fluidMl !== null) return `Fluid · ${p.fluidMl} ml`;
    if (p.fluidStatus === "not-consumed") return "Fluid · not consumed · no intake amount recorded";
    if (p.fluidStatus === "offered") return "Fluid · offered · intake not confirmed";
    return "Fluid · amount awaiting confirmation";
  }
  if (p.category === "Food") return ["Food", p.meal, p.portion].filter(Boolean).join(" · ");
  return "Note";
}

const AMOUNT_ONLY = /^(?:about|around|roughly|approx(?:imately|\.)?|nearly|almost)?\s*\d{2,4}\s*(?:ml|mls|millilit(?:re|er)s?)$/i;

/** Split a carer's note into records. Pure: reads nothing, writes nothing. */
export function splitShiftNote(text: string, residents: Resident[]): ShiftPreview {
  const items: ShiftItem[] = [];
  const notSaved: ShiftPreview["notSaved"] = [];
  let current: Resident | null = null;
  const sentences = text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((s) => s.trim().replace(/[.!?;]+$/, ""))
    .filter(Boolean);
  for (const s of sentences) {
    let previousDrink = false;
    // Clauses joined by "and", "then" or a comma; a fragment with nothing
    // recordable of its own ("with milk") stays with the one before it.
    const fragments: string[] = [];
    for (const part of s.split(/\s*,\s*|\s+(?:and then|and|then)\s+/i)) {
      const p = part.trim().replace(/^(?:and then|and|then)\s+/i, "");
      if (!p) continue;
      // "a cup of tea, about 120 ml": an amount on its own belongs to the
      // drink before it, when that drink had no amount.
      const prev = fragments[fragments.length - 1];
      if (prev && AMOUNT_ONLY.test(p) && namesIn(p, residents).length === 0) {
        const before = parseObservation(prev);
        if (before.category === "Fluid" && !before.fluidMl) {
          fragments[fragments.length - 1] += `, ${p}`;
          continue;
        }
      }
      const own =
        namesIn(p, residents).length > 0 ||
        parseObservation(p).category !== "Note" ||
        /\b(refused|declined|fell|fall|tearful|upset|shower|bath|wash|toilet|pad|walk|walked|asleep|awake|visit|pain)\b/i.test(p);
      if (!own && fragments.length) fragments[fragments.length - 1] += ` and ${p}`;
      else fragments.push(p);
    }
    for (const said of fragments) {
      const named = namesIn(said, residents);
      if (named.length > 1) {
        notSaved.push({ said, reason: "More than one resident in one item. Say one name per item." });
        current = null;
        previousDrink = false;
        continue;
      }
      if (named.length === 1) { current = named[0]; previousDrink = false; }
      if (!current) {
        notSaved.push({ said, reason: "No resident named. Start with their first name." });
        continue;
      }
      const words = said
        .replace(new RegExp(`^\\s*${current.preferredName}\\b\\s*`, "i"), "")
        .replace(new RegExp(`\\b${current.preferredName}\\b`, "gi"), current.preferredName)
        .trim();
      if (words.length < 3) {
        notSaved.push({ said, reason: "Nothing to record after the name." });
        continue;
      }
      const continuation = previousDrink && /^\s*\d+(?:\.\d+)?\s*(?:ml|litres?|l)\b/i.test(words);
      const spoken = continuation ? `drank ${words}` : words;
      const parsed = parseObservation(spoken);
      previousDrink = parsed.fluidStatus === "consumed";
      const note =
        parsed.category === "Food" && parsed.meal
          ? `${parsed.meal}: ${sentence(spoken)}`
          : sentence(spoken);
      items.push({
        residentId: current.id,
        residentName: current.preferredName,
        category: parsed.category,
        note,
        fluidMl: parsed.fluidMl,
        meal: parsed.meal,
        portion: parsed.portion,
        summary: summaryOf(parsed),
        said,
      });
    }
  }
  return { items, notSaved };
}

export async function previewShiftNote(text: string): Promise<ShiftPreview> {
  await ensureSeeded();
  const residents = await getDb().select().from(schema.residents);
  return splitShiftNote(text, residents);
}

/** The one place a record is written, for single notes and shift notes alike. */
export async function insertObservation(row: {
  residentId: string;
  category: string;
  note: string;
  fluidMl: number | null;
  meal: string | null;
  portion: string | null;
  source: string;
  recordedBy: string;
  at?: Date;
}) {
  const id = `obs-${crypto.randomUUID()}`;
  const recordedAt = (row.at ?? new Date()).toISOString();
  await getDb().insert(schema.observations).values({
    id,
    residentId: row.residentId,
    category: row.category,
    recordedAt,
    note: sentence(row.note),
    fluidMl: row.fluidMl,
    meal: row.meal,
    portion: row.portion,
    source: row.source,
    recordedBy: row.recordedBy,
  });
  return { id, recordedAt };
}

// ---------- what the plan still expects this shift ----------

const MEALS: Array<{ meal: string; dueBy: string }> = [
  { meal: "Breakfast", dueBy: "09:45" },
  { meal: "Lunch", dueBy: "14:00" },
  { meal: "Supper", dueBy: "18:45" },
];
const WAKING_START = 7;
const WAKING_END = 22;
/** Behind when today's fluid is under this share of the pro-rata target. */
const FLUID_BEHIND = 0.75;

const ASK_CATEGORY: Record<string, string> = { fluid: "Fluid", appetite: "Food", sleep: "Night" };

export type DueItem = {
  residentId: string;
  residentName: string;
  room: string;
  kind: "fluid" | "meal" | "ask";
  text: string;
  detail: string;
  /** Start of a note for the carer to finish, e.g. "Margaret drank ". */
  prompt: string;
};

export type AskState = {
  id: string;
  residentId: string;
  lineId: string;
  kind: string;
  text: string;
  askedAt: string;
  askedBy: string;
  answeredBy: { recordId: string; note: string; at: string; by: string; source: string } | null;
};

function targetMl(lineText: string): number | null {
  const litres = lineText.match(/(\d+(?:\.\d+)?)\s*litres?/i);
  if (litres) return Math.round(Number(litres[1]) * 1000);
  const ml = lineText.match(/(\d{3,4})\s*ml/i);
  return ml ? Number(ml[1]) : null;
}

/** A reply is the first relevant care observation after the ask; it does not resolve a care target. */
export function answerFor(ask: Ask, records: Observation[]): AskState["answeredBy"] {
  const category = ASK_CATEGORY[ask.kind];
  const match = records
    .filter((o) => o.residentId === ask.residentId && o.category === category && o.recordedAt > ask.askedAt)
    .filter((o) => {
      if (ask.kind === "fluid") return ["consumed", "not-consumed", "offered"].includes(parseObservation(o.note).fluidStatus ?? "");
      if (ask.kind === "appetite") return /\b(ate|eaten|had|refused|declined|offered)\b/i.test(o.note);
      if (ask.kind === "sleep") return /\b(awake|asleep|slept|woke|waking)\b/i.test(o.note);
      return false;
    })
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))[0];
  return match
    ? { recordId: match.id, note: match.note, at: match.recordedAt, by: match.recordedBy, source: match.source }
    : null;
}

export async function listAsks(since?: Date): Promise<AskState[]> {
  await ensureSeeded();
  const db = getDb();
  const from = (since ?? new Date(Date.now() - 86_400_000)).toISOString();
  const [asks, records] = await Promise.all([
    db.select().from(schema.shiftAsks).where(gte(schema.shiftAsks.askedAt, from)).orderBy(asc(schema.shiftAsks.askedAt)),
    db.select().from(schema.observations).where(gte(schema.observations.recordedAt, from)),
  ]);
  return asks.map((a) => ({ ...a, answeredBy: answerFor(a, records) }));
}

export async function shiftStillDue(now = new Date()) {
  await ensureSeeded();
  const db = getDb();
  const startOfDay = londonTime(now, 0, "00:00").toISOString();
  const [residents, lines, records, asks] = await Promise.all([
    db.select().from(schema.residents).orderBy(asc(schema.residents.fullName)),
    db.select().from(schema.carePlanLines),
    db
      .select()
      .from(schema.observations)
      .where(gte(schema.observations.recordedAt, startOfDay))
      .orderBy(desc(schema.observations.recordedAt)),
    listAsks(),
  ]);
  const { hh, mm } = londonParts(now);
  const hour = hh + mm / 60;
  const wakingShare = Math.min(1, Math.max(0, (hour - WAKING_START) / (WAKING_END - WAKING_START)));
  const nowClock = clock(now.toISOString());
  const due: DueItem[] = [];
  const fluidToday: Array<{ residentId: string; residentName: string; ml: number; unknownAmount: boolean; target: number | null }> = [];

  for (const r of residents) {
    const mine = records.filter((o) => o.residentId === r.id && daysAgo(o.recordedAt, now) === 0);
    const fluidLine = lines.find((l) => l.residentId === r.id && l.checkKind === "fluid");
    const target = fluidLine ? targetMl(fluidLine.text) : null;
    const ml = mine.filter((o) => o.category === "Fluid").reduce((s, o) => s + (o.fluidMl ?? 0), 0);
    const unknownAmount = mine.some((o) => o.category === "Fluid" && o.fluidMl === null);
    fluidToday.push({ residentId: r.id, residentName: r.preferredName, ml, unknownAmount, target });
    if (target && ml < target * wakingShare * FLUID_BEHIND) {
      due.push({
        residentId: r.id,
        residentName: r.preferredName,
        room: r.room,
        kind: "fluid",
        text: unknownAmount ? `${r.preferredName}: ${ml ? `${ml} ml confirmed; ` : ""}intake amount awaiting confirmation (daily target ${target.toLocaleString("en-GB")} ml)` : `${r.preferredName}: ${ml} of ${target.toLocaleString("en-GB")} ml so far today`,
        detail: `Care plan: ${fluidLine!.text}`,
        prompt: `${r.preferredName} drank `,
      });
    }
    for (const m of MEALS) {
      if (nowClock < m.dueBy) continue;
      const recorded = mine.some((o) => o.category === "Food" && o.meal === m.meal);
      if (!recorded) {
        due.push({
          residentId: r.id,
          residentName: r.preferredName,
          room: r.room,
          kind: "meal",
          text: `${r.preferredName}: ${m.meal.toLowerCase()} not recorded yet`,
          detail: "Care plan asks for what is eaten at every meal.",
          prompt: `${r.preferredName} ate `,
        });
      }
    }
  }
  const byName = new Map(residents.map((r) => [r.id, r]));
  const openAsks = asks.filter((a) => !a.answeredBy);
  const answeredAsks = asks.filter((a) => a.answeredBy);
  return {
    asks: openAsks.map((a) => ({
      ...a,
      residentName: byName.get(a.residentId)?.preferredName ?? a.residentId,
      prompt: `${byName.get(a.residentId)?.preferredName ?? ""} ${a.kind === "fluid" ? "drank " : a.kind === "appetite" ? "ate " : ""}`,
    })),
    answered: answeredAsks.map((a) => ({ ...a, residentName: byName.get(a.residentId)?.preferredName ?? a.residentId })),
    due,
    fluidToday,
    generatedAt: now.toISOString(),
  };
}

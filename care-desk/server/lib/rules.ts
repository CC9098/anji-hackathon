import { and, asc, desc, eq, gte } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import type { DraftEvidence, PageTarget } from "../db/schema.js";
import { ensureSeeded } from "./seed.js";
import { listAsks, type AskState } from "./shift.js";
import {
  ageOn,
  clock,
  daysAgo,
  shortDay,
  wakingHoursBetween,
  whenLabel,
} from "./time.js";

// Deterministic checks shared by the side panel, the page annotations, the
// agent and HTTP callers. Wording rules (carried over from Anji's live
// Manager Brief, declared as existing work):
// - when records are silent, say "No record found", never "not done";
// - "usual" means this resident's own recent pattern, not general norms;
// - no diagnosis, no blame.

type Resident = typeof schema.residents.$inferSelect;
type PlanLine = typeof schema.carePlanLines.$inferSelect;
type Observation = typeof schema.observations.$inferSelect;
type Draft = typeof schema.planDrafts.$inferSelect;

export type PlanCheck = {
  lineId: string;
  residentId: string;
  section: string;
  lineText: string;
  kind: "fluid" | "appetite" | "sleep";
  /** gap: no record found; recorded: closed by a record; drift: off their usual; updated: plan caught up */
  state: "gap" | "recorded" | "drift" | "updated";
  safety: boolean;
  label: string;
  detail: string;
  evidence: DraftEvidence[];
  draft: PendingDraft | null;
  /** The manager asked the shift about this line ("Ask the shift"). */
  ask?: { id: string; askedAt: string; time: string; answered: { note: string; time: string; by: string } | null } | null;
};

export type PendingDraft = {
  id: string;
  lineId: string;
  beforeText: string;
  afterText: string;
  reason: string;
  author: string;
  evidence: DraftEvidence[];
  createdAt: string;
};

export type KeyPoint = {
  kind: "safety" | "change" | "note";
  text: string;
  detail?: string;
  source: string;
  target?: PageTarget;
  /** The plan line behind the point, so one button can go straight to it. */
  lineId?: string;
  checkKind?: PlanCheck["kind"];
  state?: PlanCheck["state"];
  ask?: PlanCheck["ask"];
};

const FLUID_GAP_WAKING_HOURS = 4;
const PORTION_SCORE: Record<string, number> = {
  All: 4,
  Most: 3,
  Half: 2,
  Little: 1,
  None: 0,
};
const RECENT_DAYS = 3;
const USUAL_FROM_DAY = 14;
const USUAL_DAYS = USUAL_FROM_DAY - RECENT_DAYS;

function firstSentence(text: string): string {
  const match = text.match(/^.*?[.!?](\s|$)/);
  return (match ? match[0] : text).trim();
}

export function toPendingDraft(d: Draft): PendingDraft {
  return {
    id: d.id,
    lineId: d.lineId,
    beforeText: d.beforeText,
    afterText: d.afterText,
    reason: d.reason,
    author: d.author,
    evidence: d.evidence,
    createdAt: d.createdAt,
  };
}

type ResidentData = {
  resident: Resident;
  lines: PlanLine[];
  observations: Observation[];
  drafts: Draft[];
  decided: Draft[];
};

async function loadResidents(residentId?: string): Promise<ResidentData[]> {
  await ensureSeeded();
  const db = getDb();
  const since = new Date(Date.now() - (USUAL_FROM_DAY + 2) * 86_400_000);
  const [residents, lines, observations, drafts] = await Promise.all([
    residentId
      ? db.select().from(schema.residents).where(eq(schema.residents.id, residentId))
      : db.select().from(schema.residents).orderBy(asc(schema.residents.fullName)),
    residentId
      ? db
          .select()
          .from(schema.carePlanLines)
          .where(eq(schema.carePlanLines.residentId, residentId))
          .orderBy(asc(schema.carePlanLines.position))
      : db.select().from(schema.carePlanLines).orderBy(asc(schema.carePlanLines.position)),
    db
      .select()
      .from(schema.observations)
      .where(
        residentId
          ? and(
              eq(schema.observations.residentId, residentId),
              gte(schema.observations.recordedAt, since.toISOString()),
            )
          : gte(schema.observations.recordedAt, since.toISOString()),
      )
      .orderBy(desc(schema.observations.recordedAt))
      .limit(2000),
    db
      .select()
      .from(schema.planDrafts)
      .where(
        residentId ? eq(schema.planDrafts.residentId, residentId) : undefined,
      )
      .orderBy(desc(schema.planDrafts.createdAt))
      .limit(200),
  ]);
  return residents.map((resident) => ({
    resident,
    lines: lines.filter((l) => l.residentId === resident.id),
    observations: observations.filter((o) => o.residentId === resident.id),
    drafts: drafts.filter(
      (d) => d.residentId === resident.id && d.status === "pending",
    ),
    decided: drafts.filter(
      (d) => d.residentId === resident.id && d.status !== "pending",
    ),
  }));
}

function fluidCheck(
  line: PlanLine,
  data: ResidentData,
  now: Date,
): PlanCheck {
  const fluids = data.observations.filter((o) => o.category === "Fluid");
  const last = fluids[0];
  const base = {
    lineId: line.id,
    residentId: line.residentId,
    section: line.section,
    lineText: line.text,
    kind: "fluid" as const,
    safety: true,
    draft: null,
  };
  const todayMl = fluids
    .filter((o) => daysAgo(o.recordedAt, now) === 0)
    .reduce((sum, o) => sum + (o.fluidMl ?? 0), 0);
  const totalLine = `Recorded today so far: ${todayMl} ml.`;
  if (!last) {
    return {
      ...base,
      state: "gap",
      label: "No record found in the last 14 days",
      detail: "No fluid record found.",
      evidence: [],
    };
  }
  const evidence = [
    {
      label: `Last fluid record, ${whenLabel(last.recordedAt, now)}`,
      detail: last.note,
    },
  ];
  if (wakingHoursBetween(last.recordedAt, now) > FLUID_GAP_WAKING_HOURS) {
    const ago = daysAgo(last.recordedAt, now);
    const when =
      ago === 0
        ? `today after ${clock(last.recordedAt)}`
        : ago === 1
          ? `yesterday after ${clock(last.recordedAt)}`
          : `since ${shortDay(last.recordedAt)} ${clock(last.recordedAt)}`;
    return {
      ...base,
      state: "gap",
      label: `No record found ${when}`,
      detail: `Last record ${whenLabel(last.recordedAt, now)}: ${last.note} ${totalLine}`,
      evidence,
    };
  }
  return {
    ...base,
    state: "recorded",
    label: `Recorded ${last.fluidMl ?? 0} ml, ${clock(last.recordedAt)}`,
    detail: `${last.note} Recorded ${whenLabel(last.recordedAt, now)} via ${last.source}. ${totalLine}`,
    evidence,
  };
}

function lastPlanUpdate(line: PlanLine, data: ResidentData, now: Date) {
  const accepted = data.decided.find(
    (d) => d.lineId === line.id && d.status === "accepted",
  );
  if (accepted && daysAgo(line.updatedAt, now) <= RECENT_DAYS) {
    return {
      state: "updated" as const,
      label: `Plan updated ${whenLabel(line.updatedAt, now)}`,
    };
  }
  return null;
}

function appetiteCheck(
  line: PlanLine,
  data: ResidentData,
  now: Date,
): PlanCheck | null {
  const meals = data.observations.filter(
    (o) => o.category === "Food" && o.portion,
  );
  const score = (o: Observation) => PORTION_SCORE[o.portion ?? ""] ?? 0;
  const usual = meals.filter((o) => {
    const ago = daysAgo(o.recordedAt, now);
    return ago > RECENT_DAYS && ago <= USUAL_FROM_DAY;
  });
  const recent = meals.filter((o) => daysAgo(o.recordedAt, now) <= RECENT_DAYS);
  if (usual.length < 6 || recent.length < 4) return null;
  const mean = (rows: Observation[]) =>
    rows.reduce((sum, o) => sum + score(o), 0) / rows.length;
  const usualMean = mean(usual);
  // Consecutive days, counting back from yesterday, below their own usual.
  let days = 0;
  for (let ago = 1; ago <= RECENT_DAYS; ago += 1) {
    const day = meals.filter((o) => daysAgo(o.recordedAt, now) === ago);
    if (day.length === 0 || mean(day) > usualMean - 1) break;
    days += 1;
  }
  if (days < 2) return null;

  const name = data.resident.preferredName;
  const recentLow = recent.filter((o) => score(o) <= 2).length;
  const usualGood = usual.filter((o) => score(o) >= 3).length;
  const firstDayMeals = meals.filter((o) => daysAgo(o.recordedAt, now) === days);
  const firstLowDay = firstDayMeals[firstDayMeals.length - 1];
  const since = firstLowDay ? shortDay(firstLowDay.recordedAt) : "";
  const updated = lastPlanUpdate(line, data, now);
  const planBehind =
    !updated && daysAgo(line.updatedAt, now) > days;
  const evidence: DraftEvidence[] = [
    {
      label: `Last ${days} days (since ${since})`,
      detail: `Half or less at ${recentLow} of ${recent.length} meals recorded.`,
    },
    {
      label: `${name}'s usual (the ${USUAL_DAYS} days before)`,
      detail: `All or most at ${usualGood} of ${usual.length} meals recorded.`,
    },
    {
      label: "Care plan",
      detail: `Last updated ${shortDay(line.updatedAt)} by ${line.updatedBy}.`,
    },
  ];
  if (updated) {
    return {
      lineId: line.id,
      residentId: line.residentId,
      section: line.section,
      lineText: line.text,
      kind: "appetite",
      state: "updated",
      safety: false,
      label: updated.label,
      detail: `Eating less than usual for ${days} days; the plan now reflects it.`,
      evidence,
      draft: null,
    };
  }
  return {
    lineId: line.id,
    residentId: line.residentId,
    section: line.section,
    lineText: line.text,
    kind: "appetite",
    state: "drift",
    safety: false,
    label: planBehind
      ? `Eating less than usual for ${days} days; plan last updated ${shortDay(line.updatedAt)}`
      : `Eating less than usual for ${days} days`,
    detail: `Half or less at ${recentLow} of ${recent.length} meals since ${since}, compared with ${name}'s own previous ${USUAL_DAYS} days.`,
    evidence,
    draft: null,
  };
}

function sleepCheck(
  line: PlanLine,
  data: ResidentData,
  now: Date,
): PlanCheck | null {
  const nights = data.observations.filter((o) => o.category === "Night");
  const awake = (o: Observation) => /awake/i.test(o.note);
  const recent = nights.filter((o) => daysAgo(o.recordedAt, now) <= RECENT_DAYS);
  const usual = nights.filter((o) => {
    const ago = daysAgo(o.recordedAt, now);
    return ago > RECENT_DAYS && ago <= USUAL_FROM_DAY;
  });
  const recentAwake = recent.filter(awake).length;
  const usualAwake = usual.filter(awake).length;
  if (recentAwake < RECENT_DAYS || usual.length < 5) return null;
  if (usualAwake / usual.length > 0.3) return null;
  return {
    lineId: line.id,
    residentId: line.residentId,
    section: line.section,
    lineText: line.text,
    kind: "sleep",
    state: "drift",
    safety: false,
    label: `Awake at night ${recentAwake} nights running`,
    detail: `Usually awake on ${usualAwake} of ${usual.length} nights before that.`,
    evidence: recent.filter(awake).map((o) => ({
      label: whenLabel(o.recordedAt, now),
      detail: o.note,
    })),
    draft: null,
  };
}

function askFor(lineId: string, asks: AskState[]): PlanCheck["ask"] {
  const ask = [...asks].reverse().find((a) => a.lineId === lineId);
  if (!ask) return null;
  return {
    id: ask.id,
    askedAt: ask.askedAt,
    time: clock(ask.askedAt),
    answered: ask.answeredBy
      ? { note: ask.answeredBy.note, time: clock(ask.answeredBy.at), by: ask.answeredBy.by }
      : null,
  };
}

function checksFor(data: ResidentData, now: Date, asks: AskState[] = []): PlanCheck[] {
  const checks: PlanCheck[] = [];
  for (const line of data.lines) {
    let check: PlanCheck | null = null;
    if (line.checkKind === "fluid") check = fluidCheck(line, data, now);
    if (line.checkKind === "appetite") check = appetiteCheck(line, data, now);
    if (line.checkKind === "sleep") check = sleepCheck(line, data, now);
    if (!check) continue;
    const draft = data.drafts.find((d) => d.lineId === line.id);
    check.draft = draft ? toPendingDraft(draft) : null;
    check.ask = askFor(line.id, asks);
    checks.push(check);
  }
  return checks;
}

export async function listPlanChecks(residentId?: string) {
  const now = new Date();
  const [all, asks] = await Promise.all([loadResidents(residentId), listAsks()]);
  return all.flatMap((data) => checksFor(data, now, asks));
}

function recentEvents(data: ResidentData, now: Date): KeyPoint[] {
  return data.observations
    .filter((o) => o.category === "Fall" && daysAgo(o.recordedAt, now) <= 2)
    .map((o) => ({
      kind: "safety" as const,
      text: `Fall recorded ${whenLabel(o.recordedAt, now)}.`,
      detail: o.note,
      source: `Care Desk record, ${whenLabel(o.recordedAt, now)}, Fall`,
      target: { kind: "record" as const, recordId: o.id },
    }));
}

function checkToPoint(check: PlanCheck): KeyPoint | null {
  if (check.state === "gap") {
    return {
      kind: "safety",
      text:
        check.kind === "fluid"
          ? `${check.label.replace("No record found", "No fluid record found")}.`
          : `${check.label}.`,
      detail: check.detail,
      source: `Care plan, ${check.section}`,
      target: { kind: "plan", lineText: check.lineText },
      lineId: check.lineId,
      checkKind: check.kind,
      state: check.state,
      ask: check.ask,
    };
  }
  if (check.state === "drift") {
    return {
      kind: "change",
      text: `${check.label}.`,
      detail: check.detail,
      source: `Care Desk ${check.kind === "appetite" ? "food" : check.kind === "sleep" ? "night" : "daily"} records`,
      target: { kind: "plan", lineText: check.lineText },
      lineId: check.lineId,
      checkKind: check.kind,
      state: check.state,
    };
  }
  return null;
}

function residentSummary(r: Resident, now: Date) {
  return {
    id: r.id,
    fullName: r.fullName,
    preferredName: r.preferredName,
    age: ageOn(r.dateOfBirth, now),
    room: r.room,
  };
}

export async function residentBrief(residentId: string) {
  const now = new Date();
  const [[data], asks] = await Promise.all([loadResidents(residentId), listAsks()]);
  if (!data) return null;
  const { resident } = data;
  const about = (key: string) => resident.aboutMe.find((s) => s.key === key);
  const parts = [about("life"), about("settle")]
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .map((s) => ({
      text: firstSentence(s.text),
      source: `About me, ${s.label}`,
      fullText: s.text,
      target: { kind: "about" as const, label: s.label },
    }));
  const age = ageOn(resident.dateOfBirth, now);
  const checks = checksFor(data, now, asks);
  const standingSafety: KeyPoint[] = data.lines
    .filter((l) => l.safety)
    .map((l) => ({
      kind: "safety",
      text: firstSentence(l.text),
      detail: l.text,
      source: `Care plan, ${l.section}`,
      target: { kind: "plan", lineText: l.text },
    }));
  const checkPoints = checks
    .map(checkToPoint)
    .filter((p): p is KeyPoint => Boolean(p));
  const order = { safety: 0, change: 1, note: 2 };
  const keyPoints = [
    ...recentEvents(data, now),
    ...checkPoints.filter((p) => p.kind === "safety"),
    ...standingSafety,
    ...checkPoints.filter((p) => p.kind !== "safety"),
  ].sort((a, b) => order[a.kind] - order[b.kind]);
  // Make sure a change against their usual is not pushed out by standing facts.
  const top = keyPoints.slice(0, 3);
  const change = keyPoints.find((p) => p.kind === "change");
  if (change && !top.includes(change)) top[2] = change;
  top.sort((a, b) => order[a.kind] - order[b.kind]);

  return {
    resident: residentSummary(resident, now),
    knowThem: {
      text: `${resident.preferredName}, ${age}. ${parts.map((p) => p.text).join(" ")}`,
      parts,
    },
    keyPoints: top,
    otherPoints: keyPoints.filter((p) => !top.includes(p)),
    checks,
    drafts: data.drafts.map(toPendingDraft),
    generatedAt: now.toISOString(),
  };
}

export async function homeOverview() {
  const now = new Date();
  const [all, asks] = await Promise.all([loadResidents(), listAsks()]);
  const rows = all.map((data) => {
    const checks = checksFor(data, now, asks);
    // A question to the shift that a record has since answered, so the
    // manager sees it close without having to look for it.
    const answered: KeyPoint[] = checks
      .filter((c) => c.ask?.answered && c.state !== "gap")
      .map((c) => ({
        kind: "note" as const,
        text: `Answered by the shift at ${c.ask!.answered!.time}: ${c.ask!.answered!.note}`,
        detail: `Asked at ${c.ask!.time}. Recorded by ${c.ask!.answered!.by}.`,
        source: `Care plan, ${c.section}`,
        target: { kind: "plan" as const, lineText: c.lineText },
        lineId: c.lineId,
        checkKind: c.kind,
        state: c.state,
        ask: c.ask,
      }));
    const points = [
      ...recentEvents(data, now),
      ...checks.map(checkToPoint).filter((p): p is KeyPoint => Boolean(p)),
    ];
    const safety = points.filter((p) => p.kind === "safety");
    return {
      resident: residentSummary(data.resident, now),
      points: [...safety, ...points.filter((p) => p.kind !== "safety"), ...answered],
      safetyCount: safety.length,
      pendingDrafts: data.drafts.length,
    };
  });
  const flagged = rows
    .filter((r) => r.points.length > 0)
    .sort(
      (a, b) =>
        b.safetyCount - a.safetyCount ||
        b.points.length - a.points.length ||
        a.resident.fullName.localeCompare(b.resident.fullName),
    );
  return {
    flagged,
    nothingToFlag: rows
      .filter((r) => r.points.length === 0)
      .map((r) => r.resident),
    checkedResidents: rows.length,
    generatedAt: now.toISOString(),
  };
}

export function appetiteTemplate(name: string, days: number) {
  return `${name}'s appetite has been lower than usual for ${days} days. Offer smaller portions more often, with a fortified snack mid-morning and mid-afternoon. Record what ${name} eats at every meal, and tell the nurse in charge if ${name} eats half or less for 2 more days.`;
}

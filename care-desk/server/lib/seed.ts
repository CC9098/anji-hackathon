import { count } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import type { AboutMeSection } from "../db/schema.js";
import { londonTime } from "./time.js";

// Synthetic demo home. No name, record or detail here belongs to a real
// person. Records are generated relative to "now" so the demo tells the same
// story on any day: Margaret has eaten less than her own usual for the last
// three days and has no drink recorded since 14:00 yesterday.

type Meal = "Breakfast" | "Lunch" | "Supper";
type Portion = "All" | "Most" | "Half" | "Little" | "None";

type SeedResident = {
  id: string;
  fullName: string;
  preferredName: string;
  dateOfBirth: string;
  room: string;
  aboutMe: AboutMeSection[];
  plan: Array<{
    section: string;
    text: string;
    checkKind?: "fluid" | "appetite" | "sleep";
    safety?: boolean;
    updatedDaysAgo: number;
  }>;
};

const RESIDENTS: SeedResident[] = [
  {
    id: "res-margaret",
    fullName: "Margaret Ellis",
    preferredName: "Margaret",
    dateOfBirth: "1939-03-12",
    room: "Room 4, Rose Wing",
    aboutMe: [
      {
        key: "name",
        label: "What I like to be called",
        text: "Margaret. Please do not call me Maggie.",
      },
      {
        key: "life",
        label: "My life",
        text: "Former nurse. I worked on the wards of a district hospital for 30 years and still enjoy talking about it.",
      },
      {
        key: "settle",
        label: "What helps me settle",
        text: "Settles with tea and 1940s music. Vera Lynn in the late afternoon works best.",
      },
      {
        key: "people",
        label: "People who matter to me",
        text: "My daughter Susan visits on Sundays. Our cat Biscuit lives with Susan now.",
      },
      {
        key: "day",
        label: "My day",
        text: "I wake at about 7 and like breakfast in my room before I get dressed.",
      },
    ],
    plan: [
      {
        section: "Eating and drinking",
        text: "Offer at least 1.5 litres of fluid daily.",
        checkKind: "fluid",
        updatedDaysAgo: 73,
      },
      {
        section: "Eating and drinking",
        text: "Margaret prefers tea with milk and no sugar, in her own blue cup.",
        updatedDaysAgo: 73,
      },
      {
        section: "Eating and drinking",
        text: "Margaret eats well. Offer standard portions at breakfast, lunch and supper.",
        checkKind: "appetite",
        updatedDaysAgo: 73,
      },
      {
        section: "Moving around",
        text: "High falls risk. Walks with a frame; one carer walks beside her.",
        safety: true,
        updatedDaysAgo: 40,
      },
      {
        section: "Moving around",
        text: "Sensor mat beside the bed at night.",
        updatedDaysAgo: 40,
      },
      {
        section: "Communication",
        text: "Wears glasses. Hearing aid in her left ear; check the battery each morning.",
        updatedDaysAgo: 73,
      },
      {
        section: "Personal care",
        text: "Prefers a shower on Tuesday and Friday mornings.",
        updatedDaysAgo: 73,
      },
    ],
  },
  {
    id: "res-john",
    fullName: "John Parker",
    preferredName: "John",
    dateOfBirth: "1944-06-02",
    room: "Room 7, Oak Wing",
    aboutMe: [
      { key: "name", label: "What I like to be called", text: "John." },
      {
        key: "life",
        label: "My life",
        text: "Retired bus driver. I drove the number 12 route for 25 years.",
      },
      {
        key: "settle",
        label: "What helps me settle",
        text: "Settles with football on the radio and a biscuit.",
      },
      {
        key: "people",
        label: "People who matter to me",
        text: "My son Paul phones every Wednesday evening.",
      },
    ],
    plan: [
      {
        section: "Eating and drinking",
        text: "Encourage 1.5 litres of fluid daily; John likes orange squash.",
        checkKind: "fluid",
        updatedDaysAgo: 30,
      },
      {
        section: "Eating and drinking",
        text: "John eats well and enjoys a cooked breakfast.",
        checkKind: "appetite",
        updatedDaysAgo: 30,
      },
      {
        section: "Moving around",
        text: "Medium falls risk. Uses a walking stick indoors.",
        safety: true,
        updatedDaysAgo: 30,
      },
      {
        section: "Moving around",
        text: "After any fall, record observations every hour for 4 hours.",
        updatedDaysAgo: 30,
      },
    ],
  },
  {
    id: "res-jane",
    fullName: "Jane Whitfield",
    preferredName: "Jane",
    dateOfBirth: "1936-01-20",
    room: "Room 2, Rose Wing",
    aboutMe: [
      { key: "name", label: "What I like to be called", text: "Jane." },
      {
        key: "life",
        label: "My life",
        text: "Former primary school teacher. I taught reading to two generations of the village.",
      },
      {
        key: "settle",
        label: "What helps me settle",
        text: "Settles with a crossword and the window open a little.",
      },
    ],
    plan: [
      {
        section: "Eating and drinking",
        text: "Offer 1.5 litres of fluid daily; Jane prefers water with lemon.",
        checkKind: "fluid",
        updatedDaysAgo: 20,
      },
      {
        section: "Eating and drinking",
        text: "Jane eats well. Small portions, with pudding.",
        checkKind: "appetite",
        updatedDaysAgo: 20,
      },
      {
        section: "Moving around",
        text: "Low falls risk. Walks independently.",
        updatedDaysAgo: 20,
      },
    ],
  },
  {
    id: "res-arthur",
    fullName: "Arthur Bennett",
    preferredName: "Arthur",
    dateOfBirth: "1947-09-08",
    room: "Room 9, Oak Wing",
    aboutMe: [
      { key: "name", label: "What I like to be called", text: "Arthur." },
      {
        key: "life",
        label: "My life",
        text: "Retired carpenter. I built the pews for our local chapel.",
      },
      {
        key: "settle",
        label: "What helps me settle",
        text: "Settles with a warm drink and talk about woodwork.",
      },
    ],
    plan: [
      {
        section: "Eating and drinking",
        text: "Offer 1.5 litres of fluid daily; Arthur likes coffee in the morning.",
        checkKind: "fluid",
        updatedDaysAgo: 25,
      },
      {
        section: "Eating and drinking",
        text: "Arthur eats well. Standard portions.",
        checkKind: "appetite",
        updatedDaysAgo: 25,
      },
      {
        section: "Sleep",
        text: "Usually sleeps through the night. Check every 2 hours.",
        checkKind: "sleep",
        updatedDaysAgo: 25,
      },
    ],
  },
];

const MEAL_TIMES: Record<Meal, string> = {
  Breakfast: "08:15",
  Lunch: "12:30",
  Supper: "17:15",
};

const DRINK_TIMES = ["07:30", "10:00", "12:30", "15:00", "17:30", "19:30"];

const MARGARET_RECENT: Record<number, Portion[]> = {
  3: ["Half", "Half", "Little"],
  2: ["Little", "Half", "Half"],
  1: ["Half", "Little", "None"],
  0: ["Half", "Little", "Half"],
};

function usualPortion(seed: number): Portion {
  return seed % 7 === 3 ? "Most" : "All";
}

const PORTION_NOTE: Record<Portion, string> = {
  All: "Ate all of it.",
  Most: "Ate most of it.",
  Half: "Ate about half.",
  Little: "Ate a little.",
  None: "Did not eat.",
};

type ObsRow = typeof schema.observations.$inferInsert;

// Synthetic day-shift team; seed records rotate between them.
const CARERS = ["Grace Okafor", "Tom Walsh", "Priya Sharma", "Daniel Hughes"];

function buildObservations(now: Date): ObsRow[] {
  const rows: ObsRow[] = [];
  let n = 0;
  const add = (row: Omit<ObsRow, "id" | "source" | "recordedBy"> & {
    recordedBy?: string;
  }) => {
    if (new Date(row.recordedAt).getTime() > now.getTime() - 5 * 60_000) return;
    n += 1;
    rows.push({
      id: `obs-seed-${String(n).padStart(4, "0")}`,
      source: "Care Desk",
      recordedBy: row.recordedBy ?? CARERS[n % CARERS.length],
      ...row,
    });
  };

  for (const resident of RESIDENTS) {
    for (let day = 14; day >= 0; day -= 1) {
      // Meals.
      (Object.keys(MEAL_TIMES) as Meal[]).forEach((meal, i) => {
        // Jane's lunch today has not been recorded yet: one for the shift.
        if (resident.id === "res-jane" && day === 0 && meal === "Lunch") return;
        let portion: Portion = usualPortion(day * 3 + i + resident.id.length);
        let note = PORTION_NOTE[portion];
        if (resident.id === "res-margaret" && MARGARET_RECENT[day]) {
          portion = MARGARET_RECENT[day][i];
          note =
            portion === "Little"
              ? "Ate a little. Said she was not hungry."
              : portion === "None"
                ? "Refused. Said she was not hungry."
                : PORTION_NOTE[portion];
        }
        add({
          residentId: resident.id,
          category: "Food",
          recordedAt: londonTime(now, -day, MEAL_TIMES[meal]).toISOString(),
          note: `${meal}: ${note}`,
          meal,
          portion,
        });
      });

      // Drinks. Margaret's last recorded drink is yesterday at 14:00.
      const times =
        resident.id === "res-margaret"
          ? day === 0
            ? []
            : day === 1
              ? ["07:30", "10:00", "12:30", "14:00"]
              : DRINK_TIMES
          : DRINK_TIMES;
      times.forEach((time, i) => {
        const tea = resident.id === "res-margaret" && i % 2 === 0;
        const ml = i % 3 === 1 ? 150 : 200;
        add({
          residentId: resident.id,
          category: "Fluid",
          recordedAt: londonTime(now, -day, time).toISOString(),
          note: tea ? `Drank ${ml} ml of tea.` : `Drank ${ml} ml.`,
          fluidMl: ml,
        });
      });

      // Night checks. Arthur has been awake for the last three nights.
      if (resident.id === "res-arthur" && day >= 1) {
        const awake = day <= 3 || day === 9 || day === 13;
        add({
          residentId: resident.id,
          category: "Night",
          recordedAt: londonTime(now, -day, "23:30").toISOString(),
          note: awake
            ? "Awake at night. Walked to the door twice; settled with a warm drink."
            : "Asleep at each 2-hourly check.",
        });
      }
    }

    // A short daily mood note keeps the record realistic.
    for (let day = 3; day >= 0; day -= 1) {
      add({
        residentId: resident.id,
        category: "Wellbeing",
        recordedAt: londonTime(now, -day, "11:00").toISOString(),
        note:
          resident.id === "res-margaret"
            ? "Chatty in the lounge. Talked about her nursing days."
            : "Settled and content this morning.",
      });
    }
  }

  // John had a fall yesterday evening; hourly observations followed.
  add({
    residentId: "res-john",
    category: "Fall",
    recordedAt: londonTime(now, -1, "21:10").toISOString(),
    note: "Found sitting on the bedroom floor. Said he slipped reaching for his slippers. No injury seen. Hourly observations started.",
  });
  ["22:10", "23:10"].forEach((time) =>
    add({
      residentId: "res-john",
      category: "Observation",
      recordedAt: londonTime(now, -1, time).toISOString(),
      note: "Post-fall check: alert, no pain reported.",
    }),
  );
  ["00:10", "01:10"].forEach((time) =>
    add({
      residentId: "res-john",
      category: "Observation",
      recordedAt: londonTime(now, 0, time).toISOString(),
      note: "Post-fall check: asleep, breathing normally.",
    }),
  );

  return rows;
}

export async function resetDemo(now = new Date()) {
  const db = getDb();
  await db.delete(schema.pageFocus);
  await db.delete(schema.shiftAsks);
  await db.delete(schema.planDrafts);
  await db.delete(schema.observations);
  await db.delete(schema.carePlanLines);
  await db.delete(schema.residents);

  const created = new Date(now.getTime() - 400 * 86_400_000).toISOString();
  await db.insert(schema.residents).values(
    RESIDENTS.map((r) => ({
      id: r.id,
      fullName: r.fullName,
      preferredName: r.preferredName,
      dateOfBirth: r.dateOfBirth,
      room: r.room,
      aboutMe: r.aboutMe,
      createdAt: created,
    })),
  );
  await db.insert(schema.carePlanLines).values(
    RESIDENTS.flatMap((r) =>
      r.plan.map((line, i) => ({
        id: `${r.id}-plan-${i + 1}`,
        residentId: r.id,
        section: line.section,
        position: i + 1,
        text: line.text,
        checkKind: line.checkKind ?? null,
        safety: line.safety ? 1 : 0,
        updatedAt: londonTime(now, -line.updatedDaysAgo, "10:00").toISOString(),
        updatedBy: "Ruth Adams",
        reviewDue: londonTime(now, 14, "10:00").toISOString(),
      })),
    ),
  );
  const observations = buildObservations(now);
  for (let i = 0; i < observations.length; i += 200) {
    await db.insert(schema.observations).values(observations.slice(i, i + 200));
  }
  return {
    residents: RESIDENTS.length,
    planLines: RESIDENTS.reduce((sum, r) => sum + r.plan.length, 0),
    observations: observations.length,
  };
}

let seeded: Promise<unknown> | null = null;

/** Seed the demo home on first use of an empty database. */
export function ensureSeeded() {
  seeded ??= (async () => {
    const [{ value }] = await getDb()
      .select({ value: count() })
      .from(schema.residents);
    if (value === 0) await resetDemo();
  })().catch((error) => {
    seeded = null;
    throw error;
  });
  return seeded;
}

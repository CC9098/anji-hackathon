// The demo home is in the UK, so every "today", "yesterday" and clock time
// is London time, whatever the server's own time zone is.
export const HOME_TIME_ZONE = "Europe/London";

type Parts = { y: number; m: number; d: number; hh: number; mm: number };

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: HOME_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function londonParts(date: Date): Parts {
  const out: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return { y: out.year, m: out.month, d: out.day, hh: out.hour, mm: out.minute };
}

/** A London wall-clock time, `dayOffset` calendar days from `now`, as a Date. */
export function londonTime(
  now: Date,
  dayOffset: number,
  hhmm: string,
): Date {
  const today = londonParts(now);
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = Date.UTC(today.y, today.m - 1, today.d + dayOffset, hh, mm);
  const seen = londonParts(new Date(guess));
  const seenAsUtc = Date.UTC(seen.y, seen.m - 1, seen.d, seen.hh, seen.mm);
  return new Date(guess - (seenAsUtc - guess));
}

/** Calendar days between `iso` and `now` in London (0 = today, 1 = yesterday). */
export function daysAgo(iso: string, now: Date): number {
  const a = londonParts(new Date(iso));
  const b = londonParts(now);
  const dayA = Date.UTC(a.y, a.m - 1, a.d);
  const dayB = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((dayB - dayA) / 86_400_000);
}

export function clock(iso: string): string {
  const p = londonParts(new Date(iso));
  return `${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}`;
}

const dayFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: HOME_TIME_ZONE,
  day: "numeric",
  month: "short",
});

export function shortDay(iso: string): string {
  return dayFormatter.format(new Date(iso));
}

/** "today 14:32", "yesterday 14:00" or "21 Oct 14:00". */
export function whenLabel(iso: string, now: Date): string {
  const ago = daysAgo(iso, now);
  const day = ago === 0 ? "today" : ago === 1 ? "yesterday" : shortDay(iso);
  return `${day} ${clock(iso)}`;
}

/**
 * Waking hours (07:00–22:00 London) between two instants. Night hours are
 * left out so a quiet night is not counted as a missing drink.
 */
export function wakingHoursBetween(fromIso: string, to: Date): number {
  const step = 15 * 60_000;
  let minutes = 0;
  for (let t = new Date(fromIso).getTime(); t < to.getTime(); t += step) {
    const { hh } = londonParts(new Date(t));
    if (hh >= 7 && hh < 22) minutes += 15;
  }
  return minutes / 60;
}

export function ageOn(dateOfBirth: string, now: Date): number {
  const [y, m, d] = dateOfBirth.split("-").map(Number);
  const today = londonParts(now);
  let age = today.y - y;
  if (today.m < m || (today.m === m && today.d < d)) age -= 1;
  return age;
}

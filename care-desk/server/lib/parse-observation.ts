// Turns a short spoken or typed note into a Care Desk record. Deliberately
// rule-based: a voice note must never be stored with an invented amount.

export type ParsedObservation = {
  category: "Fluid" | "Food" | "Note";
  fluidMl: number | null;
  portion: string | null;
  meal: string | null;
};

const PORTIONS: Array<[RegExp, string]> = [
  [/\b(all|everything|full)\b/i, "All"],
  [/\bmost\b/i, "Most"],
  [/\bhalf\b/i, "Half"],
  [/\b(a little|little|a few)\b/i, "Little"],
  [/\b(nothing|none|refused)\b/i, "None"],
];

export function parseObservation(text: string): ParsedObservation {
  const ml = text.match(/(\d{2,4})\s*(ml|millilit(re|er)s?)\b/i);
  const litres = text.match(/(\d+(?:\.\d+)?)\s*(l|litres?|liters?)\b/i);
  const amount = ml
    ? Number(ml[1])
    : litres
      ? Math.round(Number(litres[1]) * 1000)
      : null;
  if (amount !== null || /\b(drank|drink|sipped|cup of|tea|water|squash|juice)\b/i.test(text)) {
    return { category: "Fluid", fluidMl: amount, portion: null, meal: null };
  }
  if (/\b(ate|eaten|breakfast|lunch|supper|dinner|meal|snack)\b/i.test(text)) {
    const meal = text.match(/\b(breakfast|lunch|supper|dinner|snack)\b/i)?.[1] ?? null;
    const portion = PORTIONS.find(([re]) => re.test(text))?.[1] ?? null;
    return {
      category: "Food",
      fluidMl: null,
      portion,
      meal: meal ? meal[0].toUpperCase() + meal.slice(1).toLowerCase() : null,
    };
  }
  return { category: "Note", fluidMl: null, portion: null, meal: null };
}

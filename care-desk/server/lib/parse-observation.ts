// Turns a short spoken or typed note into a Care Desk record. Deliberately
// rule-based: a voice note must never be stored with an invented amount.

export type ParsedObservation = {
  category: "Fluid" | "Food" | "Note";
  fluidMl: number | null;
  fluidStatus?: "consumed" | "not-consumed" | "offered" | "unclear";
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
  if (/\b(ml|millilitres?|milliliters?|litres?|liters?|drank|drink|drinking|sipped|cup of|tea|water|squash|juice)\b/i.test(text)) {
    const clauses = text.split(/\s+(?:and then|then|but|and)\s+|[;.!?](?:\s+|$)/i).filter(Boolean);
    let previousConsumed = false;
    let consumed = false;
    let unknown = false;
    let total = 0;
    let status: NonNullable<ParsedObservation["fluidStatus"]> = "unclear";
    for (const clause of clauses) {
      // An amount describes intake only when the words say it was consumed.
      // A bare amount may continue an explicit drink, never an offer/refusal.
      const negative = /\b(no|not|never|didn't|didn’t|hasn't|hasn’t|refused|declined|spilled|spilt)\b/i.test(clause);
      const offered = /\b(offered|provided|served|prepared|poured|left)\b/i.test(clause);
      const uncertain = /\b(may|might|maybe|perhaps|possibly|unsure|uncertain|could|would|will|should|to drink)\b/i.test(clause);
      const affirmative = /\b(drank|sipped|consumed|finished|had|took)\b/i.test(clause);
      const continuation: boolean = previousConsumed && /^\s*(?:about\s+)?\d/i.test(clause);
      const amounts = [...clause.matchAll(/(\d+(?:\.\d+)?)\s*(ml|millilit(?:re|er)s?|l|litres?|liters?)\b/gi)];
      const actual: boolean = !negative && !offered && !uncertain && (affirmative || continuation);
      previousConsumed = actual;
      if (actual) {
        consumed = true;
        // Multiple quantities in one clause have ambiguous scope (offered vs drunk,
        // or a correction). Keep the original wording for the carer to clarify.
        if (amounts.length !== 1) unknown = true;
        else total += Number(amounts[0][1]) * (/^m/i.test(amounts[0][2]) ? 1 : 1000);
      } else if (negative) status = "not-consumed";
      else if (offered) status = "offered";
      else unknown = true;
    }
    return { category: "Fluid", fluidMl: consumed && !unknown ? Math.round(total) : null,
      fluidStatus: consumed ? "consumed" : status, portion: null, meal: null };
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

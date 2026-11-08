// Stand-in for the Cardputer: sends one spoken note, as text, to the same
// log-observation action the handheld would call over HTTP. It is labelled
// "Cardputer" in the record only when --as-cardputer is passed, so a video
// never shows a device that was not used.
//
//   pnpm voice-note "Margaret drank 120 ml of tea"
//   pnpm voice-note --as-cardputer "Margaret drank 120 ml of tea"
const args = process.argv.slice(2);
const asCardputer = args[0] === "--as-cardputer";
const text = (asCardputer ? args.slice(1) : args).join(" ").trim();
if (!text) {
  console.error('Usage: pnpm voice-note [--as-cardputer] "Margaret drank 120 ml of tea"');
  process.exit(2);
}
const app = process.env.APP_URL || "http://localhost:5490"; // guard:allow-env-credential — app URL, not a credential
const res = await fetch(`${app}/_agent-native/actions/log-observation`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ text, source: asCardputer ? "Cardputer" : "HTTP" }),
});
const body = await res.json();
if (!res.ok) {
  console.error(`Not recorded (${res.status}): ${body.error}`);
  process.exit(1);
}
console.log(body.message);
for (const check of body.checks) console.log(`  ${check.state.padEnd(8)} ${check.label}`);

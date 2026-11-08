# Reliability checks — 8 November 2026

## Source and scope

This change belongs to `CC9098/anji-hackathon`, based on main `9a7f47b`.
The repository is the source for these demo changes. No export/sync script is
present in this repository or was found in the related local export location.
A future export from the private platform must preserve or explicitly port these
fixes; do not overwrite this repository from the older frozen demo copy.
No production platform, care-system connector or film asset was changed.
This standalone repo has no W1–W7 checkpoint tooling or Graphify graph.

## Before and after

| Input / action | Before | Now |
| --- | --- | --- |
| `Margaret did not drink 200 ml.` | Could count 200 ml | Preserves the negation; no intake amount confirmed |
| `Margaret refused the 200 ml tea.` | Could count 200 ml and prepend “drank” | Keeps the refusal; no invented verb or amount |
| `Margaret offered 200 ml.` | Could count 200 ml | Offer recorded; intake not confirmed |
| `Margaret refused 200 ml tea then drank 80 ml water. Arthur ate all his breakfast.` | Could count the offered/refused quantity | Three preview items; Margaret's only confirmed intake is 80 ml, Arthur's breakfast is separate |
| A new refusal after “Ask the shift” | Same-category record could turn fluid line green | Relevant reply received, but intake follow-up stays amber; unknown quantity is not labelled confirmed 0 ml |
| Accept an unrelated edit to the eating plan | “The plan now reflects it” | Saved wording and update time are checked; “Plan updated” is amber and eating pattern still needs review |

The original `Margaret had a cup of tea, about 120 ml. Arthur ate all his breakfast.`
still produces Margaret's 120 ml fluid item and Arthur's full breakfast.

## Film reproduction (no model key)

1. Reset demo data. Open Margaret, open Anji, and press **Ask the shift** on her fluid line.
2. Open **Logs** (the shift page). Enter `Margaret refused the 200 ml tea.`
   Press **Check before saving**: no 200 ml intake is claimed. Save it.
3. Return to Margaret: the line stays amber, with a new fluid record and follow-up needed.
   The panel shows the reply separately from the intake check.
4. In Logs enter `Margaret refused 200 ml tea then drank 80 ml water. Arthur ate all his breakfast.`
   Preview the three separate items, save, then return to Margaret. Only 80 ml becomes
   a green recorded intake. The wording does not claim the daily target was met.
5. On Margaret's eating line choose **Suggest an update**, then **Edit**. Enter
   `Margaret likes the curtains open in the morning.` and accept it. Care Desk displays
   exactly that wording and the panel confirms read-back. The amber plan-update state
   still says the eating pattern needs review. Reset the demo after this deliberate
   unrelated-edit example.

## Verification

- 19/19 regression tests: `pnpm test`.
- `pnpm typecheck` passed.
- `pnpm agent-native:doctor` clean. The two later demo tables now use the same
  agent SQL denylist as the original four tables; actions remain the shared entry point.
- 42/42 browser checks: `pnpm demo-check`, real Chrome for Testing with the unpacked
  extension, normal Care Desk navigation, previews, saves, dismiss/edit/accept and
  page read-back. Machine-readable results: [checks/reliability-20261108.json](checks/reliability-20261108.json).
- No separately billed model calls. The optional `WITH_AGENT=1` checks were not run.
- Tracked publishable files and existing Git history passed secret scanning.

During verification a copied dependency installation retained absolute paths in
its generated launchers and Vite cache, breaking the chat composer. Correcting the
local installation and clearing that cache restored the composer without product
code changes. Browser checks also wait for the updated plan check, not merely the
save receipt, because those UI updates arrive separately.

## Limits

Parsing remains conservative English rules, not general language understanding.
Bare `200 ml water`, possible/future intake and uncertain scope stay unquantified;
the carer can change the note before saving or save the original words without an
invented amount. An explicit continuation of `drank` can retain its meaning across
items. Ambiguous items naming multiple residents are not saved.
A relevant reply establishes that a care observation was supplied, not that a
fluid target or clinical issue is resolved. Green means a recent positive intake
record; daily totals and the shift's pro-rata target remain separate.
A plan update proves the accepted final text matches the current saved line and
time. No semantic claim is made that arbitrary edited wording resolves appetite
drift. Old incorrectly quantified records are not retrospectively rewritten.

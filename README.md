# Anji for Care Desk

Anji is a Chrome side panel that sits beside a care-record system and does the
cross-checking a care home manager has no time for. It is built on
[Agent-Native](https://agent-native.com) for the Builder.io Agent-Native
Hackathon (2026).

**Every resident, staff member, record and the home itself are synthetic.**
Care Desk is a fictional care-record system made for this demo; nothing here
connects to a real care system.

- `care-desk/` — the Agent-Native app: Anji's brain (actions, rules, agent) and
  Care Desk, the fictional care system it serves at `/desk` (Hollybrook House,
  four synthetic residents).
- `extension/` — the Anji Chrome extension (Manifest V3 side panel and content
  script), version 0.2.0.

## What it does

- **Know the person first.** The panel follows the page and opens with one line
  quoted from the resident's own About me, with its source, then three things
  to know today, safety first.
- **Marks the plan, not the person.** Care-plan lines that the records do not
  back up are underlined on the care system's own page ("No record found
  yesterday after 14:00"). Anji says what the records show, never "not done".
- **Live from the floor.** When a carer records a drink over HTTP, the
  manager's underline turns green within a second, without a refresh.
- **Suggests, never decides.** When a resident drifts from their own usual and
  the plan has not caught up, Anji proposes new wording as tracked changes. A
  person accepts, edits or dismisses it.
- **Carer view.** On the shift page a carer writes one note in their own words;
  Anji splits it into one record per resident per item, shows it before saving,
  and lists what the care plans still expect this shift.
- **Whole home at a glance.** On the resident list, only residents with
  something to look at, safety first, each with a one-button "Fix the plan" or
  "Ask the shift".

## How Agent-Native is used: one set of actions, every surface

Every capability is one `defineAction` in `care-desk/actions/`. The side-panel
buttons (manager), the shift page (carer), the agent in the side panel
("Ask Anji") and plain HTTP callers all run the same actions, so the agent, the
panel and the page annotations always agree.

| Action | What it does |
|---|---|
| `get-resident-brief` | "Know them" line from About me, up to three key points, plan checks |
| `get-care-record` | One resident's record as Care Desk shows it |
| `list-residents` | Residents in the demo home |
| `list-observations` | A resident's daily records, newest first, for evidence |
| `list-plan-gaps` | Each checked plan line: gap (no record found), recorded, or drift |
| `home-overview` | Whole home: only residents with something to look at, safety first |
| `log-observation` | Record what a carer observed ("Margaret drank 120 ml of tea") |
| `preview-shift-note` | Split a carer's note into records, shown before saving |
| `file-shift-note` | Save that note, split again with the same rules |
| `shift-still-due` | What the care plans still expect this shift |
| `ask-the-shift` | Send a gap to the carers' view; closes itself when a matching record arrives |
| `draft-plan-update` | Save a suggested plan change (tracked changes); the agent may pass its own wording |
| `accept-plan-update` | **People only.** Write the suggestion back to Care Desk and read it back |
| `dismiss-plan-update` | Leave the plan unchanged |
| `show-on-page` | Point at a plan line or record; the page scrolls to it and highlights it |
| `get-page-focus` | What Anji last pointed at (read by the side panel) |
| `reset-demo` | **People only.** Rebuild the synthetic home relative to now |

The deterministic checks (fluid gaps, change against a resident's own usual)
live in `care-desk/server/lib/rules.ts` and are reached only through these
actions. The agent sees which resident is on screen through navigation state,
cites records, and drafts plan changes by calling `draft-plan-update`; the
suggestion reaches the page through the framework's live change stream.

### Only a person can accept

`care-desk/actions/accept-plan-update.ts` sets `agentTool: false`, so the agent
cannot call it: Anji can suggest a care-plan change, but only a person can make
it. `reset-demo.ts` is closed to the agent the same way. The agent's SQL tools
are also denied on the Care Desk tables (`care-desk/agent-native.json`); all
reads and writes go through typed actions.

## 1. Run the app

Needs Node.js 22.22 or newer and pnpm 10.

```bash
cd care-desk
pnpm install
cp .env.example .env
pnpm dev
```

The app listens on http://localhost:5490 only (the extension expects this
port) and opens Care Desk at http://localhost:5490/desk. On first use it builds
the demo home relative to the current time. "Reset demo data to now" at the
bottom of any Care Desk page rebuilds it. If the very first page load shows
an error while the database is still being created, refresh once.

**"Ask Anji" (the agent) needs your own model provider key**: `OPENAI_API_KEY`,
`ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY` in your shell or `.env`, or a key
saved in the app at http://localhost:5490/settings/agent. Everything else
(Care Desk, the side panel, annotations, live updates, tracked changes, the
carer view) works without a key.

## 2. Install the extension (Load unpacked)

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `extension` folder of this repository.
4. Pin "Anji for managers" if you like.
5. Open http://localhost:5490/desk and click the green **Anji** button at the
   bottom right of the page, or the Anji toolbar icon. The side panel opens
   and follows the page.

## 3. Try it

1. Open **Margaret Ellis**. The side panel switches to her: a line quoted from
   her About me, then three points with safety first.
2. Her fluid line carries a yellow underline: "No record found yesterday after
   14:00".
3. Record a drink as a carer's handheld would, over HTTP:

   ```bash
   pnpm voice-note "Margaret drank 120 ml of tea"
   ```

   The line turns green within a second, without refreshing the page.
4. On her eating line, press **Suggest an update** (or ask Anji "Draft a care
   plan update for Margaret's eating"). The suggestion appears on the plan as
   tracked changes. **Accept**, **Edit** or **Dismiss** it; Accept writes it
   back to Care Desk and Anji reads it back from the page.
5. Open the **Shift** page for the carer view, or the resident list for the
   whole home.

The chat and the page are linked: a source chip in the briefing scrolls the
page to that line; selecting text on the page and pressing "Ask Anji about
this" sends it to the chat; the agent can point at the line it is talking about
(`show-on-page`).

## 4. Automated check

With the app running:

```bash
cd care-desk
pnpm demo-check
```

It launches Chrome for Testing with the unpacked extension in a throwaway
profile, runs every moment end to end, and writes screenshots to
`care-desk/docs/screenshots/`. Set `CHROME_PATH` if Chrome for Testing is not
in the Playwright cache, and `WITH_AGENT=1` to include the agent-drafting check
(needs a model key).

## Existing work and work done for the hackathon

The event period began on 27 October 2026.

**Existing work, not part of this repository:** the author's private Anji care
platform and its care-system connectors, and a production version of the
extension that grew from this one. The rule wording used here ("a resident
drifting from their own usual while the plan has not caught up", "No record
found, never not done", "usual means their own previous weeks", no diagnosis,
no blame) was first written for that platform and is re-implemented here from
scratch on synthetic data. Third-party: the Agent-Native Chat template and
packages, Drizzle, PGlite, `playwright-core` (test runner only).

**Built 23–24 October 2026, before the event period (declared as pre-existing):**

- `care-desk/`: everything beyond the Chat template scaffold — the synthetic
  home and seed, the SQL schema and migration, the rules (fluid gap, appetite
  and night-waking drift), the first eleven actions, the Care Desk pages, the
  embedded "Ask Anji" chat route and agent instructions, the `demo-check` and
  `voice-note` scripts.
- `extension/`: the side panel, page adapter interface and Care Desk adapter,
  content-script annotations and tracked changes, backend interface and
  Agent-Native backend, live sync.

**New during the event period (from 27 October 2026)**, from two user stories
(`care-desk/docs/user-stories.md`):

- Carer, "Tell Anji once": the Care Desk shift page and carer view in the side
  panel; one note split (rule-based, never an invented amount) into records,
  previewed before saving; "Still to record this shift" from the care plans.
- Manager, one button from the whole-home list: **Fix the plan** and **Ask the
  shift** (closes itself when a matching record arrives).
- Actions `preview-shift-note`, `file-shift-note`, `shift-still-due`,
  `ask-the-shift`; migration 3.
- Chat and page linking (`show-on-page`, `get-page-focus`), the rename to Anji,
  the Care Desk redesign, and the demo film.

## Licence

MIT, see [LICENSE](LICENSE).

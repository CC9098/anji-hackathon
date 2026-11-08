# Anji — user stories for the hackathon build

All people, homes and records here are synthetic. The stories come from how
care home staff actually work; the fixes are what Anji does about them.

## 1. The carer: "Say it once"

**Who.** Priya, senior carer on Rose Wing, 12-hour day shift, 6–8 residents.

**Pain.**
- Care happens all shift; recording happens in bursts at the nurses' station,
  one resident and one form at a time. Ten minutes of typing per round.
- She cannot see what the plan still expects today. Fluid totals and missed
  meals are found by the manager the next morning as "no record found", and
  then she is chased.
- Asked to "record more", she records the same thing twice or in the wrong box.

**Story.** *As a carer, I want to tell Anji once, in my own words, what
happened on my round, so that every resident's record is filed in the right
place and I can see what the plan still needs before my shift ends.*

**What Anji does.**
1. On the shift page, Priya types (or dictates) one note:
   "Margaret drank 200 ml of tea and ate half her lunch. Jane had all her
   lunch and 150 ml of water."
2. Anji splits it into one record per resident per item and shows them first:
   *Margaret · Fluid 200 ml*, *Margaret · Food · Lunch · Half*,
   *Jane · Food · Lunch · All*, *Jane · Fluid 150 ml*. Nothing is invented: an
   amount is only filled in when she said it.
3. One button: **Save 4 records to Care Desk**. The records appear on the
   care system's own page, marked "via Anji".
4. Below, **Still to record this shift**, taken from each care plan: Margaret
   200 of 1,500 ml today; Jane's supper not recorded yet. A tap on an item
   starts the next note with the resident's name.
5. Requests from the manager sit at the top and close themselves as soon as a
   record answers them. Nobody ticks anything off.

**Done when** one note becomes several correct records in the care system and
the still-to-record list shrinks without a refresh.

## 2. The manager: "One button, straight to the fix"

**Who.** Sam, registered manager, 40 residents, a care system with a page per
resident and a tab per kind of information.

**Pain.**
- The morning list says "Margaret eating less". Fixing it takes 6–8 clicks:
  open the resident, find the care plan tab, scroll to Eating, open the daily
  records in another tab, count meals, write new wording, save. So it waits,
  and the plan stays wrong.
- A missing drink record is not a plan problem; it is a question for whoever
  is on shift. Today that is a phone call or a walk down the corridor, and
  nobody knows when it was answered.

**Story.** *As a manager, I want each item on Anji's whole-home list to have
one button that takes me to the exact line that needs fixing, with the fix
already drafted, so that keeping plans right takes seconds, not a morning.*

**What Anji does.**
1. On the resident list, each flagged item has one button:
   - a change against the resident's own usual → **Fix the plan**: the page
     jumps to the resident, scrolls to the plan line, highlights it, and the
     suggested wording is already on the page as tracked changes. Accept,
     Edit or Dismiss. Accept writes it back and Anji reads it back.
   - a missing record → **Ask the shift**: one tap sends the question to the
     carers' shift page. The manager's flag shows "Asked the shift, 10:42" and
     turns green by itself when the record arrives.
2. The AI only suggests; only a person accepts a plan change.

**Done when** a flagged line goes from "seen" to "fixed and read back" in one
button and one Accept, and a question to the shift closes itself on evidence.

## How the two stories meet

The manager's **Ask the shift** is the carer's top item; the carer's one note
answers it; the manager's flag turns green. One set of Agent-Native actions
serves the panel, the agent and any device on the floor, so the panel, the
chat and the page always agree.

## New since 27 Oct 2026 (the event period)

- Shift page in Care Desk and carer mode in the side panel.
- `preview-shift-note`, `file-shift-note`, `shift-still-due`, `ask-the-shift`
  actions; requests that close on evidence.
- One-button jump-and-fix from the whole-home list.
- Rename to Anji; frozen demo extension; demo video.
- A carer's handheld is stood in for by `pnpm voice-note` over HTTP; no device
  calls Care Desk in this build.

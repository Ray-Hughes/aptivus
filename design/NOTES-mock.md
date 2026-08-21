# Mock Interview — design notes

Companion to `NOTES.md`. That file closes with "**Mock Interview is a nav item, not a
screen.** It links to the solve view… that is the obvious next deliverable." This is
that deliverable: `design/mock-interview.html`, one standalone page carrying all three
states of a timed round.

| State | What it is |
|---|---|
| **1 · Pre-round** | Pick a target company or a pack, pick the shape, read the contract, start. |
| **2 · In-round** | Two problems, **one clock**, no hints, no solutions, free movement between them. |
| **3 · Scorecard** | Where the time went, what each problem was testing, what an interviewer would have written, what to do next. |

The three are switchable from a dashed **Prototype** strip under the top bar, and a
second segmented control on the scorecard swaps between the four honest outcomes
(solved both · one of two · ran out of time · gave up on one). The strip is styled to
look like a reviewer's tool and not product chrome — dashed rule, micro-label, muted —
because it is not part of the product. **The real controls also work**: *Start the round*
genuinely begins state 2 with a live clock, and *End round* genuinely scores what you
actually did. A round you play yourself is tagged **your round** on the scorecard; the
canned ones are tagged **sample round**.

Everything comes from the repo. The six problems in the pool are real entries from
`packages/problems/packs/federato` — real prompts, real schemas, real test cases, real
`minutes` budgets. The six target companies are real rows from
`packs/companies/companies.json`, including the SQL weight, the difficulty skew and one
quirk each. The coaching language is lifted from `docs/interview-day.md` and
`docs/study-plan.md` rather than invented.

---

## 1. The clock

This is the decision the screen lives or dies on, so it gets the most space here.

### What it does

**A full-width 8px bar sits directly under the round bar, and the elapsed portion is
coloured by which problem you were on.** Cyan for problem 1, violet for problem 2. The
remaining portion is the recessed track. Digits sit in the top-right corner at
`--t-sm` in `--text-3` — the quietest legible step in the system — and can be hidden
entirely with a toggle, leaving only the bar.

Escalation is a single step, not a ramp:

| Time left | Bar | Digits |
|---|---|---|
| > 5:00 | track is `--surface-3` | `--text-3`, 13px, tabular |
| ≤ 5:00 | track turns `--warning-quiet`, a warning notch appears at the 5:00 mark | `--warning`, 14px, 600 weight |
| ≤ 0:00 | overtime hatched in `--danger` past a danger tick at the round length | `--danger`, counting **up** with a `+` |

There is one halfway tick, always present, and one live-region announcement each at
5:00, 1:00 and 0:00. Nothing blinks, nothing pulses, nothing counts down out loud.

### Why

**A large red countdown is the single most anxiety-inducing element in a real
assessment pad, and most of that anxiety buys nothing.** Reading digits costs a
deliberate saccade and a division ("thirty-one minutes… of forty-five… so I'm two
thirds…"), and the answer to that sum is a feeling rather than a decision. Peripheral
vision reads a *length* for free. So the bar carries the information and the digits are
demoted to a confirmation you look at when you choose to.

**The colour-by-problem is the point, not decoration.** It makes the bar answer a
second question at a glance: *not just how much is gone, but where it went.* At a
glance you can see "I am past halfway and the bar is still entirely cyan" — which is
the single most useful in-round realisation there is, and it is exactly the advice in
`docs/interview-day.md` ("assume roughly half each, but let them steer"). That is why
the halfway tick exists. The bar is a **plan instrument** that happens to also be a
clock, rather than a threat.

It also means the in-round bar is a live, low-resolution preview of the scorecard's
timeline. Same encoding, same colours, two levels of detail. You learn to read one by
using the other.

**The digits can be hidden and the round does not end at zero.** Some people genuinely
perform worse with a number in the corner, and letting them turn it off costs nothing.
And at 0:00 nothing slams shut: the bar fills, the tail hatches red, and the digits
count up. A hard stop punishes the learner at the exact moment they were about to
finish, and it destroys the most valuable data on the scorecard — *how much more you
needed*. Overtime is recorded separately and shown separately, on the timeline, in the
fact strip and in the verdict. The scorecard is honest about it without being punitive:
"in the real thing that work would not have existed."

### The one thing the round says to you

The contract promises no help. That promise would be broken by a hint. It is not broken
by a **process** nudge, and there is exactly one: after 45 seconds with no keystroke, a
dismissible card in the corner says *"Forty-five seconds of nothing. If this were the
real round, would they know what you are thinking?"* It is opt-out on the pre-round
screen, it never mentions the problem, and it is disclosed in the contract. For a
Forward Deployed Engineer the narration **is** the job (`docs/study-plan.md` §risk 3),
and silent practice trains the wrong thing.

---

## 2. The contract

Stated before you start, on the same card as the button, in six lines with a glyph
each. Not a modal, not a checkbox — a checkbox is friction theatre; the point is that
the terms are *legible*, not that you clicked something.

- **No hints.** The panel is closed for the round, so you cannot spend one by reflex.
- **No solutions.** Not during, and not the moment you pass. They unlock free on the scorecard.
- **One clock.** N minutes across both problems, not half each. It does not pause.
- **Move freely.** Switch as often as you like; code, scratchpad and results are kept.
- **Zero is not a wall.** You roll into overtime and it is scored on its own line.
- **The round pays no gems.** See §5.

Above it, a small optional pre-flight checklist taken straight from
`docs/interview-day.md` — water and paper, phone off, say it out loud, record yourself.
Nothing there blocks the round.

**The round shape is yours; the problems are not.** You choose company, length and
content split. The right rail shows what the round *contains* — "one SQL query, medium,
~15 min" — with title and pattern deliberately hidden until the clock starts, plus how
much slack is left over ("15 minutes of slack. Real rounds leave room to restate the
question"). Knowing the pattern in advance is the difference between practice and a
mock, so a *Reroll* button exists and a problem list does not.

---

## 3. The scorecard

It has to read like feedback from a good interviewer, so the structural decisions are:

**No score. No grade. No percentile.** There is a fact strip (solved, clock, checks,
first keystroke) and there is prose, and the prose is the headline — set at `--t-xl`,
the largest body text anywhere in the product. Every comparison is to *your own*
history, never to other users.

**The verdict is generated, not canned.** `buildVerdict()` branches on solved count,
overtime, whether a problem was stopped deliberately, and whether the unsolved one lost
more time to debugging or to writing, then interpolates the real numbers. So the four
sample outcomes each read specifically, and so does a round you actually play. The
tone rule was: name the outcome plainly, then normalise it, then say the one thing that
would change it. *"You would have got through the SQL half comfortably and run out of
road on the algorithms half. In a real 45 that reads as a pass on one half and an
incomplete on the other, which is a very common outcome and not a disaster."*

**"Where the time actually went" is one chart, not a pie.** A single horizontal
timeline of the whole round: problem bands along the top, the activity bar underneath,
event markers for every run (pass / partial), for solving, and for stopping, a dashed
halfway line, a danger line at the round length and a hatched overtime tail. It is one
picture that answers *what you were doing*, *which problem*, *in what order* and *how
close to the wire* simultaneously. Four textures rather than four hues — diagonal
stripes for reading, solid for writing, dots for debugging, faint dots for idle — so it
survives the colour-blindness rule that the rest of the system already follows. Under
it, three generated call-outs picked from a weighted rule list, so the ones you get are
the ones that apply.

**Per-problem cards reveal the pattern.** *"Tested: ROW_NUMBER dedupe · your history 3
of 4"* — deliberately not shown before, because a named pattern is a hint. Then time
against the problem's own `minutes` budget, checks, run count and time-to-first-run, a
reading/writing/debugging split bar, and a short note headed **"What an interviewer
would have written"**. Those notes are authored per problem and per outcome (six
problems × two outcomes) rather than templated, because generic coaching is what makes
a scorecard feel like a grade. The stuck note for the sliding-window problem names the
actual bug — `while`, not `if` — and says why it survives the samples.

**The honest cases are designed, not tolerated.** *Not solved* and *Stopped early* use
warning and violet, never danger; danger is reserved for a failed test. A zero-solved
round gets a verdict that opens *"Read that as information, not as a verdict"* and a
next-step list that is still three concrete things. Stopping deliberately is written up
as a good instinct, quoting the interview-day line back at you.

**What to work on next** is three ranked items with a working button, sorted so the
weakest pattern comes first — matching the order in the patterns table above it — with
process items from the interview-day notes filling in when the round itself was clean.
Because a clean round still has a *"how did you talk while you did it"* answer.

---

## 4. Where the time data comes from

The brief's claim is that reading vs writing vs debugging is derivable from trace and
attempt data. It is, and this is the derivation the page actually runs, once per second,
against the problem you are currently on:

| Bucket | Rule |
|---|---|
| **writing** | a keystroke in the last 3 seconds |
| **debugging** | otherwise, the last run on this problem failed |
| **reading** | otherwise, this problem has never been run |
| **idle** | otherwise (a run passed, or you are between things) |

Consecutive identical seconds collapse into blocks, so a round is a short array of
`{problem, activity, duration}` plus a list of timestamped events. That is the same
shape the four canned scenarios are authored in, which is why the scorecard renders a
played round and a sample round through identical code. Every number on the scorecard —
including the fact strip, the split bars, the call-outs and the verdict — is computed
from that array by `summarise()`.

It is a heuristic and it should be labelled as one, so it is: the section header says
plainly how it is derived. Two known weaknesses are in §7.

---

## 5. Gems — the recommendation

**The round itself should pay nothing. The problems inside it should pay their normal
first-clean-solve rate: 2 / 4 / 6 by difficulty, against the same 30-a-day cap.**

The reasoning:

- **Paying for the round pays for pressing a button.** Any per-round award is farmable
  by starting and immediately ending, and any award that scales with *completion* pays
  more for a round you abandoned early than for one you fought to the wire. Neither is
  a loop you want.
- **Paying less than normal for a mock solve is backwards.** Gems exist to buy hints
  and solutions. A mock offers neither — so **every solve inside a mock is clean by
  definition**, and it is clean under the hardest available conditions. Paying it less
  than the same problem solved untimed with five hints on the table would be an
  incentive to avoid the thing the product most wants you to do.
- **The daily cap already does the anti-farming work.** 30/day plus "first clean solve
  only" means a second mock over the same pool pays nothing, which is correct: the
  person running mocks the night before an interview is not playing for currency.
- **So the loop reads coherently.** The mock is where you *earn*; ordinary study is
  where you *spend*. That is a cleaner story than the current one, and it does not need
  a new rule to tell it.

The consequence is that a serious user's third mock frequently pays **0 gems**, and the
scorecard says so without apologising: *"+0 gems. Nothing was solved clean, and the
round itself never pays. That is deliberate."* A *Why does a mock pay nothing?* link
opens a short explainer. This is the right answer but it does argue for a **non-currency
reward specific to mocks** — rounds run, best round, a mock streak — living on
`profile.html` next to the achievements. That is not built here and it should be.

One thing the round *does* give away free, as a deliberate contrast to the metering:
**both write-ups unlock on the scorecard regardless of outcome.** That is the Phase 2
§5 recommendation ("always free after a correct solve") extended one step further —
after a *mock*, solved or not — because the moment after a round you just lost is the
single highest-learning moment in the product, and charging for it monetises giving up
at exactly the wrong time.

---

## 6. What is genuinely wired

There are no dead controls. In particular:

- **The round composes for real.** Source × length × content shape picks two problems
  from a pool of six by kind and by the company's reported difficulty skew, recomputes
  the per-slot budgets and the slack, and *Reroll* draws a different pair. Choosing
  Datadog gives you two algorithms problems at 45 minutes because its SQL weight is
  *light*; choosing the 60-minute extended round pulls in the hard problems.
- **The editor is real**, with the same treatment as `coding.html`: a textarea over a
  regex-highlighted `<pre>`, line-number gutter, tab handling, Ln/Col. Python and SQL
  tokenisers both.
- **Switching problems preserves everything** — code, scratchpad, last run, per-problem
  elapsed. Verified by driving the page: type SQL, switch, type Python, switch back,
  the SQL is still there.
- **Run checks responds to what you typed.** SQL answers are checked against named
  structural properties from the spec ("ties broken on `feed_row_id`", "only the top
  row kept"), so a correct-looking query missing the second sort key really does come
  back 4 of 6. Python answers are run against the problems' **real** test cases by a
  small JS simulator parameterised on the axis that actually matters — store-before-check
  for two-sum, `while` vs `if` for the sliding window, sort-or-not and `<` vs `<=` for
  interval merging. Ship the `if` version of the window shrink and you get 6 of 9 with
  `"pwwkew"` and `"abba"` failing, exactly as Python would. Fix it to `while` and it
  passes 9 of 9. That is what makes the scorecard's numbers non-fake.
- **The clock, the overtime roll, the hush toggle, the silence nudge, the splitter, the
  problem tabs, the end-round confirmation, the theme toggle, the timeline tooltips and
  every scorecard button** all do something.

Driven in headless Chrome over the CDP with an exception / console / log listener
attached across the whole flow — pre-round → round → run → switch → stop → end →
scorecard, both themes, all four sample outcomes, 1600px and 900px. **Zero JavaScript
errors, zero console errors.**

---

## 7. Accessibility

Inherits the system's one focus rule (`:focus-visible` → 2px `--ring` at 2px offset,
never removed) and adds nothing that breaks it.

- **The timeline's event markers are HTML `<button>`s positioned over the SVG, not
  `<g tabindex="0">`.** They started as SVG groups and focus events did not behave
  reliably; buttons give real focus semantics, a real hit target, a real focus ring and
  a tooltip that works on hover *and* on Tab. Verified with a real dispatched Tab key,
  not a scripted `.focus()`.
- Real tab semantics on the state switcher and the problem rail: `role="tablist"`,
  `aria-selected`, roving `tabindex`, arrow keys, Home/End.
- Colour is never the only signal: run markers carry a tick or an exclamation and a
  label; outcome chips carry a glyph and a word; the timeline's four activities are
  four *textures*; the problem tabs carry a status glyph with `sr-only` text.
- One polite live region, used sparingly — round start, 5:00, 1:00, time, round end.
  The timer element itself is `aria-live="off"`, because a screen reader announcing
  every second is the accessible version of the thing this design is trying to avoid.
- `⌘↵` runs, `Esc` ends the round (and closes any modal first), `Alt+1`/`Alt+2` switch
  problems, the pane splitter is a focusable `separator` that responds to arrow keys.
- Contrast was checked against the same tokens the design-system page validates. The
  two new pairings that are not already in that table are text on the tinted problem
  bands: `--text-2` on `--accent` at 22% over `--surface` is **5.13:1** dark and
  **5.51:1** light; on the violet band, **5.79:1** dark. Both pass AA.
- Skip link, both themes complete, layout holds to 900px with the panes collapsing to a
  Problem / Code switch exactly as `coding.html` does.

---

## 8. Risks and open questions

- **The activity heuristic will mislabel long thinking as idle.** Staring at the
  problem after a passing run reads as `idle`, and a person writing on paper — which
  `docs/interview-day.md` explicitly tells them to do — produces no keystrokes at all.
  The bucket is named "Thinking / idle" rather than "idle" for that reason, but the
  honest fix is to widen the signal: scroll position in the statement pane, focus in
  the scratchpad, and time on the trace panel once mock rounds get one.
- **`debugging` is defined as "after a failing run", which flatters a fast typist.**
  Someone who never runs anything until the end accrues no debugging time at all and
  looks like a model of efficiency. Weighting by edit *distance* rather than by
  keystroke presence would fix it and needs the real attempt log, not a prototype.
- **The SQL checker is structural, not semantic.** It reads your query for the
  properties the spec asks for. That is a genuinely useful signal and it is a real
  check, but it is not a database — `sql.js` is already in `packages/problems`, and the
  shipped version should execute the query against the seeded schema and diff the rows,
  the way `coding.html` diffs SQL results.
- **The Python "simulator" is one axis per problem.** It is correct for the bug each
  problem is designed to teach and it responds to real edits, but it is not an
  interpreter. Pyodide already runs in this repo; the real thing runs the real code.
- **Only six problems have embedded statements**, so the round composer draws from six.
  A real implementation draws from all 27 and from generated problems, which also makes
  "you do not choose the problems" mean something stronger than it does here.
- **A mock draws from the same pool as ordinary practice**, so by the fourth round the
  problems are familiar and the round stops being a mock. Generated problems for the
  target company are the answer, and they cost 5 gems — which collides awkwardly with
  §5's "a mock pays nothing". Somebody needs to decide whether mock rounds get a
  free generated-problem allowance on Pro.
- **The gem recommendation is still unmodelled**, same as the note in `NOTES.md` §5.
  Nothing here validates that 2/4/6 against a 30/day cap produces the intended pressure,
  and adding a high-value activity that pays *nothing* changes the shape of that
  spreadsheet. Answer it before the economy hardens.
- **The token block is duplicated again.** This page inlines `_src/core.css` verbatim
  like the other four. It has no `_src/mock-interview.html` source yet only because
  `_src` was being edited concurrently while this was built; adding one — with the
  `/*@CORE@*/` marker and the page name in `build.py`'s default list — is a ten-minute
  job and should happen before anyone edits a token.
- **"Round 3" and the last-round chip are drawn, not stored.** Persisting rounds is the
  thing that makes the scorecard's "your history" column and the profile's mock stats
  real, and it is a schema question (`phase-2-plan.md` §data) rather than a design one.
- **No mobile.** Same position as `NOTES.md`: a phone is not a place to sit a 45-minute
  round, and pretending otherwise would be worse than not shipping it.

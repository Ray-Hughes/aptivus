# Aptivus — design notes

Four standalone prototypes. No build step, no dependencies except Google Fonts
(Inter + JetBrains Mono). Open any of them straight from the filesystem.

| File | What it is |
|---|---|
| `design-system.html` | The system itself: tokens (dark **and** light), type scale, spacing, every component in every state, and the rules written down next to them. |
| `landing.html` | Marketing front page. The step-through debugger is the hero demo and it actually runs. |
| `profile.html` | Progress dashboard. Stats, streak, gems, achievements, target company. |
| `coding.html` | The solve view. Problem → editor → run → trace → submit. |

Everything is wired with vanilla JS. There are no dead controls: every button,
tab, toggle, dropdown, slider, accordion and drag handle does something. A
reviewer clicking at random will not hit a stub. Both themes are complete, both
were checked with a real contrast calculation rather than by eye, and the layouts
hold down to tablet.

---

## 1. What was wrong with the old UI

The current app is a deliberate HackerRank lookalike, and it was right to build it
that way — the point of Phase 1 was that the pad should feel like the one you will
be sitting in. But the tells that make it *feel* like an assessment tool are the
same tells that make it look like a 2015 assessment tool:

| Old | Why it reads dated | New |
|---|---|---|
| `#1b1c1f` neutral grey ground | The grey of a Java IDE. No temperature, no identity. | `#08090C`, near-black with a blue cast, and layered surfaces instead of one flat grey |
| `#39c06c` green primary button | *The* HackerRank tell. A green "Submit" is somebody else's brand. | The cyan→violet brand sweep, used for exactly one action per view |
| 4–5px radii, 1px borders everywhere | Every box is a box. | 8/10px controls, 14px cards, 20px sheets; separation by surface value first, border second |
| System sans at 13/14px, no scale | Nothing has a size relationship to anything else. | An 11-step scale with tracking that tightens as size grows |
| Colour-only status (green tick, red cross, yellow dot) | Fails for ~8% of men. | Colour **plus** a glyph plus a label, everywhere |
| Trace panel as a strip of grey buttons | The best thing in the product looked like a debug console. | The trace panel is now the visual centre of the solve screen |
| No light theme | Half of developers work in light. | A full sibling palette, not an inverted afterthought |

The workflow is untouched. Read the problem → write code → run → diagnose → test →
submit is the same loop, in the same three panes, with the same vocabulary: Trace,
Ask, Hint, Solution, Mock Interview, packs, gems.

---

## 2. The token system

One block of CSS custom properties is shared verbatim by all four files. Components
reference **roles**, never hex. Swapping `data-theme` on `<html>` repoints every
token at once — which is why the theme toggle is instant and total, including
syntax highlighting and chart gradients.

### Colour

Surfaces run darkest → lightest as `--bg` → `--surface` → `--surface-2` →
`--surface-3`, with one exception that matters: `--surface-in` goes *darker* than
the card it sits in. Inputs, code wells, terminals and the editor are **recessed**,
not raised. On a near-black ground a shadow is invisible, so the whole elevation
model is surface value first, a 1px border second, and shadow only for things that
genuinely float (menus, toasts, modals).

Text has exactly three levels — `--text`, `--text-2`, `--text-3` — and `--text-3`
is the floor for anything a user has to read. Below that is decorative and must
repeat itself somewhere legible.

Semantic colours are tuned **per theme** rather than shared. Dark success is
`#3FDD9A`; light success is `#0A7A50`. The same hex cannot pass 4.5:1 on both
grounds, and pretending otherwise is how "we support light mode" turns into an
accessibility bug.

The design system page computes every contrast ratio in the browser at load and
prints a pass/fail table. That caught three real failures during this work:

- `--accent` on white was **4.30:1**. Darkened to `#0A7490` → 5.37:1.
- `--success` on white was **4.11:1**. Darkened to `#0A7A50` → 5.37:1.
- Ink on the raw brand gradient was **4.19:1** at the violet end.

That last one is worth explaining. The brand sweep is `#00E5FF → #7C4DFF`. White
text on the cyan end is 1.7:1 — hopeless. Ink text on the violet end is 4.19:1 —
close, and still a fail. No text colour clears AA across that whole span. So
buttons use `--brand-grad-cta`, the same sweep with the violet stop lifted to
`#9E7BFF`, which puts ink at 6.46:1 at the dark end and 13.1:1 at the light end.
The lift is imperceptible next to the logo and it is the difference between passing
and not. There is a matching `--brand-grad-text` because on a white background the
cyan stop of the true gradient is effectively invisible, so light mode darkens both
stops for gradient *text* and progress fills.

### Type

Inter for interface, JetBrains Mono for anything a machine produced. Two families,
no third. Eleven sizes from 10px micro-labels to a 64px hero. Tracking tightens as
size grows (−0.022em headings, −0.035em display, 0 at body, +0.07em on uppercase
micro-labels). Numbers that change in place — timers, step counters, gem balances,
stat tiles — are tabular, so nothing jitters.

Density is deliberate and split: **the solve screen runs at 13px with 8px gutters**
because it is a working tool and vertical space is the scarce resource; **marketing
and profile run at 16px on a 24–96px rhythm** because they are read, not operated.

### Space, shape, motion

4px base, eleven values, no exceptions. Radii: 8–10px controls, 14px cards, 20px
sheets, full pills, with inner radius = outer minus padding so corners stay
concentric. Three durations (90/160/280ms) and two curves — `ease` for state
changing in place, `ease-out` for things arriving. Nothing loops for atmosphere.
`prefers-reduced-motion` collapses every duration to 0.01ms and cancels the solve
confetti, and it lives in the core stylesheet rather than per component, so no
component can forget it.

---

## 3. Page decisions

### `coding.html` — the one that matters

**The trace panel is now the centre of gravity.** It is the only thing in this
product no competitor has, and in the old UI it was a grey strip of unlabelled
arrow glyphs under the editor. Now:

- The **narration is the largest text in the panel** (14px against the 13px
  everything else), because the sentence *"the condition on line 6 was true, so we
  stepped into its block"* is the actual product.
- The active line is a left-to-right fade of `--accent-quiet` with a 2px cyan spine
  on the gutter number — never a solid block, because the code has to stay readable
  underneath it.
- Variable chips are **buttons**. Clicking one pins an inspector card below, which
  stays live as you step and highlights when its value changes. A pin glyph appears
  on hover so the affordance is discoverable without adding noise at rest.
- The `>>>` console sits in its own recessed well at the bottom with the step it was
  evaluated at stamped on the right, because "what did this expression evaluate to,
  and *when*" is two questions.
- Play, prev, next, a scrubber, a **speed control**, a case picker and Close all fit
  in one 38px header row and wrap gracefully when the pane is narrow.

**The flow is preserved and the failure path is made short.** A failing test case
opens expanded, shows input / expected / your output, and offers *Trace this case*
and *Ask why*. The verdict bar carries a *Trace the first failure* shortcut. Going
from a red test to stepping the exact input that broke it is one click, which is
the single highest-value interaction in the product.

**Metering is visible, not buried.** The top bar shows today's remaining hints and
solutions. Hints are progressive cards that show the price *before* you spend
(free while the allowance lasts, then 1 gem). The solution tab says plainly that it
is free the moment you pass the tests — the §5 recommendation from the Phase 2 plan,
rendered as UI.

**What is real:** the editor is a real textarea with live syntax highlighting drawn
by a regex tokeniser onto a `<pre>` behind it, with a line-number gutter, tab
handling, and Ln/Col tracking. Run, Submit and Trace all go through a tiny
JavaScript simulator of `find_pair`, so they **respond to what you actually type**.
The starter code ships with the classic bug — `seen[p] = i` above the membership
check — so Run fails sample 2 with `[0, 0]`, and if you move that line below the
check, the tests genuinely pass, Submit fires the confetti and credits 2 gems.
The trace steps are generated from that same simulator, so they are correct for
every case and for both versions of the code. The `>>>` console really evaluates:
`seen[need]`, `len(seen)`, `need in seen`, `target - p` all work, and an unknown
name returns a Python-shaped `NameError`.

The SQL problem is wired too, on the same principle: an `INNER JOIN` drops
`out-of-appetite`, the results panel diffs your rows against the expected rows and
marks the missing one, and the trace splits the query into the join step and the
group step so you can see the row disappear *before* any grouping happens. On a SQL
problem the stepper controls hide and the `>>>` console runs queries against the
seeded tables instead.

### `landing.html`

The hero is the tagline and nothing else, then the debugger — above the fold on a
laptop, autoplaying once when it scrolls into view, pausable, scrubbable, with a
pinned variable card and a `>>>` line. The Phase 2 plan says "a short loop of
stepping through two-sum with the variables changing will sell this better than any
copy". It is better than a loop: it is the real control surface, and it is 18 steps
— the same 18 the Pyodide parity harness produced.

Pricing states the daily limits on the card rather than in a footnote, has a working
monthly/yearly toggle, and puts the gem packs underneath with the earn rates beside
the purchase prices, so the intended shape (gems are a top-up, Pro is the answer if
you study daily) is legible in one glance.

### `profile.html`

Retention surface, so the rewards block is given the most visual weight on the page:
its own bordered container with a gradient header, a claimable daily bonus, a level
ring, an append-only-looking gem ledger, a 12-week streak heatmap, and fourteen
achievement tiles — seven earned, seven locked with real progress bars and a detail
modal. Locked tiles show the *specific* next step ("12 of 30 days. Do not break it
now."), because a locked badge with no path is just a grey square.

The stats are honest about weakness: patterns are sorted worst-first, and the call-out
names the two weakest patterns and says they are in this round. That is the thing the
product claims to do that a problem list cannot.

---

## 4. Accessibility

- **One focus rule for the entire product**: `:focus-visible` → 2px `--ring` at 2px
  offset. It is never removed anywhere; a component that needs a different look
  changes `--ring`, not the rule.
- Real tab semantics: `role="tablist"`, `aria-selected`, roving `tabindex`, arrow
  keys / Home / End.
- Colour is never the only signal — pass/fail carry glyphs, changed variables carry
  a border *and* a tint, difficulty badges carry their word.
- Live regions announce run results and step narration.
- The solve screen is fully keyboard driven: `⌘↵` runs, `⌘⇧↵` submits, `←`/`→` step
  the trace, `T` toggles it, `N` takes the next problem. Both pane splitters and the
  trace grip are focusable separators that respond to arrow keys, so panel sizing is
  not mouse-only.
- Skip links on every page.

---

## 5. Risks and open questions

- **The token block is duplicated across four files.** That is the price of
  "standalone, no build step". If these become real pages, extract it to one
  stylesheet on day one — a colour changed in three of four files is worse than no
  system at all. These four were generated from a single shared `core.css` — see
  `_src/`, which holds that file, the four page sources and the ten-line `build.py`
  that inlines one into the others. The outputs need nothing from `_src` to run.
- **The editor is a textarea, not CodeMirror.** It is genuinely good enough to
  demonstrate the design — highlighting, gutter, active-line band, tab handling —
  but it has no bracket matching, no autocomplete, no undo grouping and no soft
  wrap. The real thing should keep this *visual* treatment and put CodeMirror 6
  underneath it. The line-height (22px) and gutter width are the two numbers that
  have to survive that swap.
- **Trace line numbers are absolute.** The prototype highlights lines by number from
  a canned trace. Because the fix for the shipped bug swaps two lines without
  changing the line count, this holds for the intended path — but heavily edit the
  code and the highlight will point at the wrong line. The real tracer gets line
  numbers from the runtime, so this is a prototype artefact, not a design problem.
- **The pinned inspector grid is `auto-fit minmax(250px, 1fr)`.** Pin four variables
  in a narrow editor pane and the cards get cramped. A real implementation probably
  wants a horizontal scroller past three pins, or a maximum.
- **Mock Interview is a nav item, not a screen.** It links to the solve view. It
  needs its own design — two problems, one clock, a scorecard at the end — and that
  is the obvious next deliverable.
- **The gem economy is drawn, not modelled.** Balances, ledger entries and earn
  rates are the numbers from the Phase 2 plan, but nothing here validates that a
  daily cap of 30 with 2/4/6 per clean solve produces the intended pressure. That
  is a spreadsheet question, and it should be answered before the UI hardens.
- **No mobile design below 700px.** The layouts survive — the panes stack, the nav
  collapses to a burger, the tables scroll — but a phone is not a place to sit a
  45-minute coding round, and designing for it properly would mean deciding what the
  phone experience *is* (review? flashcards? reading write-ups?) rather than
  shrinking the pad.

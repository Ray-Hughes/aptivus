# Design review — Aptivus prototypes

Reviewed 2026-08-20 by driving all four pages in headless Chrome (CDP): every button, tab,
toggle, slider, dropdown and link was clicked; keyboard tested with real key events (Tab,
arrows, Enter); screenshots taken at 1600 / 1024 / 900 / 480 / 375 px in both themes.
Contrast ratios below are computed (WCAG relative luminance), not eyeballed.
Context read: README.md, docs/phase-2-plan.md, apps/web/.../Workbench.tsx.

---

## Verdicts

| Page | Verdict | One line |
|---|---|---|
| `coding.html` | **Revise** — close to ship | The core loop is excellent and fully working; one real responsive break, one product-policy conflict, one intent-signposting gap. |
| `landing.html` | **Revise** | Strong story and a working live demo, but a severe mobile CTA contrast bug, a double-step slider bug, five dead footer links, and a self-contradicting problem count. |
| `profile.html` | **Revise** | Rich and almost entirely wired, but the headline chart's line literally does not render, and the page ignores the phase-2 requirement to show daily allowances with a reset countdown. |
| `design-system.html` | **Ship** after items 9 and 15 | Everything on it works, the contrast table is computed live, and the documentation is honest. Two one-line token/doc corrections. |

**Is the debugger the hero?** On the landing page: yes, genuinely. The hero sub-copy leads
with "shows you *what your code actually did* — line by line, variable by variable", the
eyebrow badge is about tracing, the first section after the hero is the live, scrubbable
demo (it autoplays on scroll into view), and the top-nav's first link is "The debugger".
A first-time visitor understands the differentiator within one screen. In `coding.html`
it is discoverable but not heroic: the Trace button is the *quietest* of the three footer
actions (`.btn-outline`, gray text) next to Run and Submit, the Tests-pane empty state
mentions Run and Submit but never Trace, and the intended wow moment depends on a toast
that vanishes after 3.2 seconds (item 5). The failing-case → "Trace this case" path
rescues it, but only after the user has already run.

**Does the flow survive end to end?** Yes — I drove it: read problem → write (starter) →
Run → sample 2 fails with expected `[0, 1]` / got `[0, 0]` → "Trace this case" opens the
panel pre-selected on sample 2 → stepping reaches the narration "The condition on line 6
was true… **including the value we just inserted on line 5**" → pin `seen`, evaluate
`need in seen` → `True (bool)` at "step 7" → fix the code → Submit → 8/8, confetti,
+2 gems, "Solved ✓", `N` advances. The SQL problem's flow also survives: inner-join
starter → "1 expected row missing" → "Trace the query" → step 1 shows *"out-of-appetite
is already gone here, before any grouping happens"*. This is the product thesis on
screen, and it works.

---

## The `seen[p] = i` before `if need in seen` question (line 5 vs 6)

**It is deliberate, and the page proves it.** The source carries a comment saying exactly
this ("That is the classic bug, and it is what the starter code ships with"), and the
whole page is built around it: `codeShape()` re-parses the editor text so Run, Submit and
Trace all react to whether the insert is above or below the check; the trace has a
purpose-written narration for the self-pairing moment; hint 3 teaches the fix ("check the
dict **before** inserting"); the reference solution is annotated `# insert AFTER the
check`; the Ask panel has a canned answer explaining `[0, 0]` on `[3000, 3000]`; the
landing-page demo shows the **corrected** code. Editing the code to the correct order
flips every behavior accordingly — verified.

**But the intent is not unmistakable, and it must be.** The only in-UI signal is a toast
("Run the code as shipped: sample 2 fails…") that appears at ~0.9 s and disappears at
~4 s. Miss it — look at the problem pane first, as most people will — and the page reads
as *a product that ships buggy starter code*. Real pads ship `pass` or an empty body;
a pre-filled wrong attempt is a demo device and has to be labeled as one, persistently.
See required change 5.

---

## Required changes (ordered by impact)

1. **`profile.html` — the "Time to solve" chart has no line.**
   Element: `#trend` polyline, built in `drawTrend()`.
   Current: the stroke attribute is emitted as the literal text `stroke="url(#" + gradId() + ")"`
   — the quoting keeps `gradId()` *inside* the string, so the rendered attribute value is
   `url(#`, which is invalid, and the trend line is invisible. Verified in the DOM
   (`polyline stroke = "url(#"`) and in screenshots: hollow dots and an area fill float
   with no connecting line, in both themes and all three ranges.
   Fix: `'… stroke="url(#' + gradId() + ')" …'`. One line.

2. **`landing.html` — mobile-menu "Start free" is unreadable (1.4:1).**
   Element: `.mm-cta .btn-primary` inside `#mm`.
   Current: `.mobile-menu a { color: var(--text-2) }` out-specifies `.btn-primary`, so the
   computed color is `rgb(167,174,191)` on the cyan→violet gradient — **1.44:1 / 1.40:1**
   at the two gradient ends (AA needs 4.5:1). Verified at 480 px with the menu open; the
   label is nearly invisible in the screenshot.
   Fix: scope the menu-link rule (`.mobile-menu ul a`) or add
   `.mobile-menu .btn-primary { color: var(--text-on-brand); }`.

3. **`coding.html` — top bar overflows and is clipped below ~560 px.**
   Elements: `.app-top` and everything right of the spacer.
   Current: at 480 px (and 375 px) the header's minimum content width is **559 px**;
   `body { overflow: hidden }` clips it, so the clock is cut mid-glyph and the Start /
   Reset buttons, theme toggle and avatar are **unreachable** (clock right edge 485 px,
   Start 537 px, theme 559 px in a 480 px viewport). Measured via CDP.
   Fix: at ≤ 700 px collapse the timer to the clock only (tap to start/pause), move theme
   and avatar behind an overflow menu, and let `.app-top` wrap or hide `#tReset`/`#tStart`
   labels. The 480 px screenshot otherwise looks good — this is the one break.

4. **`landing.html` — demo slider double-steps on arrow keys.**
   Element: `#dRange` + the `#demo` keydown listener.
   Current: the container's keydown handler calls `go(idx ± 1)` **and** the focused range
   input's native arrow behavior then fires `input` → `go()` again. Verified with a real
   key event: one ArrowRight press moved the counter from **1 / 18 to 3 / 18**. The
   equivalent in `coding.html` is guarded (its document handler ignores keys while an
   INPUT has focus) — copy that guard, or skip the handler when `e.target === dRange`.

5. **`coding.html` — make the deliberate starter bug unmistakable.**
   Element: the starter code (`PY_STARTER`) plus the boot toast.
   Current: the only signpost is a 3.2-second toast (see analysis above). The Ask
   placeholder ("I don't understand why seen[p] = i has to come after the check") quietly
   spoils the answer, too.
   Fix (any one of): a comment in the starter itself — e.g. line 5:
   `seen[p] = i   # ← this attempt has a bug. Run, then trace sample 2` —; or a persistent
   demo banner under the tabs ("This prototype opens mid-attempt with a planted bug —
   Run, then Trace"); or both. And note for the real product: starters ship as `pass`,
   the planted-bug attempt is a marketing/demo asset only.

6. **`coding.html` — hidden test inputs are fully disclosed; decide the policy.**
   Element: `#tCase` options and the results list.
   Current: the trace dropdown lists every hidden case with its input
   (`hidden case 3 · [1000, 2000, 3000], 10000` …), and failed hidden cases show inputs in
   the case body. Phase-2 §1 is explicit that hidden tests are the thing the server "will
   not hand over unmetered" — sample tests run in the browser, hidden ones are graded
   server-side against undisclosed expected values. As drawn, the design gives them away.
   Fix: either mask hidden inputs in the hosted design ("hidden case 3 — trace uses the
   real input, values not shown") or record the deliberate decision that tracing any
   hidden input is a free feature (which forfeits part of the metering). This is a
   product call, but the prototype currently makes it silently.

7. **`landing.html` — the problem count contradicts itself on one page.**
   Elements: `.hero-trust` ("**27 curated problems**, all verified"), the FAQ ("verified …
   across all 27 problems") vs the packs section (Federato 27 **+ Core patterns 64** = 91
   curated problems, matching profile's "34 / 91"). Worse, the Core-patterns card says
   "**64 problems**" in the meta line and "the canonical **fourteen** patterns, **one
   clean representative each**" in its body — 14 ≠ 64 inside a single card.
   Fix: pick the real numbers and make hero, FAQ, packs and profile agree.

8. **`landing.html` — five dead footer links.**
   Elements/selectors, all `a[href="#"]` (they jump back to page top):
   `Changelog`, `Terms`, `Privacy`, `GitHub`, `Contact`.
   Terms and Privacy are launch blockers in the phase-2 plan; GitHub is the OSS funnel.
   Fix: real destinations, or visibly disabled "coming soon" styling. Also
   **"Writing a pack" points at `#how`** (the How-it-works section) — mislabeled; link it
   to docs/writing-problems or rename it.

9. **Shared tokens — light-theme `--text-3` fails AA on the page ground.**
   Element: `--text-3: #6B7486` (light) used for body-size meta on `--bg #F7F8FB`
   (e.g. `.block-hd .why`, `.demo-caption`, `.hero-trust`).
   Current: **4.43:1** — under the 4.5:1 the design system itself declares as "the floor
   for body copy". The system's own contrast table dodges this by only testing text-3 on
   `--surface` (#FFFFFF → 4.70 ✓). Dark-theme text-3 passes everywhere I measured
   (5.30 on bg, 4.63 on surface-2).
   Fix: darken light `--text-3` to ~`#656E80` (4.83:1 on bg) and add the "on --bg" row to
   the contrast table so it cannot regress.

10. **`profile.html` — free-tier allowances are absent from the dashboard.**
    Phase-2 §5: "Daily allowances reset at 00:00 UTC and **the dashboard should say so
    plainly, with a countdown**." The profile page shows gems and streak but not
    hints/solutions remaining or a reset timer anywhere. `coding.html` does show
    "Today 5 hints 3 solutions" (good) and the hints tab says "resetting at 00:00 UTC",
    but no countdown.
    Fix: an allowance tile or header chip on profile — "5 hints · 3 solutions today —
    resets in 6 h 12 m" — and reuse the countdown string in the coding hints note.

11. **`profile.html` — dead "Settings" item.**
    Selector: `#userPanel a[href="#"]` ("Settings") — scrolls to top. Point it at a
    settings stub or mark it disabled. (Also: "Problems", "Solve" and "Mock Interview" in
    `.app-nav` all resolve to `coding.html` — fine for a prototype, but label one of them
    as the destination it actually is.)

12. **`profile.html` — "Claim daily bonus · +5" is not in the gem economy.**
    Element: `#claimBtn`.
    The phase-2 economy is deliberate: gems are earned by **clean solves** (2/4/6, capped
    30/day) plus streak bonuses, and it explicitly designs against farming. A log-in
    claim button pays for showing up, not for solving, and undercuts the "earning is
    server-authoritative, first clean solve only" rule. Remove it, or convert it to the
    documented 7-day-streak +10 moment.

13. **`coding.html` — two controls promise behavior that does not exist.**
    - `#stdinBox` (Output tab): labeled "Input (stdin for Run)" but Run never reads it.
      The placeholder honestly says this problem takes function arguments — either drop
      the box for function problems or wire it to a stdin problem.
    - `#noteArea` (Notes tab): help text says "Saved locally, per problem. Never sent
      anywhere." Nothing saves it — no listener, no localStorage. In a prototype that
      otherwise brags "everything here works", a false save claim is the one lie. Persist
      it (3 lines) or say "not persisted in this prototype".

14. **`coding.html` — keyboard users cannot Tab past the editor.**
    Element: `#edTa` — Tab inserts four spaces (correct for a code editor), but there is
    no escape hatch, so the editor is a keyboard trap (verified: three Tab presses in a
    row stay in `edTa`). WCAG 2.1.2. Fix the standard way: Esc arms "Tab moves focus" for
    the next Tab (CodeMirror/Monaco convention) and say so in the editor footer.

15. **`design-system.html` — doc contradicts its own token.**
    The color rules list says "light success is **#0A8F5F**"; the token is `#0A7A50`.
    One of them is wrong — align the prose with the palette (the table already measures
    the real token).

---

## Optional improvements

- **Make Trace read as the hero inside the pad.** Promote `#btnTrace` to `.btn-accent`,
  mention Trace (and the `T` shortcut) in the Tests-pane empty state, and consider
  first-run auto-opening the panel on the demo problem. Right now the differentiator is
  the visually quietest button on the screen.
- `landing.html`: `#demo` is only keyboard-steppable when focus happens to be inside it;
  give `.demo-shell` `tabindex="0"` and an `aria-label` so keyboard users can reach the
  scrub behavior deliberately.
- Contrast polish (measured): `.kbd-hint` inside the primary button computes to ~3.56:1
  at the violet end of the sweep (11 px text at 62 % opacity) — raise the opacity or drop
  the hint on the gradient; code comments `--c-com #5B6376` on `--surface-in` are 3.35:1
  (conventional for syntax dimming — an accepted trade, but worth stating in the system
  as such, as done for text-3).
- ARIA structure: tabs have `role="tab"` and roving tabindex (arrow keys verified
  working — nice) but no `aria-controls`, and panels are plain hidden `div`s rather than
  `role="tabpanel"`. The problem-switcher `role="menu"` has no arrow-key navigation.
  Heatmap days are `tabindex="-1"` and hover-only (container `role="img"` label is a fair
  minimum). The profile modal sets initial focus and closes on Escape (verified) but has
  no focus trap.
- `#tCase` truncates at `max-width: 230px`; long inputs become ambiguous — widen when the
  panel is wide.
- Coding results list numbers cases across the whole set ("Hidden case 3" is the third
  test overall) — number hidden cases 1..n or keep test indices, but pick one story.
- The `landing.html` pack card "Generated for you" showing "~40 / month · or 5 gems each"
  is good honesty; add the same "included with Pro" phrasing to `profile.html`'s
  "Generate 5 · 25 gems" footer, which currently only shows the gem price even for what a
  Pro user would get free.
- The solved box says "13 days" streak while profile says 12 — presumably "after today's
  solve", but a reviewer will read it as a bug; derive both from one number.
- Design-system specimen buttons ("Open" on the pack card, sortable-table rows with
  `cursor: pointer`) do nothing — expected on a specimen page, but a one-word "specimen"
  caption would pre-empt the question.

---

## Every dead or false control found

Driven with clicks; "dead" = does nothing or jumps to page top.

| Page | Selector / element | State |
|---|---|---|
| landing.html | footer `a[href="#"]` "Changelog" | dead (jumps to top) |
| landing.html | footer `a[href="#"]` "Terms" | dead |
| landing.html | footer `a[href="#"]` "Privacy" | dead |
| landing.html | footer `a[href="#"]` "GitHub" | dead |
| landing.html | footer `a[href="#"]` "Contact" | dead |
| landing.html | footer "Writing a pack" → `#how` | wrong destination (mislabeled) |
| profile.html | `#userPanel a[href="#"]` "Settings" | dead |
| coding.html | `#stdinBox` | accepts input; Run never reads it |
| coding.html | `#noteArea` | claims "Saved locally"; nothing saves it |
| design-system.html | pack-card "Open" button; `#dsTable` rows (`cursor:pointer`) | inert specimens (acceptable, label them) |

Everything else I clicked works, including: landing demo (prev/next/play/scrub/keys,
autoplay-on-view, reduced-motion respected), billing toggle (yearly math checks out:
$79.90 ≈ −17 %), FAQ accordions, burger menu, upgrade button (honest prototype toast);
coding's tabs (both panes, arrow-key navigation), hints (allowance decrements 5→3, then
gem pricing appears), solution gate (allowance 3→2, "free after solve" honored —
verified post-solve), Ask (canned but context-aware answers), problem switcher (honestly
labeled "Only two are wired up in this prototype"), language switch, timer
(start/pause/reset, warn/danger states), Format, Reset code, both column gutters
(drag + arrow keys + double-click reset), trace panel (open/close, `T`, play/pause,
speeds, case switching including "My file, run as written", pin/unpin/unpin-all, resize
grip with drag/arrows/double-click collapse to 38 px and restore to 442 px), expression
console (Python eval with types and NameError, SQL queries against the seeded tables),
Submit lock after solve with unlock on edit, confetti, `N`; profile's claim button
(disables correctly), Top up, achievement modals (all 14), all four segmented controls,
donut/pattern/attempts charts, heatmap hover, company/role/round/date target controls,
Save target, Generate (spends 25 gems, writes the ledger), activity filter + Load more,
user menu, gem-chip scroll; design-system's swatch copy, toggle button, loading button,
tabs, segment + live table filter/sort, range, toast triggers, theme toggle everywhere,
and theme persistence across pages via localStorage.

---

## What is genuinely good — preserve this

- **The trace experience is the best version of this idea I have seen, and it is real.**
  Plain-language narration written from the *previous* line's effect ("The loop on line 3
  handed out: i = 1, p = 3000"), changed-variable chips highlighted per step, pinning
  with live pretty-printed values, the expression console stamped with the step it ran
  at, and — the killer detail — the return step compares against the expected output
  *inside the trace* ("returned `[0, 0]` — but this case expected `[0, 1]`"). The
  red-test → "Trace this case" button is exactly the right bridge. Do not let anyone
  simplify this.
- **The SQL trace is a genuine differentiator too** — splitting the query into "the join,
  before grouping" and showing the missing row disappear *before* GROUP BY teaches the
  actual debugging move, not just the answer.
- **The simulator reacts to what you type.** Fixing the insert order changes Run, Submit
  and the trace coherently. That makes the prototype feel like a product, not a film.
- **Honest monetization on the page.** "5 hints and 3 solutions a day — resets 00:00 UTC"
  sits in the pricing table, the hints note, and the top bar; "free once you have passed
  the tests" is stated at the lock screen and honored after solve; prototype buttons say
  they are prototypes.
- **Token discipline.** One shared core (verified byte-identical across all four files),
  a complete light theme, a computed-not-claimed contrast table, a global focus-visible
  ring that actually shows up on every Tab stop (verified with real key events), roving
  tabindex on tab groups, live regions for run results and step narration, global
  reduced-motion. The type scale and 4 px spacing rhythm hold up in screenshots at every
  width tested.
- **Copywriting.** "Packs, not a pile", "Five days, one company, no wasted reps", the
  Ruby→Python gotcha notes, and the FAQ that answers the questions people actually ask.
  The voice is consistent across all four pages, which is rarer than good CSS.

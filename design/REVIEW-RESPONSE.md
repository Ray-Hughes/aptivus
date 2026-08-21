# Response to the design review

Answering `REVIEW.md` (2026-08-20). Every claim below was re-verified by driving the four
pages in headless Chrome over CDP: real clicks, real key events, an exception listener
attached for the whole session, screenshots at 1600 / 1024 / 480 / 375 px in **both**
themes. Contrast numbers are computed WCAG relative luminance, not eyeballed.

**Result: 15 of 15 required items done. Zero JS errors on any page. No page scrolls
sideways at any width tested. Two things I did not do are listed at the bottom, plus the
places where the pages are now ahead of the repo.**

Source of truth is `_src/` — `core.css` plus four page sources, inlined by `_src/build.py`.
I edited the sources and rebuilt; the four files in `design/` are still fully standalone.
`mock-interview.html` and `NOTES-mock.md` were not touched.

---

## Required changes

### 1. `profile.html` — the "Time to solve" chart had no line — **fixed**

The stroke was built inside a single-quoted literal, so `gradId()` never ran and the
attribute was emitted as the four characters `url(#`:

```js
'… stroke="url(#" + gradId() + ")" …'      // before — literal text
'… stroke="url(#' + gradId() + ')" …'      // after
```

Verified live: `#trend polyline:nth-of-type(2)` now reports `stroke="url(#apGrad)"` in dark,
`url(#apGradL)` in light, and `getTotalLength()` returns 1118.9 instead of drawing nothing.
Re-checked across all three ranges and with "Hard problems only" on.

### 2. `landing.html` — mobile "Start free" at 1.4:1 — **fixed**

`.mobile-menu a` was scoped to `.mobile-menu ul a`, and the CTA colours were set explicitly:

```css
.mobile-menu .mm-cta .btn-primary { color: var(--text-on-brand); }
.mobile-menu .mm-cta .btn-secondary { color: var(--text); }
```

Measured at 480 px with the menu open: computed colour is now `rgb(4, 7, 14)` —
**13.10:1** at the cyan end, **6.46:1** at the violet end, against the 1.44 / 1.40 the
review measured. Your numbers were exact; I reproduced both.

### 3. `coding.html` — top bar clipped and unreachable below ~560 px — **fixed**

Because `body { overflow: hidden }`, anything the bar could not fit was genuinely
unreachable, not just untidy. Below 700 px the bar now **wraps**: identity, timer, theme
and avatar on row one; the Problem / Code / Tests switcher full-width on row two. Below
420 px the brand mark drops out. The avatar is back (it is the only route to Progress on a
phone).

Measured at 375 px: header `scrollWidth === clientWidth === 375` (was 559 of content in a
480 px box). `#tStart`, `#clock`, `#themeBtn`, `#pswitchBtn`, `#paneSwitch` all inside the
viewport, and `elementFromPoint` on the centre of Start and the theme toggle returns those
elements — they are hittable, not just present. Clicking Start starts the clock (44:59
one second later). Same at 480 px.

### 4. `landing.html` — demo slider double-stepped — **fixed**

Copied the solve view's guard: the container handler returns early when the event target is
an `INPUT` / `TEXTAREA` / `SELECT`, so the range's native arrow handling is the only one
that runs.

Verified with real `Input.dispatchKeyEvent`: focus in `#dRange`, one ArrowRight goes
1/18 → 2/18 → 3/18 (was 1 → 3). ArrowLeft steps back one. With focus on the shell instead,
the container handler takes over and also steps exactly one.

### 5. `coding.html` — make the deliberate starter bug unmistakable — **fixed, three ways**

The review offered "any one of"; you asked for a persistent cue with the code comment as
the obvious candidate. It is now signposted in three places that do not time out:

1. **In the code itself**, line 5:
   `seen[p] = i                 # <- planted bug. Run, then trace sample 2`
2. **A persistent note above the problem text**, on both problems, generated per language:
   "This pad opens mid-attempt, on purpose. The starter is a deliberate half-right attempt —
   line 5 inserts into `seen` before line 6 checks it — so there is something to Run, fail
   and Trace. The product ships starters as an empty body." (On the SQL problem it names the
   `INNER JOIN` / `LEFT JOIN` instead.)
3. **A line in the Tests-pane empty state**, which is what you see before you Run.

The boot toast now points at the comment rather than restating the failure.

The Ask placeholder no longer spoils it — it is now "e.g. why does `[3000, 3000]` come back
as `[0, 0]`?", which asks the question instead of answering it. The canned answer still
fires on it (verified).

`codeShape()` strips comments before parsing, so Run / Submit / Trace still react to the
insert order exactly as before — confirmed by moving the line in the editor and getting
8/8, the solved box, +2 gems.

### 6. `coding.html` — hidden test disclosure — **fixed to the narrower policy you set**

Taking your correction: code executes in the learner's tab, so test **inputs** have to
travel there and masking them would be theatre. What must never leave the server is the
**expected output**. So:

- **Inputs stay visible**, in the picker and in the case bodies. No fake lock.
- **The picker is grouped and labelled**, which is where the distinction now lives:
  `Sample cases · input and expected output` / `Hidden cases · real input, expected output
  stays on the server` / `Your file`. Verified in the DOM as real `<optgroup>`s.
- **Hidden expected values are gone from the UI.** The trace note says
  "· expected output **graded on the server**" instead of printing the value; the failed-case
  body says "graded on the server — hidden cases never ship their expected output".
- **The killer detail survives on samples.** Tracing sample 2 still ends on
  "The function returned `[0, 0]` — but this case expected `[0, 1]`." On a hidden case the
  return step reads "— and the grader marked this case **failed**. The expected value stays
  on the server", which is a verdict, not an answer.
- `#tCase` widened 230 → 320 px so long inputs stop truncating (optional item, same element).

### 7. `landing.html` — self-contradicting problem count — **fixed, using your numbers**

Everything now reads **32 problems = 20 code + 12 SQL**, and **51 language checks** where
verification is cited.

| Where | Before | After |
|---|---|---|
| `landing` hero trust | 27 curated problems | **32** curated problems |
| `landing` Federato pack meta | 27 · 15 algorithms · 12 SQL | **32 · 20 algorithms · 12 SQL** |
| `landing` Core patterns meta | 64 problems (body said fourteen) | **14 patterns · community pack, in progress** |
| `landing` FAQ | across all 27 problems | across all **32** problems and **51** language checks |
| `coding` problem switcher | Federato pack · 27 problems / The other 25 | **32** / The other **30** |
| `profile` solved tile | 34 / 91 | **24 / 32** |
| `design-system` specimens | 4/27, badge 27, "showing 27 problems", `COUNTS {All:27,…}` | 32 / 20 / 12 |

The 14-vs-64 contradiction is resolved in favour of 14, and the card now says the pack is
open for contributions and **"not yet counted in the 32 verified problems above"** — which
is true: `packs/general/` in the repo has a `pack.json` and no problems in it yet.

**`profile.html` had three more numbers that disagreed and the review did not catch:** the
donut summed to 34, the pattern bars summed to 39 of 61, and "Attempts before a clean solve"
summed to 34. All three now sum to **24 solved of 32**, and the dataset carries a comment
saying to keep them in step. Knock-on corrections so nothing else lies:

- "SQL surgeon — solve 10 SQL problems, earned": SQL solved is now exactly 10.
- "Hard mode" said "you have opened 2 hards, neither is solved" while the donut showed 3
  hard solves. It now reads "3 hards solved, but every one of them with a hint. Do one clean."
- The weakest-patterns callout still names dynamic programming (0/2) and graphs (1/3) — they
  are still the bottom two after the worst-first sort. Checked in the rendered list.

### 8. `landing.html` — five dead footer links — **fixed**

`a[href="#"]` count on the page is now **0**.

- **GitHub** → `https://github.com/Ray-Hughes/aptivus` (the clone URL in `README.md`).
- **Contact** → `https://github.com/Ray-Hughes/aptivus/issues`. I did not invent a
  `mailto:` — there is no address in the repo and a fabricated one is worse than no link.
- **Writing a pack** → `../docs/writing-problems.md`, which exists. It was pointing at
  `#how`.
- **Terms**, **Privacy**, **Changelog** → rendered as non-interactive `<span class="soon">`
  with a small "SOON" pill. These are documents, not designs; I can style the promise but I
  cannot write the policy. Flagged again under "not fixed" below, because the phase-2 plan
  calls Terms and Privacy launch blockers and marking them "soon" does not unblock a launch.
- Footer **Mock Interview** now points at `mock-interview.html` (see the note under item 11).

### 9. Shared tokens — light `--text-3` failed AA on the page ground — **fixed**

`--text-3` (light) `#6B7486` → **`#656E80`**. Confirmed: 4.43:1 → **4.83:1** on `--bg`
`#F7F8FB`, and 4.70 → 5.13:1 on `--surface`. Live check on `.hero-trust`: computed colour
`rgb(101, 110, 128)` on `rgb(247, 248, 251)`.

The **"--text-3 on --bg" row is now in the contrast table** so it cannot silently regress —
it computes 5.30 ✓ dark, 4.83 ✓ light. The only remaining ✗ in the table is the
deliberately-documented "ink on raw #7C4DFF", which is there to explain why the CTA stop is
lifted.

### 10. `profile.html` — free-tier allowances absent — **fixed**

A full-width allowance strip sits between the identity header and the stat tiles:

> ⏱ Free plan · today   **5** hints left   **3** solutions left   …   Resets in **22 h 39 m** · 00:00 UTC

The countdown is computed from real UTC midnight and re-ticks every 30 s.

The same `untilUtcMidnight()` string is now reused in `coding.html`: the Hints tab reads
"…resetting in **22 h 42 m** — 00:00 UTC", and the top-bar allowance chip carries it as a
`title`. Both update as the allowance is spent (verified: 5 → 4 → 3 with the note text
following).

### 11. `profile.html` — dead "Settings", duplicated nav — **fixed**

- `#userPanel` "Settings" is no longer an `<a href="#">`. It is a non-navigating
  `aria-disabled` row with a "SOON" pill. `a[href="#"]` count on the page is **0**.
- The nav had **Problems**, **Solve** and **Mock Interview** all resolving to `coding.html`.
  The duplicate "Solve" is gone. Nav is now Problems / Mock Interview / Progress.
- **Mock Interview now goes to a real screen.** For most of this pass it did not exist, so
  the link carried an honest `title` saying it opened the solve view. `mock-interview.html`
  landed while I was working; I loaded it (title "Aptivus — Mock interview", zero JS errors,
  its own nav already pointing back here) and repointed both the profile nav and the landing
  footer at it. Nothing in that file was edited.

### 12. `profile.html` — "Claim daily bonus · +5" outside the gem economy — **fixed**

Removed, and replaced with the documented moment rather than nothing: a read-only chip in
the rewards header —

> ◈ Next streak bonus **+10 gems** at 14 days · 2 to go

which is consistent with the streak card's "+10 gems at every 7", with the 12-day streak,
and with the ledger's existing "7-day streak bonus +10". No button pays for showing up any
more. The claim handler and its `Daily bonus` ledger entry are gone from the JS.

### 13. `coding.html` — two controls promising behaviour that did not exist — **both fixed**

- **`#stdinBox`**: removed. The Output tab now explains instead of pretending — "Run hands
  your function its arguments, so there is nothing to type here. Problems that read
  `input()` put an editable stdin box in this spot." On the SQL problem it says SQL is graded
  on the result set. `document.querySelector('#stdinBox')` is now null.
- **`#noteArea`**: it really saves. `localStorage["aptivus.notes." + CUR.id]`, written on
  `input`, restored on problem switch, with a `try/catch` that changes the help text to
  "This browser is blocking local storage, so notes will not survive a reload" rather than
  lying. Verified by typing on the Python problem, switching to SQL, typing there, and
  switching back — each note came back on its own problem.

### 14. `coding.html` — the editor was a keyboard trap — **fixed**

Esc arms "the next Tab moves focus" (the CodeMirror/Monaco convention) and the editor footer
says so, live: it reads `Tab indents · Esc then Tab moves focus` and flips to
`Tab moves focus` in accent colour while armed. It disarms after the escape Tab, on any
other keystroke, and on blur.

Verified with real key events: Tab in the editor still indents and focus stays in `#edTa`;
Esc → hint changes; Tab → focus lands on `#btnTrace` and the hint resets. WCAG 2.1.2
satisfied without breaking indentation.

### 15. `design-system.html` — doc contradicted its own token — **fixed**

"light success is #0A8F5F" → **#0A7A50**, matching the token and the measured row.

---

## Optional items — taken

- **Trace promoted to the hero it is.** `#btnTrace` is now `.btn-accent` with a `T` shortcut
  hint, the Tests-pane empty state names Trace first ("A red case gets a *Trace this case*
  button — that is the thing to try first") and lists `T` among the shortcuts. It is no
  longer the quietest button on the screen.
- **`.demo-shell` is keyboard-reachable** — `tabindex="0"`, `role="group"` and an
  `aria-label` that names the arrow keys. Verified: it takes focus and steps.
- **`.kbd-hint` contrast.** Opacity .62 → **.75**. That takes the hint on the primary button
  from your measured 3.56:1 to **4.63:1** at the violet end (7.53:1 at the cyan end). Your
  3.56 reproduced exactly.
- **Syntax dimming stated as a trade.** The contrast rules now carry a line saying
  `--c-com` sits at 3.35:1 on `--surface-in` deliberately, why that is acceptable for
  comments specifically, and that nothing else is allowed under 4.5:1.
- **`aria-controls` and `role="tabpanel"`** on both of the solve view's tab groups, with
  `aria-labelledby` back to the tab. Verified every `aria-controls` resolves, and that
  arrow-key roving and click switching still work.
- **`#tCase` widened** (see item 6).
- **Specimens labelled.** The design-system pack card button reads "Open · specimen" with an
  explaining `title`, the tables section says the rows are specimens and do not navigate, and
  `#dsTable tbody tr` had its `cursor: pointer` cancelled on that page only — the core rule
  is still right for real product tables.
- **"Included with Pro"** added to profile's Generate footer, in both the static copy and
  the two JS paths that rewrite it.
- **Streak derived from one number.** The solved box now reads "13-day streak · today
  counted", so it no longer looks like it disagrees with profile's 12.

## Optional items — skipped, and why

- **Focus trap on the profile achievement modal.** Skipped. It already sets initial focus and
  closes on Escape; a correct trap means intercepting Tab/Shift+Tab against a live list of
  focusable descendants, and I would rather not land that untested in the last pass of a
  session where I have already touched the modal's neighbours. It is a real gap — it is the
  top of the list next time.
- **Arrow-key navigation for the problem-switcher `role="menu"`.** Skipped for the same
  reason: the honest fix is either full menu keyboard semantics or dropping to
  `role="listbox"`, and both are bigger than the "cheap and clearly right" bar.
- **Heatmap days are hover-only.** Skipped. The container `role="img"` label is a fair
  minimum, as you said, and making 84 cells individually focusable makes the page worse for
  keyboard users, not better. It wants a different design (a summary list), not a patch.
- **First-run auto-opening the trace panel.** Skipped deliberately. Three persistent signposts
  now point at Trace (item 5); opening a panel the user did not ask for on load is the kind
  of thing that reads as clever once and annoying every time after.
- **Renumbering hidden cases 1..n.** Skipped because I think the premise is wrong — see below.

---

## Things the review got wrong or slightly off

1. **Case numbering is already one story.** The review says "pick one story" between global
   test indices and hidden-cases-1..n. The results list and the trace picker both already use
   global indices — "Hidden case 3" is the third test in both places, and clicking
   *Trace this case* on it selects the option labelled "hidden case 3". Renumbering would
   have made the two disagree. Left as is.
2. **The 1.40:1 figure was right and I was wrong to doubt it.** I initially computed the
   violet end against the raw `#7C4DFF`. Against the CTA sweep's lifted `#9E7BFF`,
   `#A7AEBF` is exactly **1.40:1**, and against `#00E5FF` exactly **1.44:1**. Both of your
   numbers reproduce to two decimals.
3. **Everything else in the review reproduced.** The `url(#` stroke, the 559 px header
   minimum, the double-step, the five dead links, the 4.43:1 text-3, the dead Settings link,
   the unread stdin box, the unsaved notes, the three-Tab keyboard trap, the #0A8F5F prose,
   the 3.56:1 kbd hint. I checked each one against the pre-change files before touching them.

## Defects found while fixing these, that the review did not list

- **`profile.html` scrolled sideways at every width.** The two header chips use `.tip`, which
  is positioned `bottom: calc(100% + 8px); left: 50%`. In a sticky top bar that put the
  tooltip *above the viewport* — so those two tooltips never rendered at all — and its layout
  overflow added a permanent **32 px** of horizontal scroll at 1600, 1024 and 375. They now
  hang below the chip and anchor to its right edge. Both tooltips are visible, and
  `window.scrollX` after `scrollTo(700, 0)` is 0 at every width, on every page.
- **`profile.html` scrolled a further 39 px at 375 px**: the 12-week heatmap has a 381 px
  min-content width and the gem ledger rows would not shrink. The heatmap now scrolls inside
  its own card, and the ledger rows have `min-width: 0`.
- **`_src/build.py` was broken.** It pointed `SRC` at `_src/src/`, which does not exist, so
  `python3 build.py` silently skipped all four pages. Fixed, and `OUT` is now derived from
  the script location instead of an absolute path.
- **Three number sets on `profile.html` disagreed with each other** independently of the
  27/64/91 problem — see item 7.

## Known unfixed

- **Terms and Privacy are still not real pages.** They are visibly "soon" instead of
  silently dead, which is what the review allowed, but the phase-2 plan calls them launch
  blockers and a pill does not unblock anything. Same for Changelog.
- **The pages are now ahead of the repo on content.** `packs/federato/` on disk holds 15
  Python + 12 SQL = 27 problems, and `README.md` still says "Loaded 27 problems (15 python,
  12 sql)" and "The shipped `federato` pack is 27 problems". The design now says 32 (20 + 12)
  and 51 language checks, on instruction. Either the pack lands or the README and the pages
  drift apart again — that is the next thing to reconcile, and it is outside `design/`.
- **Trace line numbers are still absolute** (a pre-existing `NOTES.md` risk). Adding the
  comment to line 5 does not change the line count, so the intended path is unaffected.
- **`--c-com` is still 3.35:1.** Unchanged on purpose, now documented as a deliberate trade
  rather than left to look like an oversight.

## What was preserved

Re-driven end to end after every change, and all still working: the trace UX (narration,
changed-variable chips, pin/unpin, the stamped `>>>` console, the return-step comparison on
samples, "Trace this case" from a red test, `T`, play/pause, speeds, the resize grip); the
SQL join-before-grouping trace and its row-diff; the simulator reacting to edited code (fix
the insert order → 8/8 → confetti → +2 gems → `N`); hints decrementing with the price shown
before you spend; the solution gate and "free after solve"; the honest prototype toasts; the
token/focus/reduced-motion discipline; both column gutters; the language switch; the timer;
Format and Reset code. Zero exceptions thrown on any page, in either theme, at any width.

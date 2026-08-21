# Courses

A **pack** is a bag of problems. A **course** is an opinion about the order you should
do them in, and the teaching that goes between them.

Packs answer "what should I practise". Courses answer "what should I do next, and why",
which is the question anyone with a date in the calendar is actually asking.

```
packages/courses/
  course-schema.json                 the format (JSON Schema, draft 2020-12)
  src/types.ts                       the same thing as TypeScript, incl. progress shapes
  validate.mjs                       schema + semantic checks, no dependencies
  *.course.json                      the courses
```

Run the checker:

```
node validate.mjs            # summary + warnings + errors, exit 1 on error
node validate.mjs --json     # machine-readable
```

---

## What is here today

| Course | Modules | Hours | Problems referenced |
|---|---|---|---|
| `interview-sprint` | 6 | 13 | 27 |
| `sql-for-interviews` | 8 | 7.75 | 12 |
| `patterns-that-actually-come-up` | 8 | 10 | 20 |
| `switching-to-python` | 6 | 6.25 | 12 |
| `system-design-foundations` | 8 | 7 | 4 |

Courses overlap on purpose. `interview-sprint` is a five-day compression of material
that `sql-for-interviews` and `patterns-that-actually-come-up` cover properly. Someone
with five days does the sprint; someone with a month does the other two. The problems
are shared; the sequencing and the teaching are not.

---

## The format

### Course

| Field | Required | Notes |
|---|---|---|
| `slug` | yes | kebab-case, stable forever. Top-level progress key and URL segment |
| `title` | yes | short, 3-60 chars |
| `subtitle` | yes | one line, what the course actually covers |
| `audience` | yes | who it is for. **Say who it is not for** - this is the field that stops a course being for everyone and therefore for nobody |
| `level` | no | `foundational` / `intermediate` / `advanced` |
| `estimatedHours` | yes | must agree with the module minutes; the validator warns beyond 15% |
| `timeNote` | no | where the estimate comes from and what makes it longer |
| `prerequisites` | yes | plain-English strings; `[]` means none |
| `prerequisiteCourses` | no | slugs of other courses; validated to exist |
| `outcomes` | yes | observable behaviours, not feelings |
| `tags`, `version` | no | |
| `modules` | yes | ordered; the order is the curriculum |

### Module

| Field | Required | Notes |
|---|---|---|
| `id` | yes | kebab-case, stable forever. **This is the per-module progress key** |
| `title`, `summary` | yes | |
| `estimatedMinutes` | yes | honest working time, including solving the problems |
| `objectives` | no | 3-4 lines, what this module gets you |
| `teaching` | yes | markdown, minimum 400 characters. The lesson |
| `problems` | yes | ordered list of problem refs; may be empty |
| `checkpoint` | yes | questions, see below |
| `completion` | yes | what counts as done |
| `recap` | no | markdown shown after the checkpoint |

### Problem reference

```json
{ "slug": "sql_09_loss_ratio", "note": "Why this problem is here and what to watch for." }
```

`slug` is the problem id exactly as the loader derives it: the filename stem under
`packs/<pack>/{python,sql}/`, e.g. `py_07_merge_intervals`. Ids are unique across packs
(the loader enforces it), so a course never names the pack.

`optional: true` means it does not count towards completion.

### Referencing a problem that does not exist yet

A course is allowed to describe the curriculum it wants, not only the one the library
currently supports. Mark the reference `planned`, make it `optional`, and write the brief:

```json
{
  "slug": "py_19_min_capacity",
  "planned": true,
  "optional": true,
  "note": "Binary search on the answer, with a feasibility check the candidate writes.",
  "plannedSpec": {
    "title": "Smallest capacity to clear the queue in n days",
    "pattern": "binary search on the answer",
    "difficulty": "medium",
    "minutes": 18,
    "brief": "Given daily workloads that must be processed in order and a deadline, find the minimum per-day capacity. Tests naming the monotone predicate and justifying the bounds."
  }
}
```

Two rules the validator enforces, and both matter:

- **A planned problem must be optional.** Otherwise the module cannot be completed with
  the content that exists today, and a course nobody can finish is worse than a shorter
  course.
- **`plannedSpec` is required**, so whoever authors the problem does not have to guess
  what the course author meant. It is a commissioning brief, not a to-do note.

When someone writes the problem, the validator flips to a warning telling you to drop the
`planned` and `optional` flags. That warning is the working backlog: `validate.mjs`
prints the full planned list at the end of every run.

### Checkpoint

```json
{
  "id": "windows-i-checkpoint",
  "title": "Window functions I checkpoint",
  "questions": [
    { "id": "q-filter", "kind": "choice", "prompt": "...",
      "options": ["...", "..."], "answer": 1, "explanation": "why, and why not the others" },
    { "id": "q-dedupe", "kind": "recall", "prompt": "Blank editor: ...",
      "modelAnswer": "the answer, plus what to mark yourself down for" },
    { "id": "q-shape", "kind": "explain", "prompt": "Out loud: ...",
      "modelAnswer": "what a good answer contains" }
  ]
}
```

Three kinds, because three different things are being tested:

- **`choice`** - auto-graded. Use it for the specific misconception the module exists to
  fix. The `explanation` is required and should say why the wrong options are wrong; it is
  teaching, not a mark.
- **`recall`** - "blank editor, from memory". Self-graded against `modelAnswer`. This is
  the one that actually predicts interview performance, because reading a template and
  reproducing it are unrelated skills.
- **`explain`** - "say this out loud". Self-graded. For the sentences that get scored in a
  round: naming the grain, stating a complexity, recovering from a forgotten method name.

The checkpoint holds the questions. The **bar** lives in `completion`, so you can change
the difficulty of passing without touching the content.

### Completion

```json
{ "rule": "all-required-problems", "requireCheckpoint": true, "checkpointPassScore": 0.75 }
```

| `rule` | Done when |
|---|---|
| `all-required-problems` | every non-optional problem is solved |
| `min-problems` | any `minProblemsSolved` of the module's problems are solved |
| `checkpoint-only` | no problems needed; the checkpoint is the bar |
| `self-attested` | the learner ticks it off - reading, drawing, speaking practice |

Plus `requireCheckpoint` (default true) and `checkpointPassScore` (0-1, default 0.8).

`self-attested` is not a loophole. Some of the most valuable work in these courses -
drawing a diagram from memory, running a mock out loud, playing back a recording - cannot
be graded by a machine, and pretending otherwise would push courses towards only the
things that are easy to measure.

---

## How progress works

Progress lives **outside** the course, keyed by `course.slug` then `module.id`:

```jsonc
{
  "sql-for-interviews": {
    "version": 1,
    "startedAt": "2026-08-19T18:02:11Z",
    "modules": {
      "grain-joins-and-count": {
        "completedAt": "2026-08-19T19:40:02Z",
        "solved": ["sql_01_appetite_join", "sql_02_broker_conversion"],
        "checkpoint": { "at": "2026-08-19T19:39:50Z", "score": 1.0, "answers": { "q-count": { "correct": true } } }
      },
      "filtering-and-dates": { "startedAt": "2026-08-20T09:12:00Z", "solved": [] }
    }
  }
}
```

Consequences of that separation, all of them deliberate:

- **A course can be edited underneath a learner** without invalidating their progress.
  Adding a module leaves the completed ones completed. This is why `slug` and `id` must
  never be renamed - renaming a module id silently resets it. Add a new module instead.
- **Problem-solved state is shared with the pack, not owned by the course.** If the app
  already knows you solved `sql_04_dedupe_submissions`, the course should show it as
  solved. A course is a view over the problem library, not a copy of it. Where the same
  problem appears twice on purpose - the SQL course's final module re-solves two queries
  from a blank editor - a UI that wants to force a genuine re-solve should track it per
  module, which the per-module `solved` array allows.
- **Only the latest checkpoint attempt is kept.** Attempt history is not interesting; the
  current state is.

### Deriving module state

```
locked       previous module incomplete, if the UI enforces sequence
available    previous module complete (or it is the first)
in-progress  something solved or attempted, criteria not yet met
complete     completion rule satisfied
```

Sequence enforcement is a UI decision, not a schema one. The recommendation is to show
the order strongly and lock nothing: someone revising for a round on Friday should be
able to jump to the window functions module without solving eight problems first.

A course is complete when every module is. There is no separate course-level rule, on
purpose - one place to change the bar.

---

## Authoring a course

1. **Decide who it is not for.** If you cannot finish the sentence "this is too slow for
   someone who ...", the course has no shape yet.
2. **List the modules before writing any of them.** Six to eight is the working range.
   Fewer and a module is really three modules; more and the course is a problem list with
   headings.
3. **Assign the problems first, then write the teaching around them.** The teaching exists
   to make the next problem solvable and the last one make sense. Teaching written first
   drifts into a general essay on the topic.
4. **Write the teaching concretely.** The bar is set by `docs/study-plan.md` and
   `docs/ruby-to-python.md`: name the trap, show the line, say what happens when you get it
   wrong, and say what an interviewer is listening for. "Understand joins" is not teaching.
   "In the WHERE it filters after the join, so unmatched rows have a NULL status and get
   dropped - your LEFT JOIN is now an INNER JOIN" is.
5. **Write the checkpoint against the misconception**, not against the material. A good
   `choice` question is one where a competent person who skipped the module picks the
   wrong option.
6. **Be honest about time.** `estimatedMinutes` should include solving the problems at
   roughly one and a half times their target time, plus the reading. The validator warns
   if the total drifts more than 15% from `estimatedHours`.
7. **Run `node validate.mjs`.** Fix errors; read the warnings.

### House style

- British-neutral, plain, concrete. No marketing voice.
- Second person. "You will" rather than "the candidate should".
- Opinionated where there is a right answer, honest where there is not. "Recommend
  orchestration, and then say the cost" beats a neutral comparison table on its own.
- No claims about what any named company asks. Courses are about skills and patterns.
  Reported round *shapes* are fine; specific questions attributed to a specific company
  are not, for the reasons in `packs/companies/README.md`.
- Markdown in `teaching` supports headings, lists, tables, fenced code and inline code.

---

## What the validator checks

**Schema** - every course against `course-schema.json`, using a small built-in JSON Schema
subset (types, enums, required, `additionalProperties`, items, lengths, ranges, patterns,
`$ref`, `allOf`, `if`/`then`). No dependencies, so it runs in a bare checkout and in CI.

**Semantics** - the rules a schema cannot express:

- every referenced problem slug exists in `packs/`, unless marked `planned`
- planned problems are optional, and carry a `plannedSpec`
- a problem marked planned that now exists produces a warning
- module ids and checkpoint question ids are unique; course slugs are unique
- `choice` answers index a real option
- `min-problems` does not require more problems than exist
- `all-required-problems` is not used by a module with no required problems
- `prerequisiteCourses` resolve, and no course requires itself
- `estimatedHours` agrees with the module minutes to within 15%

It also reports any problem in `packs/` that no course uses, which is the other half of
the coverage question.

---

## Open work

  merging two sorted feeds, interval insertion, binary search on the answer, and a 2D grid
  DP. All are marked optional, so the courses work without them; the two-pointers module is
  the thinnest as a result.
- No JavaScript or Ruby course yet. When the problem format v2 in `docs/multi-language.md`
  lands, `switching-to-python` is the template for `switching-to-javascript`, and the
  language-neutral courses should gain a way to express "this module in your language".
- The web app renders these at `/courses`, `/courses/<slug>` and
  `/courses/<slug>/<module>`: teaching, then the problem list with solved state pulled
  from the learner's attempts, then the checkpoint, then the completion rule.
  `apps/web/scripts/import-courses.mjs` loads the JSON into the `courses` table and runs
  `validate.mjs` first, so a course that fails validation never reaches the database.
  Progress lives in `course_progress`, keyed by course slug and module id exactly as
  described above.

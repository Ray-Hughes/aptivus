# Company research dataset

`companies.json` is a sourced dataset describing what specific companies actually
test in their technical-interview loops: round structure, languages, SQL usage,
algorithm/data-structure patterns, system design topics, difficulty calibration,
and quirks. It exists so Aptivus can point a user at practice content shaped like
their *actual* upcoming interview, instead of a generic grab-bag.

It is research, not a problem pack. It does not contain any code problems itself —
it is an input that a human (or an agent) reads before writing a company-flavored
`packs/<company>/` pack, the way `docs/federato-research.md` fed `packs/federato/`.

## Legal position: original problems only, never copied questions

This is the load-bearing rule for the whole dataset, so it is worth stating plainly:

**Nothing in this file is, or should ever become, a verbatim interview question.**

Interview questions reported by candidates are frequently covered by candidate NDAs,
and a specific question as posed by a company is that company's content, not ours.
Copying it — even a close paraphrase — is both a legal risk and beside the point:
what a practice product actually needs isn't *the* question, it's the *skill* the
question was built to test.

So every record here captures the **shape** of a company's process and the
**pattern** each round draws on, described abstractly enough to write a brand-new
problem from scratch:

- Good: `"top-N per group with a tie-break"`, `"sliding window over a stream"`,
  `"interval merging"`, `"recursive CTE over a hierarchy"`.
- Not allowed: the actual prompt text, even summarized closely enough that it's
  recognizably the same problem a candidate would recognize from their interview.

Where a source quoted a specific question, the researcher was instructed to
translate it into its underlying pattern before recording it — see the Federato
record's `system_design.notes` for an example of that translation happening
explicitly. If you add a company and a source hands you exact question text,
do the same: extract the pattern, discard the wording.

**When building a pack from this data:** write original problems that teach the
pattern in a fresh scenario (different domain, different variable names, different
edge cases) — the same discipline the `federato` pack already follows (see
`docs/federato-research.md` and `packs/federato/`). Never reconstruct a pack problem
to match a specific reported question closely enough that a candidate who saw the
real thing would recognize it.

## File structure

```
packs/companies/
  companies.json   # the dataset — one object per company, plus a schema header
  README.md        # this file
```

## `companies.json` schema

Top level:

| Field | Meaning |
|---|---|
| `schema_version` | Semver-ish string for the record shape. Bump the minor version if you add a field, major if you change the meaning of an existing one. |
| `generated_at` | Date the dataset was last assembled/merged. |
| `description` | One-paragraph purpose statement. |
| `legal_note` | Short version of the legal position above — kept in the data file itself so it travels with the JSON even if someone reads it apart from this README. |
| `confidence_scale` | Defines what `high` / `medium` / `low` mean for the `confidence` field below. |
| `companies` | Array of company records (schema below), Federato first, then alphabetical. |

Each entry in `companies`:

| Field | Meaning |
|---|---|
| `name` | Display name. |
| `slug` | Lowercase-hyphenated id, matches (or will match) the eventual `packs/<slug>/` directory name. |
| `industry` | Short industry descriptor. |
| `size` | Rough headcount, with the source basis noted inline (e.g. "as of mid-2026, Tracxn estimate") — `"unknown"` if it couldn't be sourced. |
| `confidence` | `"high"`, `"medium"`, or `"low"` — see `confidence_scale` in the file header. Rates the sourcing quality for the record *as a whole*; individual fields can still be `"unknown"` even in a high-confidence record. |
| `loop.summary` | One or two sentence overview of the full pipeline (recruiter screen through offer). |
| `loop.rounds[]` | Ordered list of `{name, duration_minutes, covers, format}`. `duration_minutes` is `null` or `"unknown"` when not reported. |
| `languages.permitted` | Languages candidates are reported to be able to use; `languages.notes` for constraints (e.g. "Python preferred", "any language, but interviewer must know it"). |
| `sql.present` | `true` / `false` / `"unknown"`. |
| `sql.weight` | `"none"` / `"light"` / `"moderate"` / `"heavy"` / `"unknown"`. |
| `patterns[]` | The DS&A / SQL **patterns** reported or well-corroborated for this company, in pattern language (see Legal position above) — never question text. |
| `system_design.applicable` | Whether a system design round exists at all (and at what level, in `notes`, if level-gated). |
| `system_design.topics[]` | Topic/category list, same pattern-not-prompt rule as `patterns[]`. |
| `difficulty.skew` | Overall difficulty calibration, e.g. `"medium-hard"`. |
| `quirks[]` | Distinctive process facts: AI-tool policy, take-homes, pairing format, whiteboard vs. editor, async/remote-first process, etc. |
| `sources[]` | `{url, type, note}` — `type` is `"primary"` (company-authored: engineering blog, official careers/interview-prep page, public handbook) or `"secondary"` (Glassdoor, Levels.fyi, Blind, third-party interview-prep sites). 3–8 per company. |
| `unknowns[]` | Explicit list of things that could not be verified. This is a required field, not an afterthought — see "Why `unknown` beats a guess" below. |
| `last_verified` | Date this record's research was done/updated. |

## Why `unknown` beats a guess

This dataset feeds content generation. A plausible-sounding fabricated detail is
worse than useless here — it will get baked into a practice pack and teach someone
the wrong shape of their actual interview with total confidence. Every record in
this file was produced under one instruction: **if you can't verify it, write
`"unknown"` and say so in `unknowns[]`, don't guess.** Several records reflect that
directly — e.g. Federato's `patterns[]` are marked as unconfirmed because candidate
reports only said "SQL questions, LeetCode questions" generically, without naming
which algorithmic categories; the more specific pattern list in `packs/federato/`
is the pack author's domain-informed inference, not a candidate-confirmed fact, and
the two are kept distinct on purpose.

Treat a `"medium"` or `"low"` confidence record, or a long `unknowns[]` list, as a
signal to research further before leaning on it heavily — not as a defect in the
dataset.

## Confidence summary

| Company | Industry | Confidence |
|---|---|---|
| Federato | insurtech / P&C insurance RiskOps | medium |
| Amazon | big tech / e-commerce, cloud (AWS), advertising | **high** |
| Anthropic | AI research / foundation models | medium |
| Databricks | data + AI infrastructure / lakehouse | medium |
| Datadog | cloud monitoring / observability | medium |
| GitLab | DevSecOps / DevOps platform | **high** |
| Google | big tech / search, ads, cloud | medium |
| Meta | big tech / social, ads, AR-VR | medium |
| Microsoft | big tech / cloud, productivity, devices | medium |
| Notion | productivity / collaboration software | medium |
| OpenAI | AI research / foundation models | medium |
| Plaid | fintech / financial data aggregation | medium |
| Ramp | fintech / corporate cards & spend management | medium |
| Rippling | HR / payroll / IT SaaS | medium |
| Stripe | fintech / payments infrastructure | medium |

13 of 15 companies land at `medium` — none of them have a public, first-party
"here is exactly how our interview works" page with round-by-round detail, so
records lean on corroborating secondary sources (interview-prep sites, aggregated
candidate reports) alongside whatever primary job-posting/careers-page detail exists.
Amazon and GitLab are the two `high`-confidence records: Amazon publishes detailed
OA/onsite structure and its Bar Raiser program on its own careers pages, and GitLab's
famously public company handbook documents its technical interview format directly.
No company currently rates `low` overall, though most records carry a non-trivial
`unknowns[]` list — read those before treating any single field as settled fact.

A general note on sourcing: Glassdoor blocks automated fetching (`403` on direct
fetch) for essentially every company. Where Glassdoor is cited, the `sources[]`
entry says so explicitly and the claim is sourced from search-result snippets only,
not a fetched page — treat those specific claims as second-hand.

## How to add a company

1. Research it the way this dataset was built: prefer the company's own engineering
   blog, official careers/interview-prep pages, and job postings (primary). Use
   Glassdoor/Levels.fyi/Blind/third-party interview-prep guides as backup
   (secondary), and note when a source blocked automated fetching.
2. Follow the **legal position** above: never record question text, only patterns
   and topic categories.
3. Fill in every field in the schema table. If you can't verify something, put
   `"unknown"` in the field and add a line to `unknowns[]` explaining what's
   missing — don't leave the field absent and don't guess a plausible value.
4. Set `confidence` honestly using `confidence_scale` in the file header as the
   rubric, not vibes.
5. Add the object to the `companies` array (Federato stays first; keep the rest
   alphabetical by `name`), bump `generated_at`, and validate the file parses:
   ```
   python3 -m json.tool packs/companies/companies.json > /dev/null
   ```
6. Update the confidence summary table in this README.
7. If you're going on to build a practice pack from the record, follow the
   `packs/federato/` pattern: original problems in the company's domain vocabulary
   that teach the reported patterns, with a `pack.json` describing the source.

## Sources

Sources live per-company in each record's `sources[]` array rather than in one
combined list here, since they're tied to specific claims (loop structure vs.
languages vs. patterns can each have different sourcing strength for the same
company). See `companies.json`.

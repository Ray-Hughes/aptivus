# Writing problems

A problem is one Python file exporting a `PROBLEM` dict, dropped in
`packs/<pack>/python/` or `packs/<pack>/sql/`. The server picks it up on restart.

Files starting with `_` are ignored, so shared helpers like `_core.py` live alongside
problems safely.

**Problem ids must be unique across all packs.** The id defaults to the filename without
`.py`. The loader warns and skips duplicates.

Run `./whetstone verify` after adding anything. It executes every reference solution
against its own tests and fails loudly if one does not pass.

---

## Common fields

| Field | Required | Notes |
|---|---|---|
| `title` | yes | Shown in the list and the solve pane |
| `difficulty` | yes | `easy` / `medium` / `hard` |
| `pattern` | yes | Short label, e.g. `sliding window`, `anti-join`. Shown as a column and searchable |
| `tags` | no | List of strings, searchable |
| `minutes` | no | Target time, default 15. Be honest - it is what the learner paces against |
| `prompt` | yes | Markdown. Supports `###` headings, `-` bullets, fenced code, `` `code` ``, `**bold**` |
| `hints` | no | List, revealed one at a time. Write three: a nudge, a bigger nudge, and almost-the-answer |
| `solution` | yes | Reference solution as a string |
| `complexity` | no | Shown under the solution |
| `explanation` | no | Markdown, shown with the solution. This is where the teaching happens |
| `followups` | no | List. Shown on the problem, since knowing what comes next is half the value |
| `id` | no | Defaults to filename stem |

## Python problems

```python
"mode": "function",     # or "stdin"
"func": "find_pair",    # the function name the harness will call
"starter": "def find_pair(premiums, target):\n    pass\n",
"tests": [
    {"args": [[2500, 7500], 10000], "expected": [0, 1], "sample": True},
    {"args": [[], 0], "expected": []},
],
```

- `args` is a list of positional arguments; each is deep-copied before the call, so a
  solution that mutates its input cannot corrupt later tests.
- `expected` is compared after a JSON round trip. Sets become sorted lists and tuples
  become lists, so return either freely.
- Floats compare with a 1e-6 tolerance.
- `"sample": True` marks a test as visible in the problem statement and included in
  **Run Code**. Everything runs on **Submit**.
- `"unordered": True` on a test (or on the problem) compares lists ignoring order.

For `"mode": "stdin"`, drop `func` and `args`; each test is
`{"stdin": "4\nMarsh 1500\n...", "expected": "Marsh 1500"}` and stdout is compared after
stripping surrounding whitespace.

Everything runs in a subprocess with an 8-second timeout.

## SQL problems

```python
"schema": SCHEMA,        # CREATE TABLE statements
"seed":   SEED,          # INSERT statements
"solution": "SELECT ...",
"ordered": True,         # does row order matter?
```

Each run creates a fresh in-memory SQLite database, executes `schema` then `seed`, then
runs the learner's query and the reference query and diffs the rows. Floats round to 6
decimal places; when `ordered` is false, both sides are sorted before comparison.

The UI shows the schema and a preview of every seeded table automatically - you do not
have to write the data out in the prompt.

`ATTACH` and `PRAGMA` are rejected.

Share a schema across a pack by putting it in `_core.py` and importing it:

```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _core import SCHEMA, SEED
```

## What makes a problem good here

The bar is not "is it a valid puzzle". It is **would this teach someone something they
can use in a real round**.

- **Say why the problem is asked.** A `### Why this one` section in the prompt is a
  convention worth keeping. "This is Two Sum, the most likely warm-up in a 45 minute
  round" tells the learner how much to care.
- **Put the trap in the tests.** Capacity 0 for an LRU cache. An empty input. A tie that
  has to break a specific way. If the interesting failure mode is not in the tests,
  the problem does not teach it.
- **Write the explanation for someone coming from another language.** The shipped pack
  targets Ruby developers moving to Python and calls out the specific places their
  instinct is wrong. Adapting that to your audience is most of the value.
- **Follow-ups matter.** Interviewers rarely stop at the first working solution. Listing
  what they ask next is often more useful than the solution itself.

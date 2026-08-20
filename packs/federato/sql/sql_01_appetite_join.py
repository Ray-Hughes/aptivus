import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _core import SCHEMA, SEED

PROBLEM = {
    "title": "Submissions by appetite tier",
    "difficulty": "easy",
    "pattern": "LEFT JOIN + GROUP BY",
    "tags": ["join", "group by", "coalesce"],
    "minutes": 12,
    "schema": SCHEMA,
    "seed": SEED,
    "ordered": True,
    "prompt": """
Every submission has a line of business, and the account it belongs to has a state.
The `appetite` table says whether that (line_of_business, state) combination is
`target`, `neutral` or `avoid`.

Report how many submissions fall into each tier. Combinations with **no row in
appetite at all** must appear as `unclassified` -- do not silently drop them.

Columns: `tier`, `submission_count`.
Order by `submission_count` descending, then `tier` ascending.

### Why this one
It looks like a plain join, but the whole point is that an INNER JOIN here quietly
loses two submissions and gives you a wrong total. Notice it, and say so.
""",
    "starter": "-- 24 submissions in total. Your counts must still add up to 24.\nSELECT\n",
    "hints": [
        "Chain: submissions -> accounts (for the state) -> appetite (on line_of_business AND state).",
        "The appetite join must be a LEFT JOIN, otherwise submissions with no matching appetite row vanish.",
        "COALESCE(a.tier, 'unclassified') turns the NULL from an unmatched LEFT JOIN into a label.",
    ],
    "solution": """
SELECT COALESCE(ap.tier, 'unclassified') AS tier,
       COUNT(*)                          AS submission_count
FROM submissions s
JOIN accounts acc ON acc.account_id = s.account_id
LEFT JOIN appetite ap
       ON ap.line_of_business = s.line_of_business
      AND ap.state            = acc.state
GROUP BY 1
ORDER BY submission_count DESC, tier ASC;
""",
    "explanation": """
### The multi-column join
`appetite` has a composite key, so both columns go in the ON clause joined with `AND`.
Joining on only one of them is the most common wrong answer, and it silently
multiplies your row count instead of raising an error.

### GROUP BY 1
SQLite and Postgres let you group by output column position. It is convenient, but say
"I would spell it out in production" if the interviewer looks skeptical.

### Sanity check every aggregate
Run `SELECT COUNT(*) FROM submissions` first, then check your groups sum back to it.
Doing that out loud is one of the strongest signals you can send in a SQL round.
""",
    "followups": [
        "Add each tier's share of total submissions as a percentage.",
        "Break it down by line of business as well.",
        "How would the answer change with an INNER JOIN, and why is that wrong here?",
    ],
}

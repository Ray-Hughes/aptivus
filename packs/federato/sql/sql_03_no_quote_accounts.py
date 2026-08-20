import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _core import SCHEMA, SEED

PROBLEM = {
    "title": "Accounts that submitted but never got a quote",
    "difficulty": "easy",
    "pattern": "anti-join",
    "tags": ["anti join", "not exists", "left join null"],
    "minutes": 10,
    "schema": SCHEMA,
    "seed": SEED,
    "ordered": True,
    "prompt": """
Find every account that has at least one submission but has **never** received a quote
on any of them.

Columns: `account_name`, `submission_count`.
Order by `account_name`.

### Why this one
"Rows in A with nothing in B" is the anti-join. There are three ways to write it and
one of them is a trap that returns a silently empty result.
""",
    "starter": "SELECT\n",
    "hints": [
        "Three forms: LEFT JOIN ... WHERE right IS NULL, NOT EXISTS, or NOT IN. Know all three; prefer NOT EXISTS.",
        "The account must have zero quotes across ALL of its submissions, not just the one row you joined to.",
        "NOT IN with a subquery that can produce NULL returns zero rows. NOT EXISTS does not have that problem.",
    ],
    "solution": """
SELECT a.account_name,
       COUNT(s.submission_id) AS submission_count
FROM accounts a
JOIN submissions s ON s.account_id = a.account_id
WHERE NOT EXISTS (
    SELECT 1
    FROM quotes q
    JOIN submissions s2 ON s2.submission_id = q.submission_id
    WHERE s2.account_id = a.account_id
)
GROUP BY a.account_id, a.account_name
ORDER BY a.account_name;
""",
    "explanation": """
### Why NOT EXISTS beats NOT IN
`WHERE x NOT IN (SELECT y FROM t)` returns **no rows at all** if any `y` is NULL,
because `x <> NULL` evaluates to UNKNOWN rather than TRUE. It is a silent wrong answer,
not an error. `NOT EXISTS` is NULL-safe and usually plans at least as well. Saying this
out loud signals real SQL experience.

### The LEFT JOIN form, for comparison
```
FROM accounts a
JOIN submissions s  ON s.account_id = a.account_id
LEFT JOIN quotes q  ON q.submission_id = s.submission_id
GROUP BY a.account_id, a.account_name
HAVING COUNT(q.quote_id) = 0
```
Also correct, and HAVING COUNT(...) = 0 is a clean way to express "none of them".

### Careful with the correlation
The subquery correlates on `account_id`, not `submission_id`. Correlating on the
submission would find accounts with *some* unquoted submission, which is a different
question entirely. Read the requirement twice before writing.
""",
    "followups": [
        "Now find accounts that were quoted but never bound.",
        "Add days since their most recent submission.",
        "Write it with a LEFT JOIN instead, and say which version you would ship.",
    ],
}

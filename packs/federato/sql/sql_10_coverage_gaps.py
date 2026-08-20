import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _core import SCHEMA, SEED

PROBLEM = {
    "title": "Find gaps in an account's coverage",
    "difficulty": "hard",
    "pattern": "LAG / compare to previous row",
    "tags": ["window function", "lag", "dates", "cte"],
    "minutes": 18,
    "schema": SCHEMA,
    "seed": SEED,
    "ordered": True,
    "prompt": """
An account should be continuously covered: each policy's `effective_date` should be on
or before the previous policy's `expiration_date`.

Find every gap. For each one report the account, when cover lapsed, when it resumed,
and how many days were uncovered.

Columns: `account_name`, `gap_start` (previous expiration_date), `gap_end`
(next effective_date), `gap_days`.
Order by `account_name`.

Only consecutive policies for the **same account** count, ordered by `effective_date`.

### Why this one
"Compare each row to the previous one" is what LAG is for, and once you see it you stop
writing self-joins for this shape. It is also a real compliance question in insurance,
so it doubles as domain fluency.
""",
    "starter": "-- Expect 2 accounts with a gap.\nWITH ordered AS (\n\n)\nSELECT\n",
    "hints": [
        "LAG(expiration_date) OVER (PARTITION BY account_id ORDER BY effective_date) gives you the previous policy's expiry on the same row.",
        "The first policy per account has a NULL LAG. That is not a gap -- filter it out.",
        "A gap exists when prev_expiration < effective_date. Equal dates mean the new policy picks up exactly where the old one ended: no gap.",
        "Day count in SQLite: CAST(julianday(effective_date) - julianday(prev_expiration) AS INTEGER).",
    ],
    "solution": """
WITH ordered AS (
    SELECT p.account_id,
           p.effective_date,
           LAG(p.expiration_date) OVER (
               PARTITION BY p.account_id
               ORDER BY p.effective_date, p.policy_id
           ) AS prev_expiration
    FROM policies p
)
SELECT a.account_name,
       o.prev_expiration AS gap_start,
       o.effective_date  AS gap_end,
       CAST(julianday(o.effective_date) - julianday(o.prev_expiration) AS INTEGER) AS gap_days
FROM ordered o
JOIN accounts a ON a.account_id = o.account_id
WHERE o.prev_expiration IS NOT NULL
  AND o.prev_expiration < o.effective_date
ORDER BY a.account_name;
""",
    "explanation": """
### LAG and LEAD
```
LAG(col, 1, default) OVER (PARTITION BY g ORDER BY d)   -- the row before
LEAD(col, 1, default) OVER (PARTITION BY g ORDER BY d)  -- the row after
```
Anything phrased as "compared to the previous", "since last time", "the change from"
is a LAG. Before window functions you needed a self-join on `rank = rank - 1`, which is
slower and much easier to get wrong. If an interviewer asks for month-over-month growth,
this is the answer.

### The NULL from the first row
The earliest policy per account has no predecessor, so LAG returns NULL. `NULL < x` is
UNKNOWN, so the WHERE clause already excludes it -- but write `IS NOT NULL` explicitly
anyway. Depending on implicit NULL behaviour to filter is how you end up with a bug that
only shows on a Tuesday.

### The off-by-one nobody asks about
Is a policy expiring 2026-01-01 and the next starting 2026-01-01 a gap of zero days, or
is there one uncovered day? It depends whether the expiration date is inclusive or
exclusive -- and in real insurance data it varies by carrier. **Ask this question.**
For a Forward Deployed Engineer role, catching that ambiguity is the point of the problem.
""",
    "followups": [
        "Also flag overlaps, where the next policy starts before the previous expires.",
        "Report total uncovered days per account rather than one row per gap.",
        "Do it without LAG, using a self-join. Then say which you would ship.",
    ],
}

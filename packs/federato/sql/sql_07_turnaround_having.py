import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _core import SCHEMA, SEED

PROBLEM = {
    "title": "Underwriters with slow quote turnaround",
    "difficulty": "medium",
    "pattern": "HAVING on a computed aggregate",
    "tags": ["having", "dates", "aggregate", "join"],
    "minutes": 14,
    "schema": SCHEMA,
    "seed": SEED,
    "ordered": True,
    "prompt": """
Turnaround is the number of days between a submission's `received_at` and its quote's
`quoted_at`. Only quoted submissions have a turnaround.

Find underwriters whose **average turnaround is 7 days or more**.

Columns: `uw_name`, `quotes_issued`, `avg_days` (rounded to 2 decimals).
Order by `avg_days` descending, then `uw_name`.

### Why this one
WHERE versus HAVING is the most reliable way an interviewer checks whether you actually
understand how a GROUP BY executes. Getting it right without hesitating matters.
""",
    "starter": "SELECT\n",
    "hints": [
        "SQLite date difference: julianday(quoted_at) - julianday(received_at) gives days as a float.",
        "You cannot put an aggregate in WHERE. Filtering on AVG(...) means HAVING, which runs after grouping.",
        "Only submissions that actually have a quote should count -- an INNER JOIN to quotes does that for you.",
    ],
    "solution": """
SELECT u.uw_name,
       COUNT(*) AS quotes_issued,
       ROUND(AVG(julianday(q.quoted_at) - julianday(s.received_at)), 2) AS avg_days
FROM underwriters u
JOIN submissions s ON s.uw_id = u.uw_id
JOIN quotes q      ON q.submission_id = s.submission_id
GROUP BY u.uw_id, u.uw_name
HAVING AVG(julianday(q.quoted_at) - julianday(s.received_at)) >= 7
ORDER BY avg_days DESC, u.uw_name;
""",
    "explanation": """
### WHERE vs HAVING, the one-line version
**WHERE filters rows before grouping. HAVING filters groups after.**

"Submissions received this year" is a WHERE. "Underwriters averaging over 7 days" is a
HAVING. They compose freely, and a query with both is normal:
```
WHERE s.received_at >= '2026-01-01'      -- which rows go into the groups
GROUP BY u.uw_id
HAVING AVG(...) >= 7                     -- which groups survive
```

### Repeating the expression in HAVING
Most engines will not let you write `HAVING avg_days >= 7` using the SELECT alias,
because SELECT is evaluated after HAVING. SQLite and MySQL are lenient; Postgres is not.
Repeating the expression always works. If it gets ugly, compute it in a CTE and filter
in an outer WHERE -- that is the portable, readable answer.

### Why INNER JOIN is right here
An underwriter who never quoted anything has no turnaround, not a turnaround of zero.
Averaging in a zero would be actively misleading. Say that out loud: choosing INNER vs
LEFT deliberately, and explaining why, is exactly the judgment being assessed.
""",
    "followups": [
        "Report the median instead of the mean. (Much harder in SQL -- percentile functions, or ROW_NUMBER plus a count.)",
        "Add p90 turnaround.",
        "Exclude weekends from the day count.",
    ],
}

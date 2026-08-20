import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _core import SCHEMA, SEED

PROBLEM = {
    "title": "Broker bind rate, including brokers with nothing",
    "difficulty": "medium",
    "pattern": "LEFT JOIN + conditional aggregate",
    "tags": ["join", "aggregate", "nullif", "case"],
    "minutes": 15,
    "schema": SCHEMA,
    "seed": SEED,
    "ordered": True,
    "prompt": """
For **every** broker -- including ones who have submitted nothing -- report:

- `broker_name`
- `submission_count`
- `bound_count` (submissions with status `bound`)
- `bind_rate_pct`: bound / total as a percentage rounded to 1 decimal, or NULL when
  the broker has no submissions

Order by `bind_rate_pct` descending, then `broker_name` ascending.

### Why this one
Two traps in one question: brokers with zero submissions disappear under an INNER JOIN,
and then you divide by zero. Both are things you hit in real customer dashboards.
""",
    "starter": "-- There are 8 brokers. Your result must have 8 rows.\nSELECT\n",
    "hints": [
        "Start FROM brokers and LEFT JOIN submissions, not the other way round. The table you must not lose rows from goes on the left.",
        "Count conditionally with SUM(CASE WHEN s.status = 'bound' THEN 1 ELSE 0 END).",
        "COUNT(*) counts the LEFT JOIN's phantom row, giving 1 for a broker with nothing. Use COUNT(s.submission_id) -- COUNT of a column skips NULLs.",
        "Guard the division with NULLIF(denominator, 0): it turns 0 into NULL, making the whole expression NULL instead of an error.",
    ],
    "solution": """
SELECT b.broker_name,
       COUNT(s.submission_id)                              AS submission_count,
       SUM(CASE WHEN s.status = 'bound' THEN 1 ELSE 0 END) AS bound_count,
       ROUND(100.0 * SUM(CASE WHEN s.status = 'bound' THEN 1 ELSE 0 END)
             / NULLIF(COUNT(s.submission_id), 0), 1)       AS bind_rate_pct
FROM brokers b
LEFT JOIN submissions s ON s.broker_id = b.broker_id
GROUP BY b.broker_id, b.broker_name
ORDER BY bind_rate_pct DESC, b.broker_name ASC;
""",
    "explanation": """
### COUNT(*) vs COUNT(column)
The single most useful SQL fact for interviews:
- `COUNT(*)` counts rows, including the all-NULL row a LEFT JOIN manufactures.
- `COUNT(col)` counts rows where `col IS NOT NULL`.

Marsh Pacific North has no submissions. `COUNT(*)` reports 1, which is a lie.
`COUNT(s.submission_id)` reports 0, which is the truth.

### The 100.0
Integer division. Write `100.0` rather than `100` and the whole expression becomes
float. Do it reflexively; this is the most common silent wrong answer in SQL rounds.

### NULL sorting
SQLite and Postgres sort NULL as smallest, so `ORDER BY bind_rate_pct DESC` puts the
NULL broker last. Postgres lets you say `NULLS LAST` explicitly. MySQL sorts NULLs
first ascending. Worth one clarifying question about which engine they use.
""",
    "followups": [
        "Weight it by premium rather than submission count.",
        "Restrict to submissions from the last 90 days.",
        "Exclude brokers with fewer than 3 submissions, since the rate is noise. (HAVING.)",
    ],
}

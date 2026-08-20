import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _core import SCHEMA, SEED

PROBLEM = {
    "title": "Monthly submission and bind trend",
    "difficulty": "easy",
    "pattern": "date bucketing",
    "tags": ["dates", "group by", "case"],
    "minutes": 12,
    "schema": SCHEMA,
    "seed": SEED,
    "ordered": True,
    "prompt": """
Report, per calendar month of `received_at`:

- `month` as `YYYY-MM`
- `submissions`
- `bound`
- `bind_rate_pct`, rounded to 1 decimal

Order chronologically.

### Why this one
Every reporting question is a date-bucketing question. Know how to truncate a date to
a month in whichever engine is in front of you, and know why sorting `'YYYY-MM'` as a
string happens to be safe.
""",
    "starter": "SELECT\n",
    "hints": [
        "SQLite: strftime('%Y-%m', received_at). Postgres: to_char(received_at,'YYYY-MM') or date_trunc('month', ...). MySQL: DATE_FORMAT(received_at,'%Y-%m').",
        "You can GROUP BY the same expression you SELECT, or GROUP BY 1 for the first output column.",
        "Same conditional-count and NULLIF ideas as the broker bind rate problem.",
    ],
    "solution": """
SELECT strftime('%Y-%m', received_at)                       AS month,
       COUNT(*)                                             AS submissions,
       SUM(CASE WHEN status = 'bound' THEN 1 ELSE 0 END)    AS bound,
       ROUND(100.0 * SUM(CASE WHEN status = 'bound' THEN 1 ELSE 0 END)
             / COUNT(*), 1)                                 AS bind_rate_pct
FROM submissions
GROUP BY 1
ORDER BY 1;
""",
    "explanation": """
### Why ordering by the string works
`'2026-01' < '2026-02' < '2026-10'` lexicographically, because the format is fixed-width
and zero-padded, big-endian. That is the entire reason ISO 8601 is worth insisting on.
Format it as `'01/2026'` and your sort silently breaks -- a genuinely common production bug.

### Engine differences worth naming out loud
- SQLite: `strftime('%Y-%m', d)`, `date(d, '+1 month')`, `julianday(a) - julianday(b)`
- Postgres: `date_trunc('month', d)`, `d + interval '1 month'`, `age(a, b)` or `a - b`
- MySQL: `DATE_FORMAT(d, '%Y-%m')`, `DATE_ADD(d, INTERVAL 1 MONTH)`, `DATEDIFF(a, b)`

If HackerRank hands you a MySQL pad, say "I will use MySQL date functions -- in Postgres
this would be date_trunc". Naming the difference reads as experience, not hedging.

### The gap problem
This query only returns months that HAVE submissions. If March had none, March simply
disappears from the chart, which stakeholders read as a data outage. The fix is a
calendar/date-spine table LEFT JOINed to your data. Mention it -- it is a real,
frequently-missed reporting bug and a great thing to raise unprompted.
""",
    "followups": [
        "Add a month-over-month change column. (LAG over the monthly totals.)",
        "Produce a row for every month in the range even when there are no submissions.",
        "Bucket by week instead of month.",
    ],
}

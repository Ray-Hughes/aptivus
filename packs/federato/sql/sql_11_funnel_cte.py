import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _core import SCHEMA, SEED

PROBLEM = {
    "title": "Submission funnel by line of business",
    "difficulty": "medium",
    "pattern": "multi-stage funnel with CTEs",
    "tags": ["cte", "aggregate", "left join", "exists"],
    "minutes": 16,
    "schema": SCHEMA,
    "seed": SEED,
    "ordered": True,
    "prompt": """
Build the classic submission funnel per line of business:

- `submitted`: all submissions
- `quoted`: submissions with at least one quote
- `bound`: submissions with at least one quote whose status is `bound`
- `quote_to_bind_pct`: bound / quoted as a percentage, 1 decimal, NULL when quoted is 0

Columns: `line_of_business`, `submitted`, `quoted`, `bound`, `quote_to_bind_pct`.
Order by `submitted` descending, then `line_of_business`.

Lines of business with zero quotes must still appear.

### Why this one
Funnels are the single most requested analysis at any company selling a workflow
product, and the trap is counting quotes instead of submissions when a submission can
carry more than one quote.
""",
    "starter": "-- 24 submissions across 5 lines of business. Your submitted column must sum to 24.\nSELECT\n",
    "hints": [
        "COUNT(DISTINCT s.submission_id) protects you if a submission ever has two quotes -- count submissions, not join rows.",
        "COUNT(DISTINCT CASE WHEN q.status = 'bound' THEN s.submission_id END) counts distinct submissions matching a condition. CASE with no ELSE yields NULL, and COUNT skips NULLs.",
        "LEFT JOIN quotes, so Marine (which has none) still shows up with zeroes.",
    ],
    "solution": """
SELECT s.line_of_business,
       COUNT(DISTINCT s.submission_id)                  AS submitted,
       COUNT(DISTINCT q.submission_id)                  AS quoted,
       COUNT(DISTINCT CASE WHEN q.status = 'bound'
                           THEN q.submission_id END)    AS bound,
       ROUND(100.0 * COUNT(DISTINCT CASE WHEN q.status = 'bound'
                                         THEN q.submission_id END)
             / NULLIF(COUNT(DISTINCT q.submission_id), 0), 1) AS quote_to_bind_pct
FROM submissions s
LEFT JOIN quotes q ON q.submission_id = s.submission_id
GROUP BY s.line_of_business
ORDER BY submitted DESC, s.line_of_business;
""",
    "explanation": """
### COUNT(DISTINCT CASE WHEN ... END)
This is the workhorse of funnel queries and worth committing to memory:
```
COUNT(DISTINCT CASE WHEN <condition> THEN <id> END)
```
`CASE` without an `ELSE` returns NULL when the condition fails, and `COUNT` ignores
NULLs. So you get "distinct ids meeting the condition" in one expression, without
another subquery or join.

Note it is `COUNT(DISTINCT ...)`, not `SUM(CASE ... THEN 1 ELSE 0 END)`. The SUM version
would over-count as soon as one submission has two bound quotes. Right now the data has
at most one quote per submission, so both give the same answer today -- which is exactly
how this bug reaches production. Choose the version that stays correct.

### The CTE alternative
```
WITH q AS (
  SELECT submission_id,
         MAX(CASE WHEN status='bound' THEN 1 ELSE 0 END) AS was_bound
  FROM quotes GROUP BY submission_id
)
SELECT s.line_of_business, COUNT(*) AS submitted, ...
FROM submissions s LEFT JOIN q ON q.submission_id = s.submission_id
GROUP BY s.line_of_business
```
Collapsing quotes to one row per submission first removes the fan-out entirely, so the
DISTINCTs are no longer load-bearing. This is the version to write when the funnel grows
to six stages -- and mentioning that it scales better is a good closing remark.
""",
    "followups": [
        "Add average days from submission to bind.",
        "Add a declined stage and check the stages sum to the total.",
        "Now do it per underwriter per month, and keep it readable.",
    ],
}

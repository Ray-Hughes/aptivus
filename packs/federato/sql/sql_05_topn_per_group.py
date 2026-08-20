import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _core import SCHEMA, SEED

PROBLEM = {
    "title": "Top 2 brokers by bound premium in each region",
    "difficulty": "medium",
    "pattern": "top-N per group",
    "tags": ["window function", "rank", "cte", "join"],
    "minutes": 18,
    "schema": SCHEMA,
    "seed": SEED,
    "ordered": True,
    "prompt": """
Rank brokers within their region by the total premium of their **bound** quotes, and
return the top 2 per region. Only include brokers who have at least one bound quote.

Columns: `region`, `broker_name`, `bound_premium`, `rank_in_region`.
Order by `region`, then `rank_in_region`.

A quote counts as bound when `quotes.status = 'bound'`.

### Why this one
Top-N-per-group is the classic "do you actually know window functions" question. It is
the SQL problem most likely to appear in a 45 minute round at a company that runs
portfolio analytics.
""",
    "starter": "-- Join brokers -> submissions -> quotes, aggregate, then rank.\nWITH totals AS (\n\n)\nSELECT\n",
    "hints": [
        "Two stages. First a CTE that aggregates premium per broker. Then a second CTE that ranks within region. You cannot aggregate and window over that aggregate in one SELECT.",
        "The join chain is brokers -> submissions -> quotes, filtered to quotes.status = 'bound'.",
        "RANK() OVER (PARTITION BY region ORDER BY bound_premium DESC), then filter rank <= 2 in an outer query.",
    ],
    "solution": """
WITH totals AS (
    SELECT b.region,
           b.broker_name,
           SUM(q.premium) AS bound_premium
    FROM brokers b
    JOIN submissions s ON s.broker_id = b.broker_id
    JOIN quotes q      ON q.submission_id = s.submission_id
    WHERE q.status = 'bound'
    GROUP BY b.broker_id, b.region, b.broker_name
),
ranked AS (
    SELECT region, broker_name, bound_premium,
           RANK() OVER (PARTITION BY region ORDER BY bound_premium DESC) AS rank_in_region
    FROM totals
)
SELECT region, broker_name, bound_premium, rank_in_region
FROM ranked
WHERE rank_in_region <= 2
ORDER BY region, rank_in_region;
""",
    "explanation": """
### Why two CTEs
A window function runs **after** GROUP BY, over the grouped rows. So aggregating and
ranking in the same SELECT is legal in some engines but confusing, and filtering on the
rank in the same query is illegal everywhere. Splitting into "aggregate" then "rank"
then "filter" is clearer, and it is what the interviewer wants to see you reach for.

### CTEs are your friend on a whiteboard
Writing `WITH totals AS (...), ranked AS (...)` lets you narrate the query as three
short steps instead of one nested monster. Under interview pressure that is worth more
than terseness. Build it incrementally: run the CTE alone first and check the numbers.

### Order of clauses, which explains most SQL confusion
Logical evaluation order is:
`FROM -> JOIN -> WHERE -> GROUP BY -> HAVING -> window functions -> SELECT -> ORDER BY -> LIMIT`

That single line explains why you cannot use a SELECT alias in WHERE, why you cannot
filter a window function without nesting, and why HAVING exists at all. Memorise it.
""",
    "followups": [
        "Use DENSE_RANK instead. When would the answer differ?",
        "Add each broker's share of their region's total. (SUM() OVER (PARTITION BY region) with no ORDER BY.)",
        "Include regions with no bound quotes at all, showing zero.",
    ],
}

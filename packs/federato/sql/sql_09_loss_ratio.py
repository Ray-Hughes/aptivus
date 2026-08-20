import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _core import SCHEMA, SEED

PROBLEM = {
    "title": "Loss ratio by line of business (the fan-out trap)",
    "difficulty": "hard",
    "pattern": "pre-aggregate before joining",
    "tags": ["join", "aggregate", "fan out", "cte"],
    "minutes": 18,
    "schema": SCHEMA,
    "seed": SEED,
    "ordered": True,
    "prompt": """
Loss ratio is `total incurred claims / total written premium`.

For each line of business, report the loss ratio across policies that originated from a
quote. A policy can have zero, one, or several claims.

Columns: `line_of_business`, `written_premium`, `incurred`, `loss_ratio_pct`
(rounded to 2 decimals). Order by `loss_ratio_pct` descending.

Policies with a NULL `quote_id` are legacy renewals with no line of business -- exclude them.

### Why this one
This is the single most valuable SQL bug to be able to spot. Join claims directly and
your premium totals silently inflate, because a policy with two claims gets counted
twice. The number looks plausible. It is wrong. Interviewers love this problem for
exactly that reason.
""",
    "starter": "-- Careful: policy 1 has two claims. Naive joining will double count its premium.\n-- Sanity check: SELECT SUM(written_premium) FROM policies WHERE quote_id IS NOT NULL;\nWITH claim_totals AS (\n\n)\nSELECT\n",
    "hints": [
        "Write the naive version first, then run SELECT SUM(written_premium) FROM policies WHERE quote_id IS NOT NULL and compare. Seeing the inflation for yourself is the lesson.",
        "The fix: aggregate claims to one row per policy in a CTE BEFORE joining to policies.",
        "The join chain for the line of business is policies -> quotes -> submissions.",
        "Use LEFT JOIN to the claim totals so policies with no claims still contribute their premium, then COALESCE the incurred to 0.",
    ],
    "solution": """
WITH claim_totals AS (
    SELECT policy_id, SUM(incurred) AS incurred
    FROM claims
    GROUP BY policy_id
)
SELECT s.line_of_business,
       SUM(p.written_premium)              AS written_premium,
       SUM(COALESCE(ct.incurred, 0))       AS incurred,
       ROUND(100.0 * SUM(COALESCE(ct.incurred, 0))
             / NULLIF(SUM(p.written_premium), 0), 2) AS loss_ratio_pct
FROM policies p
JOIN quotes q       ON q.quote_id      = p.quote_id
JOIN submissions s  ON s.submission_id = q.submission_id
LEFT JOIN claim_totals ct ON ct.policy_id = p.policy_id
GROUP BY s.line_of_business
ORDER BY loss_ratio_pct DESC;
""",
    "explanation": """
### Fan-out, explained once so you never forget it
A join to a one-to-many table **multiplies** the rows on the "one" side. Policy 1 has
two claims, so after `JOIN claims` policy 1 appears twice, and `SUM(written_premium)`
adds its 185,000 twice. Property premium comes out as 672,000 instead of 487,000, and
the loss ratio comes out too low. Nothing errors. Nothing looks obviously wrong.

**The rule: never aggregate two different grains in one query.** If you are summing
columns from two tables that are both one-to-many relative to your grouping key,
pre-aggregate each to the target grain in its own CTE first, then join.

### Say this out loud in the interview
"Claims are one-to-many against policies, so if I join them directly my premium sum
fans out. I will roll claims up to one row per policy in a CTE first."

That sentence alone is worth more than the rest of the query. It is the difference
between someone who writes SQL and someone you trust with a customer's numbers.

### Why INNER JOIN to quotes
The legacy renewal policies have no quote and therefore no line of business. An INNER
JOIN drops them, which the prompt asked for. If it had not, you would need a
`COALESCE(s.line_of_business, 'unknown')` with a LEFT JOIN -- and you would want to
raise with the customer that 5 of 15 policies have no line of business at all.
""",
    "followups": [
        "Include the legacy policies under an 'unknown' line of business.",
        "Add claim_count per line of business. (Careful: that is a third grain.)",
        "Restrict to claims whose loss_date falls inside the policy term.",
        "Show the naive fan-out query and explain exactly how wrong it is.",
    ],
}

import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _core import SCHEMA, SEED

PROBLEM = {
    "title": "Running total of written premium",
    "difficulty": "medium",
    "pattern": "running total / window frame",
    "tags": ["window function", "running total", "frame"],
    "minutes": 15,
    "schema": SCHEMA,
    "seed": SEED,
    "ordered": True,
    "prompt": """
List every policy in order of `effective_date` and show the cumulative written premium
bound up to and including that policy.

Columns: `policy_id`, `effective_date`, `written_premium`, `running_premium`.
Order by `effective_date`, then `policy_id`.

Ties on `effective_date` must break by `policy_id` **in the running total as well**, so
the numbers are reproducible.

### Why this one
Running totals are the second window-function question after top-N-per-group, and the
tie-handling detail is where most candidates produce a subtly non-deterministic answer.
""",
    "starter": "SELECT\n",
    "hints": [
        "SUM(x) OVER (ORDER BY ...) is a running total. The ORDER BY inside OVER is what makes it cumulative rather than a grand total.",
        "Put BOTH sort keys inside the OVER clause: ORDER BY effective_date, policy_id. Otherwise tied rows get the same total and the output is not reproducible.",
        "The default frame with an ORDER BY is RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW. Writing ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW makes it explicit and handles ties the way you almost always want.",
    ],
    "solution": """
SELECT p.policy_id,
       p.effective_date,
       p.written_premium,
       SUM(p.written_premium) OVER (
           ORDER BY p.effective_date, p.policy_id
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
       ) AS running_premium
FROM policies p
ORDER BY p.effective_date, p.policy_id;
""",
    "explanation": """
### ROWS vs RANGE, the gotcha worth knowing
With `ORDER BY effective_date` alone, the default frame is **RANGE**, which treats all
rows with the same effective_date as peers and gives them all the same running total.
Four policies effective 2026-02-01 would each show the total including all four.
That is sometimes what you want -- and usually not.

`ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` counts physical rows instead, giving
a strictly incrementing total. Naming this distinction in an interview is a strong
signal; very few candidates know it.

### The window function vocabulary you need
```
SUM(x)  OVER (PARTITION BY g ORDER BY d)   -- running total, restarting per group
ROW_NUMBER() OVER (PARTITION BY g ORDER BY d)
RANK() / DENSE_RANK()
LAG(x, 1) OVER (ORDER BY d)                -- previous row's value
LEAD(x, 1) OVER (ORDER BY d)               -- next row's value
AVG(x) OVER (ORDER BY d ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)  -- moving average
```
Those six cover essentially every window question you will be asked.

### Reproducibility
A query whose output changes between runs is a bug even when every individual value is
"right". Always make your ORDER BY total, inside the window and outside it.
""",
    "followups": [
        "Restart the running total per calendar year. (Add PARTITION BY.)",
        "Show a 3-policy moving average of written premium.",
        "Show cumulative in-force exposure instead: premium is only in force between effective and expiration. (Much harder -- sweep line with +/- events.)",
    ],
}

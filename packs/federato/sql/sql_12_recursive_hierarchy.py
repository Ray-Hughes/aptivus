import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _core import SCHEMA, SEED

PROBLEM = {
    "title": "Walk the broker hierarchy (recursive CTE)",
    "difficulty": "hard",
    "pattern": "recursive CTE",
    "tags": ["recursive cte", "hierarchy", "tree"],
    "minutes": 18,
    "schema": SCHEMA,
    "seed": SEED,
    "ordered": True,
    "prompt": """
Brokers form a hierarchy through `parent_broker_id`. For every broker report the
top-level parent it ultimately rolls up to, and how deep it sits.

Columns: `broker_name`, `root_name` (the top-level ancestor; a root is its own root),
`depth` (0 for a root, 1 for its child, and so on).
Order by `root_name`, `depth`, `broker_name`.

### Why this one
Recursive CTEs are the "senior" SQL question. You will not be failed for not knowing
one, but writing one fluently marks you out immediately -- and it is the SQL twin of the
broker roll-up you already solved in Python.
""",
    "starter": "WITH RECURSIVE tree AS (\n    -- anchor: the roots\n\n    UNION ALL\n    -- recursive step: children of anything already in tree\n\n)\nSELECT\n",
    "hints": [
        "A recursive CTE has two halves joined by UNION ALL: an anchor query (the roots) and a recursive query that references the CTE by name.",
        "Anchor: brokers WHERE parent_broker_id IS NULL, with depth 0 and root_name = their own name.",
        "Recursive step: join brokers to the CTE on b.parent_broker_id = tree.broker_id, carrying root_name down unchanged and adding 1 to depth.",
        "SQLite and Postgres need the WITH RECURSIVE keyword. MySQL 8 does too. Oracle uses CONNECT BY.",
    ],
    "solution": """
WITH RECURSIVE tree AS (
    SELECT b.broker_id,
           b.broker_name,
           b.broker_name AS root_name,
           0             AS depth
    FROM brokers b
    WHERE b.parent_broker_id IS NULL

    UNION ALL

    SELECT c.broker_id,
           c.broker_name,
           t.root_name,
           t.depth + 1
    FROM brokers c
    JOIN tree t ON t.broker_id = c.parent_broker_id
)
SELECT broker_name, root_name, depth
FROM tree
ORDER BY root_name, depth, broker_name;
""",
    "explanation": """
### The shape, which is always the same
```
WITH RECURSIVE t AS (
    <anchor: the starting rows>
    UNION ALL
    <step: join the real table back to t>
)
SELECT * FROM t
```
The engine runs the anchor, then repeatedly runs the step against **only the rows added
by the previous pass**, until a pass adds nothing.

### Carrying a value down
`root_name` comes from the anchor and is passed through untouched at every level. That
is how you propagate an ancestor's attribute to all its descendants. The same trick
builds a materialised path: `t.path || ' > ' || c.broker_name`.

### UNION ALL, not UNION
`UNION` deduplicates, which costs a sort on every pass and can mask a cycle instead of
exposing it. Use `UNION ALL` unless you specifically need dedupe.

### Cycles
If the customer's data has a cycle -- broker A's parent is B and B's parent is A -- this
runs forever. Postgres has no built-in guard; you add `WHERE depth < 20` or carry a
visited path and check it. Raising that unprompted is a genuinely senior remark, and it
is the exact same concern as the cycle detection in the topological sort problem.
""",
    "followups": [
        "Roll total bound premium up the hierarchy so a parent includes all its descendants.",
        "Build a breadcrumb path string like 'Marsh > Marsh Pacific > Marsh Pacific North'.",
        "Guard against a cycle in the customer's data.",
        "How would you do this with a closure table or a materialised path instead, and when is that better?",
    ],
}

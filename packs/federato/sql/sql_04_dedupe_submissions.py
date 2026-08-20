import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _core import SCHEMA, SEED

EXTRA_SCHEMA = """
CREATE TABLE raw_submission_feed (
    feed_row_id    INTEGER PRIMARY KEY,
    external_id    TEXT,        -- the broker's id for the submission
    insured_name   TEXT,
    premium        REAL,
    received_at    TEXT,
    ingested_at    TEXT         -- when OUR pipeline loaded this version of the row
);
"""

EXTRA_SEED = """
INSERT INTO raw_submission_feed VALUES
 (1 ,'EXT-1001','Acme Manufacturing'   ,185000,'2026-01-05','2026-01-05 02:00:00'),
 (2 ,'EXT-1001','Acme Manufacturing'   ,190000,'2026-01-05','2026-01-06 02:00:00'),
 (3 ,'EXT-1001','ACME Manufacturing Co',192500,'2026-01-05','2026-01-07 02:00:00'),
 (4 ,'EXT-1002','Borealis Logistics'   , 92000,'2026-01-09','2026-01-09 02:00:00'),
 (5 ,'EXT-1003','Cascade Foods'        , 47500,'2026-01-15','2026-01-15 02:00:00'),
 (6 ,'EXT-1003','Cascade Foods'        , 47500,'2026-01-15','2026-01-16 02:00:00'),
 (7 ,'EXT-1004','Delta Metalworks'     ,   NULL,'2026-01-22','2026-01-22 02:00:00'),
 (8 ,'EXT-1004','Delta Metalworks'     , 61000,'2026-01-22','2026-01-23 02:00:00'),
 (9 ,'EXT-1005','Evergreen Hospitality',120000,'2026-02-02','2026-02-02 02:00:00'),
 (10,'EXT-1006','Foxtrot Energy'       , 63000,'2026-02-08','2026-02-08 02:00:00'),
 (11,'EXT-1006','Foxtrot Energy'       , 63000,'2026-02-08','2026-02-08 02:00:00'),
 (12,'EXT-1007','Granite Retail'       , 38000,'2026-02-14','2026-02-14 02:00:00');
"""

PROBLEM = {
    "title": "Deduplicate a broker feed, keeping the latest version",
    "difficulty": "medium",
    "pattern": "ROW_NUMBER dedupe",
    "tags": ["window function", "dedupe", "cte", "real world"],
    "minutes": 15,
    "schema": SCHEMA + EXTRA_SCHEMA,
    "seed": SEED + EXTRA_SEED,
    "ordered": True,
    "prompt": """
A broker re-sends the same submission every night, sometimes with corrections. The
landing table `raw_submission_feed` therefore holds several rows per `external_id`.

Return exactly one row per `external_id`: the one with the **latest `ingested_at`**.
If two rows tie on `ingested_at`, keep the one with the **highest `feed_row_id`**.

Columns: `external_id`, `insured_name`, `premium`, `ingested_at`.
Order by `external_id`.

### Why this one
This is the most common real SQL task in a data-integration job, and it is the most
likely SQL question in an interview for a Forward Deployed Engineer. If you learn one
window function, learn this pattern.
""",
    "starter": "-- 12 raw rows, 7 distinct external_ids. Your result must have 7 rows.\nWITH ranked AS (\n\n)\nSELECT\n",
    "hints": [
        "ROW_NUMBER() OVER (PARTITION BY external_id ORDER BY ...) numbers the rows within each group. Keep number 1.",
        "PARTITION BY is the window equivalent of GROUP BY, except it does not collapse rows -- it just defines which rows each row can see.",
        "You cannot filter on a window function in WHERE (it is computed after WHERE). Wrap it in a CTE or subquery and filter outside.",
        "Two-level tie-break: ORDER BY ingested_at DESC, feed_row_id DESC.",
    ],
    "solution": """
WITH ranked AS (
    SELECT f.*,
           ROW_NUMBER() OVER (
               PARTITION BY f.external_id
               ORDER BY f.ingested_at DESC, f.feed_row_id DESC
           ) AS rn
    FROM raw_submission_feed f
)
SELECT external_id, insured_name, premium, ingested_at
FROM ranked
WHERE rn = 1
ORDER BY external_id;
""",
    "explanation": """
### The pattern, memorised
```
WITH ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY <natural key>
                               ORDER BY <recency> DESC) AS rn
  FROM t
)
SELECT * FROM ranked WHERE rn = 1
```
That is "latest row per group". You will use it forever.

### Why not GROUP BY with MAX(ingested_at)?
Because you need the **other columns from that same row**. `SELECT external_id,
MAX(ingested_at), premium` gives you the max timestamp next to an arbitrary premium --
SQLite will happily return it, Postgres will reject it, and both are the wrong answer.
Window functions exist exactly to solve this.

### ROW_NUMBER vs RANK vs DENSE_RANK
- `ROW_NUMBER` always 1,2,3 -- ties broken arbitrarily unless you break them yourself.
- `RANK` gives 1,1,3 -- ties share a rank, then it skips.
- `DENSE_RANK` gives 1,1,2 -- ties share, no skip.

For deduplication you want ROW_NUMBER, because RANK would return both tied rows and you
would still have duplicates. Note EXT-1006 has two byte-identical rows: only ROW_NUMBER
with the `feed_row_id` tie-break reduces it to one.

### The NULL premium
EXT-1004's first ingest has a NULL premium that a later ingest fixes. Your query picks
up the correction for free -- which is the whole point of last-write-wins.
""",
    "followups": [
        "How would you make this incremental so you do not rescan the whole history every night?",
        "What if corrections can arrive out of order, so a later ingest has an older received_at?",
        "The dedupe key should really be (external_id, received_at). What changes?",
        "How would you write this without window functions, for an engine that lacks them?",
    ],
}

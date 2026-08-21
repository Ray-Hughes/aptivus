# SQL quick reference for interviews

The 12 SQL problems teach these in context. This is the morning-of refresher.

---

## The one line that explains most SQL confusion

**Logical evaluation order:**

```
FROM -> JOIN -> WHERE -> GROUP BY -> HAVING -> WINDOW -> SELECT -> ORDER BY -> LIMIT
```

That is why:
- you cannot use a `SELECT` alias in `WHERE` (SELECT hasn't run yet)
- you cannot filter a window function without wrapping it in a CTE (windows run after WHERE)
- `HAVING` exists at all (you need a filter that runs *after* grouping)
- you *can* use a `SELECT` alias in `ORDER BY` (it runs last)

---

## Joins

```sql
INNER JOIN   -- only matching rows.       Drops non-matches SILENTLY.
LEFT JOIN    -- all of left + matches.    Non-matches get NULL columns.
FULL OUTER   -- both sides (not in MySQL; not in older SQLite)
CROSS JOIN   -- cartesian product
```

**Choose deliberately and say why.** "I'm using LEFT JOIN because a broker with zero
submissions still needs a row" is a scored sentence.

**Multi-column join** - both conditions in the ON:
```sql
LEFT JOIN appetite a
       ON a.line_of_business = s.line_of_business
      AND a.state            = acc.state
```

**Filtering a LEFT JOIN - the trap:**
```sql
LEFT JOIN quotes q ON q.submission_id = s.submission_id
WHERE q.status = 'bound'          -- turns it back into an INNER JOIN!
```
The condition belongs in the ON clause if you want to keep unmatched left rows:
```sql
LEFT JOIN quotes q ON q.submission_id = s.submission_id AND q.status = 'bound'
```

---

## COUNT, and why it matters

```sql
COUNT(*)             -- all rows, including LEFT JOIN's all-NULL phantom row
COUNT(col)           -- rows where col IS NOT NULL
COUNT(DISTINCT col)  -- distinct non-null values
```

After a LEFT JOIN, `COUNT(*)` reports 1 for a parent with no children. `COUNT(child.id)`
reports 0. Almost always you want the second.

---

## Conditional aggregation

```sql
SUM(CASE WHEN status = 'bound' THEN 1 ELSE 0 END)        AS bound_count
COUNT(CASE WHEN status = 'bound' THEN 1 END)             AS same_thing
COUNT(DISTINCT CASE WHEN status='bound' THEN sub_id END) AS distinct_bound
AVG(CASE WHEN x > 0 THEN x END)                          -- NULLs are skipped by AVG
```
`CASE` without `ELSE` yields NULL, and aggregates skip NULLs. That is the whole trick.

---

## Safe arithmetic

```sql
ROUND(100.0 * a / NULLIF(b, 0), 1)
```
- `100.0` forces float division (`100 * 3 / 4` can floor to 0)
- `NULLIF(b, 0)` turns a zero denominator into NULL instead of an error
- `COALESCE(x, 0)` replaces NULL with a default

---

## NULL rules

- `NULL = NULL` is **UNKNOWN**, not true. Use `IS NULL` / `IS NOT NULL`.
- Any arithmetic with NULL is NULL. `5 + NULL` is NULL.
- Aggregates **skip** NULLs (except `COUNT(*)`).
- `NOT IN (subquery containing a NULL)` returns **zero rows**. Use `NOT EXISTS`.
- Sorting: SQLite and Postgres put NULL first ascending / last descending. MySQL differs.
  Postgres lets you write `NULLS FIRST` / `NULLS LAST`.

---

## Window functions

```sql
<fn>() OVER (PARTITION BY g ORDER BY d ROWS BETWEEN ... AND ...)
```

| Function | Gives you |
|---|---|
| `ROW_NUMBER()` | 1,2,3 - ties broken arbitrarily unless you break them |
| `RANK()` | 1,1,3 - ties share, then skip |
| `DENSE_RANK()` | 1,1,2 - ties share, no skip |
| `SUM(x) OVER (ORDER BY d)` | running total |
| `SUM(x) OVER (PARTITION BY g)` | group total on every row (no ORDER BY = whole partition) |
| `LAG(x)` / `LEAD(x)` | previous / next row's value |
| `AVG(x) OVER (... ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)` | moving average |

**You cannot filter on a window function in WHERE.** Wrap it:
```sql
WITH ranked AS (SELECT *, ROW_NUMBER() OVER (...) rn FROM t)
SELECT * FROM ranked WHERE rn = 1;
```

**ROWS vs RANGE:** with `ORDER BY d` and no explicit frame, the default is `RANGE`, which
treats ties as peers and gives them all the same running total. `ROWS BETWEEN UNBOUNDED
PRECEDING AND CURRENT ROW` counts physical rows. Knowing this is a strong signal.

### The two patterns to have memorized

**Latest row per group (dedupe):**
```sql
WITH ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY natural_key
                               ORDER BY updated_at DESC, id DESC) AS rn
  FROM feed
)
SELECT * FROM ranked WHERE rn = 1;
```

**Top-N per group:**
```sql
WITH totals AS (SELECT g, k, SUM(v) AS total FROM t GROUP BY g, k),
     ranked AS (SELECT *, RANK() OVER (PARTITION BY g ORDER BY total DESC) AS r
                FROM totals)
SELECT * FROM ranked WHERE r <= 3;
```

---

## The fan-out trap (learn this one)

Joining a one-to-many table **multiplies** rows, so sums on the "one" side inflate:

```sql
-- WRONG: a policy with 2 claims counts its premium twice
SELECT SUM(p.written_premium), SUM(c.incurred)
FROM policies p JOIN claims c ON c.policy_id = p.policy_id;

-- RIGHT: collapse the child to the parent's grain first
WITH claim_totals AS (
  SELECT policy_id, SUM(incurred) AS incurred FROM claims GROUP BY policy_id
)
SELECT SUM(p.written_premium), SUM(COALESCE(ct.incurred, 0))
FROM policies p LEFT JOIN claim_totals ct ON ct.policy_id = p.policy_id;
```

**Rule: never aggregate two different grains in one query.**

State the grain of each table out loud before you write anything. It prevents this and
it sounds senior.

---

## Anti-join (rows in A with nothing in B)

```sql
-- preferred
WHERE NOT EXISTS (SELECT 1 FROM b WHERE b.a_id = a.id)

-- also fine
LEFT JOIN b ON b.a_id = a.id WHERE b.id IS NULL

-- avoid: returns ZERO rows if any b.a_id is NULL
WHERE a.id NOT IN (SELECT a_id FROM b)
```

---

## Dates, by engine

| | SQLite | Postgres | MySQL |
|---|---|---|---|
| month bucket | `strftime('%Y-%m', d)` | `date_trunc('month', d)` | `DATE_FORMAT(d,'%Y-%m')` |
| day difference | `julianday(a)-julianday(b)` | `a - b` (int for dates) | `DATEDIFF(a,b)` |
| add interval | `date(d,'+1 month')` | `d + interval '1 month'` | `DATE_ADD(d, INTERVAL 1 MONTH)` |
| now | `date('now')` | `current_date` | `CURDATE()` |

**Ask which engine at the start.** Then say what you'd use in the other one - it reads
as experience, not hedging.

`'YYYY-MM'` sorts correctly as a string because it is fixed-width and big-endian.
`'MM/YYYY'` does not. This is a real production bug.

---

## CTEs

```sql
WITH step_one AS ( ... ),
     step_two AS ( SELECT ... FROM step_one )
SELECT * FROM step_two;
```
Use them freely. Under interview pressure, three readable steps beat one nested monster,
and you can run each CTE alone to check it. Narrate: "first I'll aggregate, then rank,
then filter."

**Recursive:**
```sql
WITH RECURSIVE tree AS (
    SELECT id, name, name AS root, 0 AS depth FROM t WHERE parent_id IS NULL
    UNION ALL
    SELECT c.id, c.name, p.root, p.depth + 1
    FROM t c JOIN tree p ON p.id = c.parent_id
)
SELECT * FROM tree;
```
`UNION ALL`, not `UNION`. Guard against cycles with a depth cap on customer data.

---

## Habits that score points

1. Read the schema and **say the grain of each table** before writing.
2. Build incrementally - run the FROM/JOIN, look at rows, then aggregate.
3. **Sanity check totals**: "24 submissions, my groups sum to 24."
4. Say why you picked INNER vs LEFT.
5. Make `ORDER BY` total (add a tie-breaker) so the output is reproducible.
6. Name the trap when you avoid it: fan-out, `NOT IN` with NULLs, integer division.

# Interview day: how to run the 45 minutes

## The 3 minutes before

- Editor open, water, pen and paper, phone off, door shut.
- Say to yourself: *"My job is to be someone they want to debug a customer outage with
  at 11pm. Not to be a code golfer."*

## When you get the problem

**Do not start typing.** The first 90 seconds are the highest-leverage of the round.

1. **Read it aloud.** Then restate it in your own words:
   *"So I'm given a list of records and I need to return X. Let me make sure I have that right."*
2. **Ask 1-2 clarifying questions.** Real ones. Good defaults:
   - "Can the input be empty?"
   - "Can there be duplicates in this?"
   - "Should I return the indices or the values?"
   - "Roughly how large is n? That'll tell me if O(n log n) is fine."
3. **Walk the example by hand.** Out loud. This catches misunderstandings while they are
   still free.
4. **State the brute force, then the improvement:**
   *"The naive approach is nested loops, O(n squared). I think I can get O(n) with a
   dict of value to index. Let me do that - shall I?"*

Only now do you type.

## While coding

- **Narrate.** Not every character - the decisions. *"I'm using a defaultdict here so I
  don't have to check whether the key exists."*
- **If you go quiet for more than ~15 seconds, say what you are thinking.**
  *"I'm just working out whether the left pointer should move before or after I record
  the max."* Silence reads as being stuck. Thinking out loud reads as competence.
- **Variable names matter more than usual.** `broker_totals` not `d`. It is free signal.
- **If you blank on Python syntax, say so and keep moving:**
  *"In Ruby I'd use group_by here - in Python I think that's a defaultdict and a loop."*
  Nobody cares. Freezing silently is the only thing that hurts.

## When it works

Do not stop. Do these three things - they are worth real points:

1. **Walk your own edge cases.** *"Empty input returns an empty list - good. Single
   element - good. All duplicates - let me trace that."*
2. **State the complexity.** *"O(n) time, O(n) space, one pass."*
3. **Offer the trade-off.** *"If memory were tight and the input were sorted, I could
   do this with two pointers and O(1) extra space."*

## If you are stuck

Being stuck is normal and survivable. Being stuck **and silent** is not.

- Say where you are: *"I know I want a sliding window. I'm not sure yet how to know
  when to shrink it. Let me work a small example."*
- Go back to a concrete example on paper. Almost every unstuck moment comes from this.
- Ask for a nudge if you have been stuck 3+ minutes: *"Am I on the right track with the
  window idea, or should I be thinking about this differently?"* This is not a
  penalty. It is what you would do with a colleague.
- **A working brute force beats an unfinished clever solution.** Say
  *"Let me get the O(n squared) version working first, then optimize"* and do exactly that.

## The SQL half

- **Look at the schema before the question.** Name the grain of each table out loud:
  *"submissions is one row per submission, quotes is one row per quote, so a submission
  can have several quotes - I need to watch for fan-out."*
- **Build incrementally.** Write the FROM and JOINs, run it, look at the rows. Then add
  the aggregate. Then the filter. Do not write 20 lines then hit run.
- **Sanity check your totals.** *"There are 24 submissions, and my groups sum to 24 - good."*
  Interviewers love this. It is the habit that separates people who write SQL from people
  you trust with a customer's numbers.
- **Say the two magic phrases when they apply:**
  - *"Claims are one-to-many against policies, so joining directly would fan out my
    premium sum. Let me pre-aggregate claims in a CTE first."*
  - *"I'll use NOT EXISTS rather than NOT IN, because NOT IN returns nothing at all if
    the subquery has a NULL."*
- **Ask which engine.** *"Is this Postgres or MySQL? The date functions differ."* Then
  say what you'd use in the other.

## Time management for 45 minutes

Assume roughly half each, but **let them steer**.

- If SQL comes first and you finish in 15, do not fill the silence - say
  *"I'm happy with that. Want me to move on?"*
- At the ~35 minute mark, if you have a partial solution, say
  *"I want to make sure we have something working - let me finish the straightforward
  version and note where I'd optimize."*
- Leave 2-3 minutes for their questions and yours.

## Questions to ask them (have 2-3 ready)

For **Taimur Hasan** (Forward Deployed Engineer, ex-Manulife insurance engineering):
- "What does a typical customer deployment look like end to end - how long from kickoff
  to an underwriter using it in anger?"
- "Where do implementations usually get hard? Is it the data mapping, the workflow
  configuration, or change management on the carrier's side?"
- "How much of the FDE work ends up going back into the core product versus staying
  customer-specific?"

For **Sandeep Gonnabathula** (Senior Software Engineer):
- "How much of the underwriting workflow is configuration versus code per customer?"
- "What was the hardest scaling problem the platform has actually hit?"

Ask something you actually want to know. It shows.

## Afterwards

Write down every problem you were asked and everything you fumbled, within 30 minutes,
while it is fresh. Whatever happens, that note is worth more than the round.

---

## One-page pre-interview refresher

```python
from collections import defaultdict, Counter, deque
import heapq, bisect

counts = Counter(xs)                            # frequencies
groups = defaultdict(list); groups[k].append(v) # grouping
ranked = sorted(d.items(), key=lambda kv: (-kv[1], kv[0]))   # desc count, asc name
q = deque([start]); q.popleft()                 # BFS  (list.pop(0) is O(n)!)
heapq.heappush(h, x); heapq.heappop(h)          # MIN heap; push -x for max
mid = (lo + hi) // 2                            # // not /
for i, x in enumerate(xs):                      # (index, value)
d.get(k, 0)                                     # never d[k] on maybe-missing
```

```sql
-- latest row per group
WITH ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY key ORDER BY ts DESC) rn FROM t
) SELECT * FROM ranked WHERE rn = 1;

-- don't fan out
WITH totals AS (SELECT policy_id, SUM(x) s FROM child GROUP BY policy_id)
SELECT ... FROM parent p LEFT JOIN totals t ON t.policy_id = p.policy_id;

COUNT(*) vs COUNT(col)            -- col skips NULLs (LEFT JOIN!)
100.0 * a / NULLIF(b, 0)          -- float math, no divide by zero
WHERE filters rows, HAVING filters groups
NOT EXISTS, not NOT IN
FROM -> WHERE -> GROUP BY -> HAVING -> window -> SELECT -> ORDER BY -> LIMIT
```

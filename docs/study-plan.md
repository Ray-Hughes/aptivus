# 5-day plan: Federato Senior Forward Deployed Engineer

- **Mon Aug 24, 3:00-3:45pm ET** - Coding (part SQL + part data structures/algos), Taimur Hasan. HackerRank. **No AI allowed.**
- **Tue Aug 25, 4:00-5:00pm ET** - System design (workflow orchestration, distributed systems, event-driven), Sandeep Gonnabathula. **You will diagram in HackerRank's whiteboard.**

Today is Wed Aug 19. That gives you four full days plus interview mornings.

---

## The honest assessment of where your risk is

You are an expert engineer. You are not going to fail on problem-solving. The three
things that can actually sink you:

1. **Python syntax hesitation under time pressure.** 45 minutes is short. Ten seconds
   lost per line to "is it `.length` or `len()`" compounds into a failed round.
   *Fix: volume. Type code, do not read code.*
2. **The SQL half.** It is half the round and it is the half most candidates under-prepare
   because it feels easy. Window functions and the fan-out trap are where it gets real.
   *Fix: the 12 SQL problems in the pack, twice.*
3. **Not narrating.** For a Forward Deployed Engineer, "can you explain your thinking to
   a customer" IS the job. Silent correct code scores worse than narrated near-miss code.
   *Fix: practise out loud, literally, alone, feeling stupid.*

Notably **not** on that list: exotic algorithms. Reported Federato rounds are described
as moderate difficulty (Glassdoor puts the overall loop at 2.8/5). Nobody is asking you
for segment trees.

---

## Daily structure

Every session, same shape:

1. **10 min warm-up** - retype yesterday's solutions from memory. No reading first.
2. **Main block** - new problems, timer running, out loud.
3. **5 min close** - write down every syntax thing you had to look up. That list is
   your real study guide.

Rule: **when the target time is up, stop and look at the solution.** Grinding for 40
minutes on a 15 minute problem teaches you nothing except how to feel bad. Read the
solution, close it, retype it from memory, move on.

---

## Wed Aug 19 (tonight, 60-90 min)

Setup and orientation. Low intensity.

- [ ] Get the app running: `./aptivus` then open http://localhost:8777
- [ ] Read `docs/ruby-to-python.md` section 1 (**Gotchas**) properly. Skim the rest.
- [ ] Open the real HackerRank sample pad they sent: https://hr.gs/sampleint
      Type in it. Find the Run Code button, the Input box, the language dropdown,
      and the **Whiteboard tab**. Do not discover this UI on Monday.
- [ ] Solve `py_01 Two accounts hitting a premium target` and `py_04 Balanced brackets`.
      Goal is finger memory, not difficulty.
- [ ] Solve `sql_01 Submissions by appetite tier`.

**Tonight's real goal:** end the day having typed Python, not read about it.

---

## Thu Aug 20 - Hash maps, counting, and joins (2-3 hrs)

The bread and butter. Most likely to actually appear.

**Python (target ~70 min)**
- [ ] `py_02` Top K brokers - Counter, tuple sort keys
- [ ] `py_03` Group anagrams - the grouping pattern
- [ ] `py_05` Reconcile two policy feeds - **do this one carefully**, it is the closest
      thing in the set to the actual job
- [ ] `py_12` Read from stdin - drill the input parsing until it is reflex

**SQL (target ~60 min)**
- [ ] `sql_02` Broker bind rate - LEFT JOIN, COUNT(*) vs COUNT(col), NULLIF
- [ ] `sql_03` Accounts with no quote - anti-join, NOT EXISTS
- [ ] `sql_06` Monthly trend - date bucketing

**Close:** write out from memory: `Counter`, `defaultdict(list)`, sort by
`(-count, name)`, `sys.stdin.read().split()`.

---

## Fri Aug 21 - Windows, pointers, and window functions (2-3 hrs)

**Python (~75 min)**
- [ ] `py_06` Longest run of distinct codes - **memorise the sliding window template**
- [ ] `py_07` Merge overlapping coverage - the sort-first interval pattern
- [ ] `py_08` Binary search rate band - the "rightmost <= x" variant

**SQL (~75 min)**
- [ ] `sql_04` Deduplicate a broker feed - **the single highest-value SQL pattern here.**
      `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ... DESC)` then `WHERE rn = 1`
- [ ] `sql_05` Top 2 brokers per region - top-N-per-group
- [ ] `sql_08` Running total

**Close:** you should be able to write the ROW_NUMBER dedupe from a blank editor.
Test yourself: close the app and type it into a text file.

---

## Sat Aug 22 - Graphs, recursion, and the hard SQL (3 hrs)

**Python (~90 min)**
- [ ] `py_09` Roll up premium through a broker hierarchy - DFS
- [ ] `py_10` Order the workflow steps - **topological sort. Do this one properly;**
      it is also your bridge into Tuesday's system design round
- [ ] `py_15` Flatten a nested payload - recursion, and very FDE-flavoured

**SQL (~90 min)**
- [ ] `sql_07` Slow turnaround - WHERE vs HAVING
- [ ] `sql_09` Loss ratio - **the fan-out trap. If you learn one thing from the SQL
      set, learn this one.** Double-counting from a one-to-many join is the bug that
      makes a customer lose trust in your numbers
- [ ] `sql_11` Submission funnel

---

## Sun Aug 23 - Full mocks under the clock (3 hrs)

Today is not about learning. It is about performing.

- [ ] **Mock A** (Mock Interview tab) - 45 min, timer on, no hints, talking out loud
- [ ] Break, review what went wrong
- [ ] **Mock B** - 45 min, same rules
- [ ] Remaining problems if time: `py_11`, `py_13`, `py_14`, `sql_10`, `sql_12`

**Record yourself on one mock.** Play it back. It is unpleasant and it is the single
highest-value 45 minutes in this plan. You will hear the dead air, the mumbling, the
places you stopped explaining. Fix those.

- [ ] Evening: first pass through `docs/system-design.md`

---

## Mon Aug 24 - Coding day

**Morning (45-60 min, light):**
- [ ] Retype from memory, no reference: sliding window template, ROW_NUMBER dedupe,
      Kahn's topological sort, `defaultdict`/`Counter` setup
- [ ] One easy problem to warm up. Do not attempt anything new. Do not cram.

**2:30pm:** stop studying. Water, bathroom, quiet room, close Slack and email.
Have a text editor open for scratch notes and a pen and paper.

**2:55pm:** join the Zoom. Editor already open.

**3:00pm:** see `docs/interview-day.md`.

**Evening:** system design deep pass. Practise drawing the diagrams by hand.

---

## Tue Aug 25 - System design day

- [ ] Morning: `docs/system-design.md`, out loud, twice
- [ ] Draw the ingestion pipeline diagram from memory three times, on paper
- [ ] Open the HackerRank whiteboard from the sample link and draw it there once,
      so the tool is not new to you at 4pm
- [ ] **3:45pm:** stop. Same routine as Monday.

---

## Progress tracking

The app tracks solved status per problem and saves your code, so you can walk away
and come back. `progress.json` at the repo root holds it.

Do not chase 27/27. Chase: **can I write the eight core patterns from a blank editor
without hesitating.**

The eight:
1. dict as a lookup / seen-set (two sum)
2. `Counter` + sort by tuple key
3. `defaultdict(list)` grouping by a derived key
4. sliding window with two pointers
5. sort-then-sweep for intervals
6. BFS/DFS with an adjacency list
7. `ROW_NUMBER() OVER (PARTITION BY ...)` dedupe
8. pre-aggregate in a CTE before joining (fan-out avoidance)

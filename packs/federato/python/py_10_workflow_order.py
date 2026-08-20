PROBLEM = {
    "title": "Order the workflow steps (topological sort)",
    "difficulty": "hard",
    "pattern": "topological sort",
    "tags": ["graph", "bfs", "cycle detection"],
    "minutes": 20,
    "mode": "function",
    "func": "order_steps",
    "prompt": """
A submission workflow is a set of steps with dependencies. `deps` is a list of
`[step, requires]` pairs meaning `step` cannot run until `requires` has finished.

Return a valid execution order for all `steps`. If several orders are valid, return the
**alphabetically smallest** one. If the dependencies contain a cycle, return `[]`.

```
steps = ["clear","quote","rate","intake"]
deps  = [["rate","clear"],["quote","rate"],["clear","intake"]]
-> ["intake","clear","rate","quote"]
```

### Why this one
This is Course Schedule II, and it is the single problem that overlaps hardest with
your system design round on **workflow orchestration**. If they ask you to design a
pipeline the next day, this is the data structure underneath it.
""",
    "starter": "def order_steps(steps, deps):\n    # steps: list[str], deps: list[[str,str]] -> list[str]\n    pass\n",
    "hints": [
        "Kahn's algorithm: count how many unmet dependencies each step has (its in-degree), start with everything at zero, and peel.",
        "For the alphabetically smallest order, the ready set must be a MIN-HEAP, not a queue. heapq.heappush / heappop.",
        "Cycle detection falls out for free: if you emit fewer steps than you started with, the leftovers are in a cycle. Return [].",
    ],
    "tests": [
        {"args": [["clear", "quote", "rate", "intake"],
                  [["rate", "clear"], ["quote", "rate"], ["clear", "intake"]]],
         "expected": ["intake", "clear", "rate", "quote"], "sample": True},
        {"args": [["a", "b"], [["a", "b"], ["b", "a"]]], "expected": [], "sample": True},
        {"args": [["c", "b", "a"], []], "expected": ["a", "b", "c"], "sample": True},
        {"args": [[], []], "expected": []},
        {"args": [["x"], []], "expected": ["x"]},
        {"args": [["x"], [["x", "x"]]], "expected": []},
        {"args": [["d", "c", "b", "a"], [["d", "a"], ["c", "a"], ["b", "a"]]],
         "expected": ["a", "b", "c", "d"]},
        {"args": [["intake", "rate", "quote", "bind", "issue"],
                  [["rate", "intake"], ["quote", "rate"], ["bind", "quote"], ["issue", "bind"]]],
         "expected": ["intake", "rate", "quote", "bind", "issue"]},
        {"args": [["a", "b", "c", "d"], [["b", "a"], ["c", "b"], ["a", "c"]]], "expected": []},
    ],
    "solution": """
import heapq
from collections import defaultdict

def order_steps(steps, deps):
    unlocks = defaultdict(list)          # requires -> [steps waiting on it]
    indeg = {s: 0 for s in steps}
    for step, requires in deps:
        unlocks[requires].append(step)
        indeg[step] += 1

    ready = [s for s in steps if indeg[s] == 0]
    heapq.heapify(ready)                 # min-heap gives the lexicographic order

    out = []
    while ready:
        s = heapq.heappop(ready)
        out.append(s)
        for nxt in unlocks[s]:
            indeg[nxt] -= 1
            if indeg[nxt] == 0:
                heapq.heappush(ready, nxt)

    return out if len(out) == len(steps) else []
""",
    "complexity": "O(V log V + E). The log factor is the heap; a plain deque would be O(V + E) but loses the alphabetical guarantee.",
    "explanation": """
### Ruby to Python notes
- `heapq` operates **on a plain list** rather than giving you a Heap object: `heapq.heappush(lst, x)`, `heapq.heappop(lst)`, `heapq.heapify(lst)`. It is always a MIN-heap. For a max-heap, push `-value` (or a tuple with a negated first element).
- `{s: 0 for s in steps}` is a dict comprehension -- Ruby's `steps.to_h { |s| [s, 0] }`.
- `defaultdict(list)` again. Notice that `unlocks[s]` for a step nothing depends on returns `[]` rather than raising.

### Say this out loud
"Dependencies plus 'valid order' means topological sort. I will use Kahn's algorithm
because cycle detection is free -- if I cannot drain every node, the remainder is a cycle.
And because they asked for the lexicographically smallest order, my ready set is a
min-heap rather than a FIFO queue."

### The tie to your system design round
Real orchestrators (Airflow, Temporal, Step Functions) topologically sort a DAG exactly
like this, then schedule the zero-in-degree frontier in parallel. If you say "the ready
set is my parallelism frontier -- everything in the heap at one time can run concurrently",
you have just connected both interviews.
""",
    "followups": [
        "Which steps could run in parallel? (Everything popped in the same 'level' -- process the ready set a full layer at a time.)",
        "How would you report WHICH steps form the cycle, so the customer can fix their config?",
        "Steps can fail and need retry. Where does that live in this model? (Not here -- that is durable execution state, which is your Temporal answer tomorrow.)",
    ],
}

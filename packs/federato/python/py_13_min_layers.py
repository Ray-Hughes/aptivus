PROBLEM = {
    "title": "Fewest reinsurance layers to cover a limit",
    "difficulty": "medium",
    "pattern": "dynamic programming",
    "tags": ["dp", "memoization"],
    "minutes": 18,
    "mode": "function",
    "func": "min_layers",
    "prompt": """
You can buy reinsurance in fixed layer sizes, and you may buy each size any number of
times. Return the **fewest layers** whose sizes add up to exactly `limit`, or `-1` if
no combination hits it exactly.

```
min_layers([1, 5, 10, 25], 30)  -> 2    (25 + 5)
min_layers([5, 10], 3)          -> -1
min_layers([7], 0)              -> 0
```

### Why this one
Coin Change. It is the standard "do you know DP exists" checkpoint, and the greedy
answer (take the biggest layer first) is **wrong** -- `[1, 15, 25]` with limit 30 is
`15+15 = 2`, not `25+1+1+1+1+1 = 6`. Say that out loud; interviewers love it.
""",
    "starter": "def min_layers(sizes, limit):\n    # sizes: list[int], limit: int -> int\n    pass\n",
    "hints": [
        "Greedy fails. Build up an answer for every amount from 0 to limit.",
        "best[a] = 1 + min(best[a - s] for every size s that fits). best[0] = 0.",
        "Use a big sentinel (float('inf')) for 'unreachable', then convert it to -1 at the end.",
    ],
    "tests": [
        {"args": [[1, 5, 10, 25], 30], "expected": 2, "sample": True},
        {"args": [[5, 10], 3], "expected": -1, "sample": True},
        {"args": [[7], 0], "expected": 0, "sample": True},
        {"args": [[1, 15, 25], 30], "expected": 2},
        {"args": [[2], 3], "expected": -1},
        {"args": [[1], 100], "expected": 100},
        {"args": [[], 5], "expected": -1},
        {"args": [[], 0], "expected": 0},
        {"args": [[186, 419, 83, 408], 6249], "expected": 20},
        {"args": [[3, 7], 11], "expected": -1},
        {"args": [[3, 7], 13], "expected": 3},
    ],
    "solution": """
def min_layers(sizes, limit):
    INF = float("inf")
    best = [0] + [INF] * limit          # best[a] = fewest layers summing to a
    for amount in range(1, limit + 1):
        for s in sizes:
            if s <= amount and best[amount - s] + 1 < best[amount]:
                best[amount] = best[amount - s] + 1
    return best[limit] if best[limit] != INF else -1
""",
    "complexity": "O(limit * len(sizes)) time, O(limit) space.",
    "explanation": """
### How to talk about DP without sounding lost
Three sentences, in this order:
1. "The state is: fewest layers to reach exactly amount `a`."
2. "The transition is: from `a - s` for each layer size `s`, costing one more layer."
3. "The base case is `best[0] = 0`, and I fill amounts in increasing order so every
   subproblem is already solved when I need it."

That is the whole ritual. It works for every DP question you will get.

### Ruby to Python notes
- `[0] + [INF] * limit` builds the array. `[x] * n` repeats -- but careful: `[[]] * 3` gives three references to the **same** list. For a grid you need `[[0]*cols for _ in range(rows)]`. This is the mutable-default trap's cousin and it will bite you.
- `float('inf')` compares greater than every int. Ruby has `Float::INFINITY`.
- `range(1, limit + 1)` is `1..limit` -- the top is exclusive, so you need the `+1`.

### Recursive alternative, if you prefer it
```
from functools import lru_cache
@lru_cache(maxsize=None)
def go(amount):
    if amount == 0: return 0
    if amount < 0:  return float('inf')
    return min((go(amount - s) + 1 for s in sizes), default=float('inf'))
```
`lru_cache` is a one-line memoiser and it impresses people. Watch the recursion depth
for large limits.
""",
    "followups": [
        "Return the actual combination of layers, not just the count. (Keep a parent pointer per amount.)",
        "Now each size may be used at most once. (0/1 knapsack -- the loop order flips.)",
        "Count the number of distinct combinations rather than the minimum. (Same table, sum instead of min, and swap the loop nesting to avoid counting permutations.)",
    ],
}

PROBLEM = {
    "title": "Roll up premium through a broker hierarchy",
    "difficulty": "medium",
    "pattern": "graph / BFS-DFS",
    "tags": ["graph", "bfs", "dfs", "tree"],
    "minutes": 18,
    "mode": "function",
    "func": "rollup",
    "prompt": """
Brokers form a tree. You get:

- `edges`: list of `[parent, child]` pairs
- `premiums`: dict of `{broker: premium_written_directly}`
- `root`: the top broker

Return a dict mapping **every** broker to its total rolled-up premium: its own
premium plus everything written anywhere beneath it.

```
edges    = [["A","B"],["A","C"],["B","D"]]
premiums = {"A":10, "B":5, "C":7, "D":3}
-> {"A": 25, "B": 8, "C": 7, "D": 3}
```

A broker with no entry in `premiums` wrote 0.

### Why this one
Portfolio roll-ups are Federato's whole product. And a hierarchy traversal is the
cleanest way for an interviewer to see whether you can write a recursion or a BFS
without flailing.
""",
    "starter": "def rollup(edges, premiums, root):\n    # edges: list[[str,str]], premiums: dict[str,int], root: str -> dict[str,int]\n    pass\n",
    "hints": [
        "First build an adjacency list: defaultdict(list) mapping parent -> [children]. Never work off the raw edge list inside a traversal, it makes everything O(n^2).",
        "Post-order DFS: a node's total is its own premium plus the totals of its children, so you must finish the children first.",
        "Recursion is fine here and reads best. Mention that a 100k-deep chain would blow Python's 1000-frame recursion limit, and that the iterative fix is a stack with a two-pass (visit, then process) marker.",
    ],
    "tests": [
        {"args": [[["A", "B"], ["A", "C"], ["B", "D"]], {"A": 10, "B": 5, "C": 7, "D": 3}, "A"],
         "expected": {"A": 25, "B": 8, "C": 7, "D": 3}, "sample": True},
        {"args": [[], {"A": 10}, "A"], "expected": {"A": 10}, "sample": True},
        {"args": [[["A", "B"]], {"A": 1}, "A"], "expected": {"A": 1, "B": 0}},
        {"args": [[["R", "X"], ["X", "Y"], ["Y", "Z"]], {"Z": 100}, "R"],
         "expected": {"R": 100, "X": 100, "Y": 100, "Z": 100}},
        {"args": [[["A", "B"], ["A", "C"], ["A", "D"]], {"B": 1, "C": 2, "D": 3}, "A"],
         "expected": {"A": 6, "B": 1, "C": 2, "D": 3}},
        {"args": [[["A", "B"], ["B", "C"], ["A", "D"], ["D", "E"], ["D", "F"]],
                  {"A": 1, "B": 2, "C": 4, "D": 8, "E": 16, "F": 32}, "A"],
         "expected": {"A": 63, "B": 6, "C": 4, "D": 56, "E": 16, "F": 32}},
    ],
    "solution": """
from collections import defaultdict

def rollup(edges, premiums, root):
    children = defaultdict(list)
    for parent, child in edges:
        children[parent].append(child)

    totals = {}

    def dfs(node):
        total = premiums.get(node, 0)
        for c in children[node]:
            total += dfs(c)
        totals[node] = total
        return total

    dfs(root)
    return totals
""",
    "complexity": "O(V + E) time and space.",
    "explanation": """
### Ruby to Python notes
- `premiums.get(node, 0)` is `premiums.fetch(node, 0)`. Bare `premiums[node]` raises `KeyError` -- unlike Ruby, which returns `nil`. Get comfortable with `.get()`; it prevents most beginner crashes.
- Nested `def dfs` closes over `children` and `totals` from the enclosing scope. **Reading** an outer variable works freely; **rebinding** one needs `nonlocal`. Mutating a dict or list in place counts as reading, which is why `totals[node] = ...` works without `nonlocal`.
- `children[node]` on a defaultdict returns `[]` for an unknown leaf instead of raising. Watch out: that also silently inserts the key. Use `children.get(node, [])` if you care.

### The iterative version, if they push
```
stack = [(root, False)]
while stack:
    node, processed = stack.pop()
    if processed:
        totals[node] = premiums.get(node, 0) + sum(totals[c] for c in children[node])
    else:
        stack.append((node, True))
        for c in children[node]:
            stack.append((c, False))
```
""",
    "followups": [
        "What if the input is a DAG, not a tree, so a broker can have two parents? (Premium gets double counted -- you need to decide the business rule, then memoise per node.)",
        "What if there is a cycle in the data because the customer's export is broken? (Track a visiting set; this is the next problem.)",
        "How would you do this roll-up in SQL? (Recursive CTE.)",
    ],
}

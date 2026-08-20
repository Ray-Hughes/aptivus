PROBLEM = {
    "title": "Find the rate band for a TIV",
    "difficulty": "medium",
    "pattern": "binary search",
    "tags": ["binary search", "array"],
    "minutes": 12,
    "mode": "function",
    "func": "rate_for",
    "prompt": """
A rate table is a sorted list of ascending thresholds and their rates:
`[[threshold, rate], ...]`. A total insured value (TIV) uses the rate of the
**highest threshold that is less than or equal to it**.

Return that rate, or `-1` if the TIV is below every threshold.

```
table = [[0, 1.0], [100000, 1.25], [500000, 1.6], [1000000, 2.1]]
rate_for(table, 250000) -> 1.25
rate_for(table, 100000) -> 1.25   (exact match takes that band)
rate_for(table, 0)      -> 1.0
```

The table can hold a million bands and you will be called on every quote, so scanning
linearly is not acceptable.

### Why this one
Binary search on "rightmost value <= x" is the variant people get wrong. Off-by-one
here is the single most common way to fail a coding round.
""",
    "starter": "def rate_for(table, tiv):\n    # table: list[[int, float]] sorted ascending by threshold\n    # tiv: int -> float\n    pass\n",
    "hints": [
        "Standard binary search finds an exact match. You want the rightmost element <= target, which needs a slightly different loop.",
        "Keep an 'answer' variable. When table[mid][0] <= tiv, that mid is a candidate: record it and search RIGHT for a better one. Otherwise search left.",
        "Python has bisect built in: bisect.bisect_right(keys, tiv) - 1 gives the index directly. Write it by hand first, then mention bisect.",
    ],
    "tests": [
        {"args": [[[0, 1.0], [100000, 1.25], [500000, 1.6], [1000000, 2.1]], 250000],
         "expected": 1.25, "sample": True},
        {"args": [[[0, 1.0], [100000, 1.25], [500000, 1.6], [1000000, 2.1]], 100000],
         "expected": 1.25, "sample": True},
        {"args": [[[100000, 1.25]], 5], "expected": -1, "sample": True},
        {"args": [[], 500], "expected": -1},
        {"args": [[[0, 1.0]], 0], "expected": 1.0},
        {"args": [[[0, 1.0], [100000, 1.25], [500000, 1.6], [1000000, 2.1]], 99999999],
         "expected": 2.1},
        {"args": [[[0, 1.0], [100000, 1.25], [500000, 1.6], [1000000, 2.1]], 499999],
         "expected": 1.25},
        {"args": [[[10, 0.5], [20, 0.6], [30, 0.7], [40, 0.8], [50, 0.9]], 30], "expected": 0.7},
        {"args": [[[10, 0.5], [20, 0.6], [30, 0.7], [40, 0.8], [50, 0.9]], 9], "expected": -1},
    ],
    "solution": """
def rate_for(table, tiv):
    lo, hi = 0, len(table) - 1
    ans = -1
    while lo <= hi:
        mid = (lo + hi) // 2
        if table[mid][0] <= tiv:
            ans = table[mid][1]     # candidate; maybe a higher band also fits
            lo = mid + 1
        else:
            hi = mid - 1
    return ans

# Library version once you have shown the manual one:
# import bisect
# i = bisect.bisect_right([t for t, _ in table], tiv) - 1
# return table[i][1] if i >= 0 else -1
""",
    "complexity": "O(log n) time, O(1) space.",
    "explanation": """
### Ruby to Python notes
- `//` is integer division. Plain `/` returns a **float** in Python 3, so `(lo+hi)/2` gives `2.5` and then `table[2.5]` raises `TypeError`. In Ruby `/` on two ints already floors. This is the number one Ruby-to-Python arithmetic trap.
- `lo, hi = 0, len(table) - 1` is tuple unpacking, same as Ruby's parallel assignment.
- `bisect` is Python's stdlib binary search: `bisect_left` finds the first index >= x, `bisect_right` finds the first index > x. Learn which is which now; you will reach for it.

### Getting the loop right every time
Use the `while lo <= hi` form with `mid+1` / `mid-1` and a saved `ans`. It terminates
by construction because the range strictly shrinks every iteration. If you find
yourself writing `while lo < hi` and then debugging an infinite loop live on Zoom,
you have chosen the harder template.
""",
    "followups": [
        "Return the band index rather than the rate.",
        "The table is not sorted when you get it. Does that change the complexity? (Sort once at load, O(n log n) amortised over many lookups.)",
        "Thresholds have duplicates. Which one wins? (bisect_right handles 'last matching' correctly; bisect_left does not.)",
    ],
}

PROBLEM = {
    "title": "Merge overlapping coverage periods",
    "difficulty": "medium",
    "pattern": "intervals / sort",
    "tags": ["sorting", "intervals", "greedy"],
    "minutes": 15,
    "mode": "function",
    "func": "merge_coverage",
    "prompt": """
An insured has several policies. Each is `[start_day, end_day]`, inclusive of start
and exclusive of end. Overlapping or touching periods represent continuous coverage.

Merge them and return the consolidated periods, sorted by start.

```
[[1,3],[2,6],[8,10],[15,18]] -> [[1,6],[8,10],[15,18]]
[[1,4],[4,5]]                -> [[1,5]]     (touching counts as continuous)
```

### Why this one
Interval merging is the second most common medium after Two Sum, and in insurance it
is a real question: gaps in coverage are a compliance problem.
""",
    "starter": "def merge_coverage(periods):\n    # periods: list[[int,int]] -> list[[int,int]]\n    pass\n",
    "hints": [
        "Sort by start first. Almost every interval problem opens with a sort -- once sorted, you only ever compare against the interval you just emitted.",
        "Walk the sorted list keeping a 'current' interval. If the next start is <= current end, they overlap.",
        "When they overlap, extend: current_end = max(current_end, next_end). The max matters -- [1,10] followed by [2,3] must stay [1,10], not shrink to [1,3].",
    ],
    "tests": [
        {"args": [[[1, 3], [2, 6], [8, 10], [15, 18]]],
         "expected": [[1, 6], [8, 10], [15, 18]], "sample": True},
        {"args": [[[1, 4], [4, 5]]], "expected": [[1, 5]], "sample": True},
        {"args": [[]], "expected": []},
        {"args": [[[5, 7]]], "expected": [[5, 7]]},
        {"args": [[[1, 10], [2, 3], [4, 5]]], "expected": [[1, 10]]},
        {"args": [[[8, 10], [1, 3]]], "expected": [[1, 3], [8, 10]]},
        {"args": [[[1, 2], [3, 4], [5, 6]]], "expected": [[1, 2], [3, 4], [5, 6]]},
        {"args": [[[1, 4], [0, 4]]], "expected": [[0, 4]]},
        {"args": [[[1, 4], [2, 3]]], "expected": [[1, 4]]},
    ],
    "solution": """
def merge_coverage(periods):
    if not periods:
        return []
    periods = sorted(periods)          # sorts by start, then end
    out = [list(periods[0])]
    for start, end in periods[1:]:
        if start <= out[-1][1]:        # overlaps or touches the last merged one
            out[-1][1] = max(out[-1][1], end)
        else:
            out.append([start, end])
    return out
""",
    "complexity": "O(n log n) for the sort, O(n) after. O(n) output space.",
    "explanation": """
### Ruby to Python notes
- `sorted(periods)` on a list of lists compares element by element -- `[1,3] < [2,6]` is True. Ruby's `<=>` on arrays does the same. So plain `sorted()` already sorts by start then end, no key needed.
- `out[-1]` is the last element. Negative indexing is a Python thing Rails devs love once they find it. `out[-1][1]` is "end of the last merged interval".
- `list(periods[0])` makes a **copy**. Without it you would mutate the caller's input, which the interviewer may or may not care about, but saying "I am copying so I do not mutate the input" is free credit.

### The variants you should expect as a follow-up
Insert-and-merge one new interval, count the max overlap at any point (sweep line with
+1/-1 events), and find the gaps. All three are the same sort-first idea.
""",
    "followups": [
        "Return the gaps in coverage between the first start and the last end.",
        "What is the maximum number of policies in force at once? (Sweep line: sort +1 at start and -1 at end, take a running max.)",
        "Intervals are dates, not ints. What changes? (Nothing -- datetime.date compares and maxes the same way.)",
    ],
}

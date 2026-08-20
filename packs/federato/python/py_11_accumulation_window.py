PROBLEM = {
    "title": "Peak accumulation in any 30-day window",
    "difficulty": "medium",
    "pattern": "sliding window on sorted events",
    "tags": ["sliding window", "two pointers", "sorting"],
    "minutes": 18,
    "mode": "function",
    "func": "peak_accumulation",
    "prompt": """
Catastrophe accumulation: you have bound policies, each `[day, tiv]`, where `day` is an
integer day number and `tiv` is total insured value. Events are **not sorted**.

Given a window size `w`, return the largest total TIV falling inside any window of `w`
consecutive days. A window starting at day `d` covers days `d` through `d + w - 1`
inclusive. Several policies can land on the same day.

```
events = [[1,100],[2,200],[5,50],[6,400]], w = 2
-> 450    (days 5-6: 50 + 400)
```

Return 0 for no events.

### Why this one
It is a sliding window where the window is measured in a **key**, not in element count.
That is the version people fumble, and it is also literally what Federato's Control
Tower computes.
""",
    "starter": "def peak_accumulation(events, w):\n    # events: list[[int,int]], w: int -> int\n    pass\n",
    "hints": [
        "Sort by day. Then a window is a contiguous slice of the sorted list, so two pointers work.",
        "Only windows that START at an event day can be optimal -- sliding further right can only drop events. So anchor the left pointer on each event in turn.",
        "Advance right while events[right][0] <= events[left][0] + w - 1, keeping a running sum. Both pointers only move forward, so it is O(n) after the sort, not O(n^2).",
    ],
    "tests": [
        {"args": [[[1, 100], [2, 200], [5, 50], [6, 400]], 2], "expected": 450, "sample": True},
        {"args": [[[1, 100], [2, 200], [5, 50], [6, 400]], 30], "expected": 750, "sample": True},
        {"args": [[], 30], "expected": 0, "sample": True},
        {"args": [[[10, 5]], 1], "expected": 5},
        {"args": [[[1, 10], [1, 20], [1, 30]], 1], "expected": 60},
        {"args": [[[1, 10], [100, 999], [101, 1]], 2], "expected": 1000},
        {"args": [[[5, 1], [1, 1], [3, 1], [2, 1], [4, 1]], 3], "expected": 3},
        {"args": [[[1, 5], [4, 5]], 3], "expected": 5},
        {"args": [[[1, 5], [4, 5]], 4], "expected": 10},
    ],
    "solution": """
def peak_accumulation(events, w):
    if not events:
        return 0
    events = sorted(events)          # by day, then tiv
    best = 0
    total = 0
    right = 0
    for left in range(len(events)):
        # extend the right edge as far as this window allows
        limit = events[left][0] + w - 1
        while right < len(events) and events[right][0] <= limit:
            total += events[right][1]
            right += 1
        best = max(best, total)
        total -= events[left][1]     # left is about to leave the window
    return best
""",
    "complexity": "O(n log n) for the sort, O(n) for the scan. O(1) extra space beyond the sort.",
    "explanation": """
### The insight worth stating
An optimal window can always be slid left until its first day is an event day, without
losing anything. So you only need to try `n` candidate windows, not every day on the
calendar. Say that before you write code -- it is the actual answer to the question.

### Ruby to Python notes
- `for left in range(len(events))` with a `right` that lives OUTSIDE the loop is the two-pointer idiom. Ruby devs tend to write a nested `each` here, which is O(n^2). The whole trick is that `right` never resets.
- `sorted(events)` on `[day, tiv]` pairs sorts by day first, then tiv. Free, because list comparison is lexicographic.
- There is no `do...while` in Python, so the inner `while` with its guard is the standard shape.

### Watch the ordering
`total -= events[left][1]` must come AFTER `best = max(...)`, otherwise you drop the
left event before scoring the window it belongs to. Trace `[[1,5],[4,5]]` with w=4 by hand.
""",
    "followups": [
        "Now report the window start day too, not just the value.",
        "Events arrive as a live stream and you need the current trailing-30-day total at all times. (Deque: append on arrival, popleft while the oldest is out of range.)",
        "Add a geographic dimension: peak accumulation per CAT zone. (Group by zone first, then run this per group.)",
    ],
}

PROBLEM = {
    "title": "Longest run of distinct risk codes",
    "difficulty": "medium",
    "pattern": "sliding window",
    "tags": ["sliding window", "hash map", "string"],
    "minutes": 15,
    "mode": "function",
    "func": "longest_unique",
    "prompt": """
A submission carries an ordered list of risk codes (a string, one char per code).
Return the **length of the longest contiguous stretch with no repeated code**.

```
"abcabcbb" -> 3   ("abc")
"bbbbb"    -> 1
"pwwkew"   -> 3   ("wke")
""     -> 0
```

### Why this one
Longest Substring Without Repeating Characters. If you only drill one sliding-window
problem, drill this one -- it is the template for every "longest/shortest window that
satisfies X" question.
""",
    "starter": "def longest_unique(codes):\n    # codes: str -> int\n    pass\n",
    "hints": [
        "Two pointers, left and right, defining a window. Move right one step at a time and only ever move left forward -- never backwards. That is what makes it O(n) instead of O(n^2).",
        "Keep a dict {char: last index seen}. When you see a repeat, you know exactly where to jump left to.",
        "Careful: only jump left FORWARD. left = max(left, last[ch] + 1). Without the max, a stale entry from before the window drags left backwards and you overcount.",
    ],
    "tests": [
        {"args": ["abcabcbb"], "expected": 3, "sample": True},
        {"args": ["bbbbb"], "expected": 1, "sample": True},
        {"args": ["pwwkew"], "expected": 3, "sample": True},
        {"args": [""], "expected": 0},
        {"args": ["a"], "expected": 1},
        {"args": ["abba"], "expected": 2},
        {"args": ["tmmzuxt"], "expected": 5},
        {"args": ["abcdefghijklmnopqrstuvwxyz"], "expected": 26},
        {"args": ["aab"], "expected": 2},
    ],
    "solution": """
def longest_unique(codes):
    last = {}          # char -> most recent index
    left = 0
    best = 0
    for right, ch in enumerate(codes):
        if ch in last and last[ch] >= left:
            left = last[ch] + 1
        last[ch] = right
        best = max(best, right - left + 1)
    return best
""",
    "complexity": "O(n) time, O(min(n, alphabet)) space.",
    "explanation": """
### The template worth memorising
```
left = 0
for right in range(len(arr)):
    add arr[right] to the window
    while window is invalid:
        remove arr[left] from the window
        left += 1
    best = max(best, right - left + 1)
```
Every sliding-window problem is that shape. The only thing that changes is what
"window state" and "invalid" mean.

### Ruby to Python notes
- `range(len(arr))` is `0...arr.length`. Ranges in Python are always exclusive at the top -- there is no `..` vs `...` distinction.
- `max(best, x)` is a builtin taking varargs; there is no `[a, b].max` need.
- The `last[ch] >= left` guard is the whole problem. Draw "abba" on paper by hand before you code it -- that is the case that separates a pass from a fail.
""",
    "followups": [
        "Return the substring itself, not just the length.",
        "Allow at most K repeats of any code. (Same template, different invalid condition.)",
        "Now it is a stream you cannot re-read. Does your solution still work? (Yes -- one pass, forward-only pointers.)",
    ],
}

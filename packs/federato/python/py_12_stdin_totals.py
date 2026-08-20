PROBLEM = {
    "title": "Read from stdin: premium totals per broker",
    "difficulty": "easy",
    "pattern": "stdin parsing",
    "tags": ["io", "hash map", "hackerrank"],
    "minutes": 12,
    "mode": "stdin",
    "func": "",
    "prompt": """
**This problem uses stdin/stdout**, exactly like the HackerRank pad Federato will
share with you. Read the input, print the answer. No function to fill in.

Input:
```
4
Marsh 1500
Aon 900
Marsh 600
Gallagher 250
```
The first line is `n`, the number of records. Each of the next `n` lines is
`broker premium`.

Print one line per broker, `broker total`, sorted by **total descending**, then by
broker name ascending:
```
Marsh 2100
Aon 900
Gallagher 250
```

### Why this one
The HackerRank interview pad defaults to a `input()` / `print()` skeleton (look at the
sample link they sent you -- it is literally `num1 = int(input())`). If the interviewer
hands you a stdin problem and you spend three minutes fighting the parsing, you have
burned 7% of the round. Make this reflexive.
""",
    "starter": "import sys\n\ndef main():\n    data = sys.stdin.read().split()\n    # ...\n\nmain()\n",
    "hints": [
        "sys.stdin.read().split() gives you every whitespace-separated token at once. Usually easier than line-by-line.",
        "For line-oriented input: n = int(input()) then loop n times with input().split().",
        "print('%s %d' % (name, total)) or an f-string, f'{name} {total}'. print adds the newline for you.",
    ],
    "tests": [
        {"stdin": "4\nMarsh 1500\nAon 900\nMarsh 600\nGallagher 250\n",
         "expected": "Marsh 2100\nAon 900\nGallagher 250", "sample": True},
        {"stdin": "1\nAon 5\n", "expected": "Aon 5", "sample": True},
        {"stdin": "0\n", "expected": ""},
        {"stdin": "3\nB 10\nA 10\nC 5\n", "expected": "A 10\nB 10\nC 5"},
        {"stdin": "5\nx 1\nx 1\nx 1\ny 2\nz 3\n", "expected": "x 3\nz 3\ny 2"},
    ],
    "solution": """
import sys
from collections import defaultdict

def main():
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    totals = defaultdict(int)
    for i in range(n):
        name = data[1 + 2 * i]
        premium = int(data[2 + 2 * i])
        totals[name] += premium
    for name, total in sorted(totals.items(), key=lambda kv: (-kv[1], kv[0])):
        print(name, total)

main()

# Line-oriented alternative:
# n = int(input())
# for _ in range(n):
#     name, premium = input().split()
""",
    "complexity": "O(n log n) because of the final sort.",
    "explanation": """
### The four stdin patterns to have in muscle memory
```
n = int(input())                      # one integer
a, b = map(int, input().split())      # two ints on one line
nums = list(map(int, input().split()))# a whole row of ints
rows = sys.stdin.read().split()       # everything, whitespace-separated
lines = sys.stdin.read().splitlines() # everything, one string per line
```

### Ruby to Python notes
- `input()` is Ruby's `gets.chomp` -- it strips the trailing newline for you. `sys.stdin.readline()` does NOT strip it, which is a classic mismatch.
- There is no implicit `to_i`. `input()` always gives a `str`; `"2" + 2` raises `TypeError` rather than coercing. In Ruby you would get a similar error, but Ruby people reach for `.to_i` -- in Python it is `int(x)`.
- `map(int, ...)` returns a lazy iterator, not a list. `list(map(...))` when you need to index or reuse it. This lazy-by-default behaviour is the biggest single difference from Ruby's eager `Enumerable`.
- `print(name, total)` inserts a space between arguments automatically. That is a Python nicety with no Ruby equivalent.

### In the real interview
`print` statements you leave in a stdin problem ARE the answer, so debug prints will
break your output. Send debug output to `sys.stderr` instead: `print(x, file=sys.stderr)`.
""",
    "followups": [
        "The input has no leading count -- just read until EOF. (for line in sys.stdin.)",
        "Broker names contain spaces. How do you parse now? (split with maxsplit, or rsplit(' ', 1).)",
        "The file is 5 GB. (Iterate line by line, never .read() it all.)",
    ],
}

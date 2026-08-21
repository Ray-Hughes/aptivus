# Ruby to Python, for someone who is already good at Ruby

You are not learning to program. You are learning a second syntax for things you
already know. This doc is only the deltas.

Read the **Gotchas** section twice. Everything else you will absorb by solving problems.

---

## 1. The gotchas that will actually bite you

These are the ones where your Ruby instinct is confidently wrong.

### `0` and `""` are FALSY in Python

```ruby
# Ruby
if 0 then puts "runs" end        # runs. Only nil and false are falsy.
```
```python
# Python
if 0: print("runs")              # does NOT run
if "": print("runs")             # does NOT run
if []: print("runs")             # does NOT run
```
Falsy in Python: `False`, `None`, `0`, `0.0`, `""`, `[]`, `{}`, `set()`, `()`.

**Where it bites:** `if count:` is a bug when `0` is a legitimate value.
Write `if count is not None:` when you mean "was it set".

### `/` returns a float

```ruby
7 / 2      # => 3       (Ruby floors for ints)
```
```python
7 / 2      # => 3.5     float!
7 // 2     # => 3       floor division -- this is what you want for mid = (lo+hi)//2
-7 // 2    # => -4      floors toward negative infinity, like Ruby
```
**Where it bites:** `arr[(lo+hi)/2]` raises `TypeError: list indices must be integers`.
This is the single most common Ruby-to-Python interview error.

### `dict[missing_key]` raises, it does not return nil

```ruby
h[:nope]              # => nil, and you chain happily
```
```python
d["nope"]             # KeyError!
d.get("nope")         # => None
d.get("nope", 0)      # => 0        <- use this constantly
```
There is no `&.` safe navigation. `None.foo` is an `AttributeError`.

### `.sort()` returns `None`

```ruby
sorted = arr.sort     # returns a new array
arr.sort!             # mutates AND returns the array
```
```python
arr.sort()            # mutates, returns None
new = sorted(arr)     # returns a new list        <- use this
new = arr.sort()      # new is None. Silent, painful bug.
```
Same for `.reverse()` vs `reversed()`, `.append()` (returns None).

### Iterators are lazy and single-use

```python
m = map(int, ["1","2"])
list(m)    # [1, 2]
list(m)    # []        <- already consumed!
```
`map`, `filter`, `zip`, `enumerate`, `reversed`, generators: all lazy.
Wrap in `list(...)` the moment you need to index, reuse, or `len()` it.
Ruby's `Enumerable` is eager, so this has no Ruby analogue.

### Mutable default arguments are evaluated ONCE

```python
def f(items=[]):      # NEVER do this
    items.append(1)
    return items
f()  # [1]
f()  # [1, 1]   <- same list, shared across calls
```
Correct: `def f(items=None): items = items or []`

### `[[]] * 3` gives you three references to the SAME list

```python
grid = [[0] * 3] * 3      # WRONG: rows are the same object
grid[0][0] = 9            # every row changes
grid = [[0] * 3 for _ in range(3)]   # correct
```
`[0] * 3` is fine (ints are immutable). Only the nesting is dangerous.

### `enumerate` yields `(index, value)` -- the opposite order to Ruby

```ruby
arr.each_with_index { |value, index| }
```
```python
for index, value in enumerate(arr):
```

### Lists cannot be dict keys

```python
d[[1,2]] = "x"        # TypeError: unhashable type: 'list'
d[(1,2)] = "x"        # fine -- tuples are immutable
```
A tuple is a frozen list. Reach for `tuple(sorted(x))` whenever you need a
canonical key.

---

## 2. Syntax translation table

| Ruby | Python |
|---|---|
| `def foo(a, b)` ... `end` | `def foo(a, b):` + indentation |
| `nil` / `true` / `false` | `None` / `True` / `False` (capitalized) |
| `x.nil?` | `x is None` |
| `puts x` | `print(x)` |
| `"#{a} and #{b}"` | `f"{a} and {b}"` |
| `arr.length` / `h.size` | `len(arr)` / `len(h)` |
| `arr.push(x)` / `<<` | `arr.append(x)` |
| `arr + arr2` | `arr + arr2` (same) |
| `arr.include?(x)` | `x in arr` |
| `h.key?(k)` | `k in h` (`in` on a dict checks KEYS) |
| `h.fetch(k, default)` | `h.get(k, default)` |
| `h.each { \|k, v\| }` | `for k, v in h.items():` |
| `h.keys` / `h.values` | `h.keys()` / `h.values()` |
| `arr.first` / `arr.last` | `arr[0]` / `arr[-1]` |
| `arr[1..3]` | `arr[1:4]` (end exclusive, always) |
| `arr.reverse` | `arr[::-1]` or `reversed(arr)` |
| `str.strip` / `split` | `str.strip()` / `str.split()` |
| `"a".ord` / `65.chr` | `ord("a")` / `chr(65)` |
| `x.to_i` / `.to_s` / `.to_f` | `int(x)` / `str(x)` / `float(x)` |
| `x.is_a?(Hash)` | `isinstance(x, dict)` |
| `unless x` | `if not x:` (no `unless`) |
| `x = a > b ? a : b` | `x = a if a > b else b` |
| `a ||= 5` | `a = a or 5` (careful: `0 or 5` is 5) |
| `loop do ... end` | `while True:` |
| `next` / `break` | `continue` / `break` |
| `raise "boom"` | `raise ValueError("boom")` |
| `begin/rescue/ensure` | `try/except/finally` |
| `attr_accessor` | just assign `self.x` in `__init__` |
| `@ivar` | `self.ivar` (and `self` is an explicit first param) |
| `1_000_000` | `1_000_000` (same!) |
| `#` comment | `#` comment (same) |

**Indentation is syntax.** 4 spaces. No `end`. A stray indent is a `IndentationError`,
which is at least loud rather than silent.

---

## 3. Enumerable, translated

This is the part you use constantly. Python's answer to blocks is
**comprehensions** plus a handful of builtins.

| Ruby | Python |
|---|---|
| `arr.map { \|x\| x * 2 }` | `[x * 2 for x in arr]` |
| `arr.select { \|x\| x > 3 }` | `[x for x in arr if x > 3]` |
| `arr.reject { \|x\| x > 3 }` | `[x for x in arr if x <= 3]` |
| `arr.map.with_index { \|x,i\| }` | `[f(x, i) for i, x in enumerate(arr)]` |
| `arr.sum` | `sum(arr)` |
| `arr.min` / `.max` | `min(arr)` / `max(arr)` |
| `arr.sort_by { \|x\| x.age }` | `sorted(arr, key=lambda x: x.age)` |
| `arr.sort_by { \|x\| [-x.n, x.name] }` | `sorted(arr, key=lambda x: (-x.n, x.name))` |
| `arr.group_by { \|x\| x.k }` | `defaultdict(list)` + a loop (no one-liner) |
| `arr.count { \|x\| x > 3 }` | `sum(1 for x in arr if x > 3)` |
| `arr.any? { \|x\| x > 3 }` | `any(x > 3 for x in arr)` |
| `arr.all? { \|x\| x > 3 }` | `all(x > 3 for x in arr)` |
| `arr.find { \|x\| x > 3 }` | `next((x for x in arr if x > 3), None)` |
| `arr.each_slice(2)` | `[arr[i:i+2] for i in range(0, len(arr), 2)]` |
| `arr.uniq` | `list(dict.fromkeys(arr))` (order-preserving) or `set(arr)` |
| `arr.flatten` | `[x for sub in arr for x in sub]` |
| `arr.zip(other)` | `zip(arr, other)` |
| `arr.tally` | `collections.Counter(arr)` |
| `arr.each_cons(2)` | `zip(arr, arr[1:])` |
| `h.transform_values { }` | `{k: f(v) for k, v in h.items()}` |
| `arr.partition { }` | two comprehensions, or `itertools` |
| `arr.reduce(:+)` | `sum(arr)`; general: `functools.reduce` |

**Comprehension shapes:**
```python
[expr for x in it]                # list
{expr for x in it}                # set
{k: v for x in it}                # dict
(expr for x in it)                # generator (lazy, no brackets needed in a call)
sum(x.premium for x in accounts)  # generator passed straight to a function
```

Nested loops read outer-first, which surprises everyone:
```python
[x for row in grid for x in row]   # same order as: for row in grid: for x in row:
```

---

## 4. The stdlib you actually need in an interview

```python
from collections import defaultdict, Counter, deque, OrderedDict
import heapq, bisect, math, re, json, sys
from functools import lru_cache
from itertools import combinations, permutations, groupby
```

| Tool | Use it for |
|---|---|
| `defaultdict(list)` | grouping without `setdefault` ceremony |
| `defaultdict(int)` | counting |
| `Counter(iterable)` | frequency counts; `.most_common(k)` |
| `deque()` | O(1) `popleft()`. **A list's `pop(0)` is O(n)** -- use deque for BFS queues |
| `heapq` | min-heap on a plain list. `heappush/heappop/heapify/nsmallest` |
| `bisect` | binary search on a sorted list |
| `lru_cache` | one-line memoization for recursion |
| `re` | `re.findall`, `re.sub`, `re.match` |

**heapq is always a MIN heap.** For a max-heap, push negated values:
`heapq.heappush(h, -x)` and negate again on pop.

---

## 5. Idioms worth having in your fingers

```python
# swap
a, b = b, a

# unpack
first, *rest = [1, 2, 3]        # first=1, rest=[2,3]

# chained comparison (no Ruby equivalent)
if 0 <= i < len(arr):

# multiple return values (it is just a tuple)
def f(): return 1, 2
x, y = f()

# dict iteration
for k, v in d.items():

# sort by tuple: descending count, ascending name
sorted(items, key=lambda kv: (-kv[1], kv[0]))

# build a string efficiently
"".join(parts)                  # NOT s += x in a loop

# 2D grid
grid = [[0] * cols for _ in range(rows)]

# infinity
best = float("inf")

# ignore a value
for _name, premium in records:

# string is iterable char by char -- careful with recursion
for ch in "abc":
```

**Walrus operator** (`:=`), Python 3.8+, occasionally handy:
```python
while (line := f.readline()):
```
Do not go looking for chances to use it in an interview.

---

## 6. Reading stdin (HackerRank's default pad)

The pad Federato shares defaults to a `input()` / `print()` skeleton. Have these
memorized cold:

```python
n = int(input())                          # one integer on a line
a, b = map(int, input().split())          # two ints on one line
nums = list(map(int, input().split()))    # a row of ints
name, premium = input().split()           # strings

import sys
data = sys.stdin.read().split()           # ALL tokens, whitespace separated
lines = sys.stdin.read().splitlines()     # ALL lines, newline stripped
for line in sys.stdin:                    # stream until EOF
    line = line.rstrip("\n")
```

`input()` strips the trailing newline (like `gets.chomp`).
`sys.stdin.readline()` does **not**.

Debug output must go to stderr or it becomes part of your answer:
```python
print("debugging", file=sys.stderr)
```

---

## 7. Classes, briefly

You almost certainly will not need one in a 45 minute round, but just in case:

```python
class Node:
    def __init__(self, val):     # initialize
        self.val = val
        self.next = None

    def __repr__(self):          # inspect / to_s
        return f"Node({self.val})"
```
`self` is an explicit first parameter on every method. There is no `attr_accessor`;
attributes are just assigned. There is no `private` -- a leading underscore is a
convention, not enforcement.

---

## 8. What to say when you are unsure of a method name

Do not freeze. Say: **"In Ruby I would reach for `group_by` here -- in Python I
believe that is a `defaultdict` and a loop, let me write it out."**

Interviewers do not care that you are new to the syntax. They care that you know
what you are trying to do. Naming the operation you want is the signal; the exact
method name is trivia.

PROBLEM = {
    "title": "LRU cache for rating-engine lookups",
    "difficulty": "hard",
    "pattern": "design / ordered dict",
    "tags": ["design", "hash map", "linked list"],
    "minutes": 20,
    "mode": "function",
    "func": "run_ops",
    "prompt": """
Rate lookups are expensive, so you cache them. Implement a fixed-capacity LRU cache
and replay a list of operations against it.

`ops` is a list where each item is either `["put", key, value]` or `["get", key]`.
Return the list of results from the `get` operations, using `-1` for a miss.

Both operations must be **O(1)**.

```
run_ops(2, [["put",1,1],["put",2,2],["get",1],["put",3,3],["get",2],["get",3]])
-> [1, -1, 3]
```
(Capacity 2. Putting 3 evicts key 2, because key 1 was used more recently.)

### Why this one
The classic design question. It is really "do you know that a dict plus an ordering
structure gives you O(1) both ways". In Python the honest answer is one stdlib class,
so know both the shortcut and what it is doing underneath.
""",
    "starter": "def run_ops(capacity, ops):\n    # capacity: int, ops: list -> list[int]\n    pass\n",
    "hints": [
        "collections.OrderedDict remembers insertion order AND gives you move_to_end() and popitem(last=False) in O(1). That is an LRU cache.",
        "A plain dict preserves insertion order in Python 3.7+, but it has no O(1) move-to-end, so you need OrderedDict (or a hand-rolled doubly linked list).",
        "A get must also count as a use -- move the key to the end on a hit, not just on a put.",
    ],
    "tests": [
        {"args": [2, [["put", 1, 1], ["put", 2, 2], ["get", 1], ["put", 3, 3], ["get", 2], ["get", 3]]],
         "expected": [1, -1, 3], "sample": True},
        {"args": [1, [["put", 1, 1], ["put", 2, 2], ["get", 1], ["get", 2]]],
         "expected": [-1, 2], "sample": True},
        {"args": [2, [["get", 9]]], "expected": [-1]},
        {"args": [2, [["put", 1, 1], ["put", 1, 5], ["get", 1]]], "expected": [5]},
        {"args": [0, [["put", 1, 1], ["get", 1]]], "expected": [-1]},
        {"args": [3, [["put", 1, 1], ["put", 2, 2], ["put", 3, 3], ["get", 1],
                      ["put", 4, 4], ["get", 2], ["get", 1], ["get", 4]]],
         "expected": [1, -1, 1, 4]},
        {"args": [2, [["put", 2, 1], ["put", 1, 1], ["put", 2, 3], ["put", 4, 1],
                      ["get", 1], ["get", 2]]],
         "expected": [-1, 3]},
    ],
    "solution": """
from collections import OrderedDict

def run_ops(capacity, ops):
    cache = OrderedDict()      # oldest at the front, newest at the back
    out = []
    for op in ops:
        if op[0] == "get":
            key = op[1]
            if key in cache:
                cache.move_to_end(key)        # mark as most recently used
                out.append(cache[key])
            else:
                out.append(-1)
        else:
            _, key, value = op
            if key in cache:
                cache.move_to_end(key)
            cache[key] = value
            if len(cache) > capacity:
                cache.popitem(last=False)     # evict least recently used
    return out
""",
    "complexity": "O(1) amortised per operation, O(capacity) space.",
    "explanation": """
### What to say when you reach for OrderedDict
"In production I would use `OrderedDict` -- or `functools.lru_cache` for a pure function.
Underneath it is a hash map to nodes plus a doubly linked list: the map gives O(1)
lookup, the list gives O(1) move-to-front and O(1) eviction from the tail. I can write
the linked list version if you would rather see it."

That answer gets full marks. Reaching for OrderedDict *without* being able to explain
the underlying structure is what loses the point.

### Ruby to Python notes
- `cache.popitem(last=False)` pops from the FRONT. `last=True` (the default) pops from the back. Keyword arguments with defaults are everywhere in Python -- get comfortable passing them by name.
- `_, key, value = op` unpacks a 3-element list. It raises `ValueError` if the length does not match, which is why the `get` branch (2 elements) is handled separately.
- `functools.lru_cache` is the decorator version: `@lru_cache(maxsize=128)` on any pure function. Ruby has no equivalent in stdlib.

### The capacity 0 edge case
It is in the tests deliberately. A cache with capacity 0 must evict immediately and
always miss. Candidates who never check their edge cases fail exactly here.
""",
    "followups": [
        "Write it with a hand-rolled doubly linked list, no OrderedDict.",
        "Add a TTL so entries expire after N seconds. (Store an expiry timestamp; lazily evict on read, plus a periodic sweep.)",
        "Make it thread safe. (A lock around the whole op -- and then discuss why that serialises everything, and what a sharded cache buys you.)",
    ],
}

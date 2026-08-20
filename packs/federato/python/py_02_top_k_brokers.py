PROBLEM = {
    "title": "Top K brokers by submission volume",
    "difficulty": "easy",
    "pattern": "counting + heap",
    "tags": ["hash map", "heap", "sorting"],
    "minutes": 12,
    "mode": "function",
    "func": "top_k_brokers",
    "prompt": """
You are given a list of submission records. Each record is `[broker_name, premium]`.

Return the names of the **k brokers with the most submissions**, ordered from most
to fewest. Break ties alphabetically by broker name.

### Why this one
Counting then ranking is the most common "real data" question there is, and the
tie-break rule is where most candidates lose the point. Handle it explicitly.
""",
    "starter": "def top_k_brokers(records, k):\n    # records: list[[str, int]], k: int -> list[str]\n    pass\n",
    "hints": [
        "Step 1 is a frequency count. collections.Counter does it in one line.",
        "For the ranking, sort by a tuple key. Python sorts tuples left to right.",
        "You want descending count but ascending name. Use key=lambda kv: (-kv[1], kv[0]) so the negation flips only the count.",
    ],
    "tests": [
        {"args": [[["Marsh", 100], ["Aon", 50], ["Marsh", 200], ["Gallagher", 75], ["Aon", 10]], 2],
         "expected": ["Aon", "Marsh"], "sample": True},
        {"args": [[["Aon", 1], ["Marsh", 1]], 2], "expected": ["Aon", "Marsh"], "sample": True},
        {"args": [[["Zurich", 1], ["Aon", 1], ["Marsh", 1]], 2], "expected": ["Aon", "Marsh"]},
        {"args": [[], 3], "expected": []},
        {"args": [[["Aon", 5]], 5], "expected": ["Aon"]},
        {"args": [[["A", 1], ["B", 1], ["A", 1], ["B", 1], ["C", 1]], 3], "expected": ["A", "B", "C"]},
        {"args": [[["x", 0]], 0], "expected": []},
    ],
    "solution": """
from collections import Counter

def top_k_brokers(records, k):
    counts = Counter(name for name, _premium in records)
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    return [name for name, _c in ranked[:k]]

# Heap variant, better when k is much smaller than n:
# import heapq
# return [n for n, _ in heapq.nsmallest(k, counts.items(), key=lambda kv: (-kv[1], kv[0]))]
""",
    "complexity": "Sort version: O(n + m log m) where m is distinct brokers. Heap version: O(n + m log k).",
    "explanation": """
### Ruby to Python notes
- `Counter` is `records.group_by(&:first).transform_values(&:size)` in one call.
- `for name, _premium in records` is destructuring, same as Ruby block args `|name, _premium|`.
- Leading underscore means "I am deliberately ignoring this". Python has no `_` warning, it is convention only.
- Python's `sorted` is stable, like Ruby's `sort_by`.

### The tie-break trick
You cannot write `reverse=True` here, because that would reverse the name order too.
Negating the numeric part of the tuple gives you "descending count, ascending name"
in one key. Interviewers watch for exactly this.
""",
    "followups": [
        "n is 10 million records and k is 10. What changes? (Heap of size k, O(n log k), constant memory in k.)",
        "What if ties should be broken by total premium instead of name?",
        "How would you do this in SQL? (This is the same thing as a GROUP BY with ORDER BY count DESC LIMIT k.)",
    ],
}

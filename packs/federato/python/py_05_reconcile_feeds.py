PROBLEM = {
    "title": "Reconcile two policy feeds",
    "difficulty": "medium",
    "pattern": "dict diff",
    "tags": ["hash map", "sets", "real world"],
    "minutes": 15,
    "mode": "function",
    "func": "reconcile",
    "prompt": """
A customer sends you a nightly extract from their legacy policy admin system, and
you have the same policies in your platform. You must produce a reconciliation report.

Each feed is a list of records `[policy_id, premium]`. Policy ids are unique within a feed.

Return a dict with exactly these three keys:

- `"missing"`: ids present in `legacy` but not in `platform`, sorted
- `"extra"`: ids present in `platform` but not in `legacy`, sorted
- `"mismatched"`: `[id, legacy_premium, platform_premium]` for ids in both whose
  premium differs, sorted by id

### Why this one
This is the Forward Deployed Engineer job in miniature. It is not hard -- it is a test
of whether you structure data cleanly and handle the three-way split without
tangling yourself in loops.
""",
    "starter": "def reconcile(legacy, platform):\n    # legacy, platform: list[[str, int]] -> dict\n    pass\n",
    "hints": [
        "Turn each list into a dict {id: premium} first. Everything else becomes set arithmetic.",
        "Python sets support - and & directly: legacy_keys - platform_keys is the difference.",
        "dict(list_of_pairs) builds a dict from [key, value] pairs in one call.",
    ],
    "tests": [
        {"args": [[["P1", 100], ["P2", 200], ["P3", 300]], [["P2", 250], ["P3", 300], ["P4", 400]]],
         "expected": {"missing": ["P1"], "extra": ["P4"], "mismatched": [["P2", 200, 250]]},
         "sample": True},
        {"args": [[], []], "expected": {"missing": [], "extra": [], "mismatched": []}, "sample": True},
        {"args": [[["A", 1]], []], "expected": {"missing": ["A"], "extra": [], "mismatched": []}},
        {"args": [[], [["A", 1]]], "expected": {"missing": [], "extra": ["A"], "mismatched": []}},
        {"args": [[["A", 1], ["B", 2]], [["B", 2], ["A", 1]]],
         "expected": {"missing": [], "extra": [], "mismatched": []}},
        {"args": [[["B", 5], ["A", 9]], [["A", 1], ["B", 5]]],
         "expected": {"missing": [], "extra": [], "mismatched": [["A", 9, 1]]}},
        {"args": [[["P10", 1], ["P2", 1]], [["P10", 2], ["P2", 2]]],
         "expected": {"missing": [], "extra": [],
                      "mismatched": [["P10", 1, 2], ["P2", 1, 2]]}},
    ],
    "solution": """
def reconcile(legacy, platform):
    L = dict(legacy)
    P = dict(platform)
    lk, pk = set(L), set(P)

    return {
        "missing": sorted(lk - pk),
        "extra": sorted(pk - lk),
        "mismatched": sorted(
            [k, L[k], P[k]] for k in (lk & pk) if L[k] != P[k]
        ),
    }
""",
    "complexity": "O(n + m) time and space.",
    "explanation": """
### Ruby to Python notes
- `set(L)` on a dict gives the **keys** as a set. Iterating a dict iterates keys too -- `for k in mydict` is `mydict.each_key`.
- Set operators: `-` difference, `&` intersection, `|` union, `^` symmetric difference. Ruby's Set needs `require 'set'`; Python's is built in and has a literal `{1, 2}`.
- `sorted(...)` returns a new list. `.sort()` mutates in place and returns `None` -- assigning `x = y.sort()` gives you `None` and is the classic Python-beginner bug. Ruby's `sort!` at least returns the array.
- `dict(list_of_pairs)` is `Hash[pairs]`.

### What the interviewer is watching for
Do you ask about duplicate ids within a feed? Do you ask whether float premiums need
a tolerance instead of `!=`? Asking those two questions is worth more than the code.
""",
    "followups": [
        "Premiums are floats coming from two different systems. How do you compare them? (Round to cents, or abs(a-b) < 0.005 -- never ==.)",
        "The legacy feed can contain the same policy id twice with different premiums. What now?",
        "The feeds are 40 million rows each. How would you do this without loading both into memory? (Sort both by id, merge-scan -- or just do it in SQL.)",
    ],
}

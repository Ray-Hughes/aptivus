PROBLEM = {
    "title": "Two accounts hitting a premium target",
    "difficulty": "easy",
    "pattern": "hash map",
    "tags": ["hash map", "array"],
    "minutes": 10,
    "mode": "function",
    "func": "find_pair",
    "prompt": """
An underwriter wants to bind exactly two accounts whose premiums add up to a target.

Given a list of premiums and a target, return the **indices** of the two accounts
as a list `[i, j]` with `i < j`. Exactly one valid pair exists. Return `[]` if none.

Do it in one pass.

### Why this one
This is Two Sum. It is the canonical "can you reach for a dict instead of a nested
loop" question, and it is the single most likely warm-up in a 45 minute round.
""",
    "starter": "def find_pair(premiums, target):\n    # premiums: list[int], target: int -> list[int]\n    pass\n",
    "hints": [
        "The brute force is two nested loops, O(n^2). What would let you ask 'have I already seen the number I need?' in O(1)?",
        "As you walk the list, store {value: index} for everything you have already passed.",
        "For each premium p, the number you need is target - p. Check the dict BEFORE inserting p, so you never pair an element with itself.",
    ],
    "tests": [
        {"args": [[2500, 7500, 11000, 4000], 6500], "expected": [0, 3], "sample": True},
        {"args": [[3000, 3000], 6000], "expected": [0, 1], "sample": True},
        {"args": [[1000, 2000, 3000], 10000], "expected": []},
        {"args": [[5, -2, 7, 1], 5], "expected": [1, 2]},
        {"args": [[0, 0, 4], 0], "expected": [0, 1]},
        {"args": [[100000, 250, 99750], 100000], "expected": [1, 2]},
        {"args": [[42], 42], "expected": []},
        {"args": [[], 0], "expected": []},
    ],
    "solution": """
def find_pair(premiums, target):
    seen = {}                       # value -> index we saw it at
    for i, p in enumerate(premiums):
        need = target - p
        if need in seen:
            return [seen[need], i]
        seen[p] = i                 # insert AFTER the check
    return []
""",
    "complexity": "O(n) time, O(n) space.",
    "explanation": """
### Ruby to Python notes
- `enumerate(xs)` is Ruby's `each_with_index`, but the pair order is `(index, value)` -- the reverse of Ruby's `|value, index|`. This bites Rails people constantly.
- `need in seen` is `seen.key?(need)`. On a dict, `in` checks **keys**, not values.
- `seen[p] = i` needs no initialization. There is no `Hash.new(0)` ceremony unless you want a default; then use `collections.defaultdict`.

### Say this out loud
"Brute force is O(n squared). I will trade space for time with a dict of value to index,
checking for the complement before I insert so an element never pairs with itself."
""",
    "followups": [
        "What if there can be many valid pairs and you must return all of them, without duplicates?",
        "What if the input is already sorted? (Two pointers, O(1) extra space.)",
        "What if the list does not fit in memory?",
    ],
}

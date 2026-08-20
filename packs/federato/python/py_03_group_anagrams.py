PROBLEM = {
    "title": "Group records by a derived key (anagrams)",
    "difficulty": "easy",
    "pattern": "hash grouping",
    "tags": ["hash map", "string"],
    "minutes": 10,
    "mode": "function",
    "func": "group_anagrams",
    "prompt": """
Given a list of strings, group together the ones that are anagrams of each other.

Return a list of groups. **Order does not matter** for the groups or within them,
but sort each group alphabetically and sort the list of groups so your output is
deterministic.

```
["eat","tea","tan","ate","nat","bat"]
-> [["ate","eat","tea"],["bat"],["nat","tan"]]
```

### Why this one
Forget anagrams for a second. The skill is "build a canonical key from each record,
then bucket by it" -- exactly what you do when you dedupe insureds across two carrier
feeds. Same code, different key function.
""",
    "starter": "def group_anagrams(words):\n    # words: list[str] -> list[list[str]]\n    pass\n",
    "hints": [
        "Two words are anagrams iff their sorted letters are equal. That sorted string is your bucket key.",
        "collections.defaultdict(list) lets you append without checking whether the key exists.",
        "sorted('eat') gives a list ['a','e','t']. Join it back into a string, or use tuple(sorted(w)) as the key -- lists cannot be dict keys because they are mutable.",
    ],
    "tests": [
        {"args": [["eat", "tea", "tan", "ate", "nat", "bat"]],
         "expected": [["ate", "eat", "tea"], ["bat"], ["nat", "tan"]], "sample": True},
        {"args": [[""]], "expected": [[""]], "sample": True},
        {"args": [["a"]], "expected": [["a"]]},
        {"args": [[]], "expected": []},
        {"args": [["abc", "cba", "bca", "xyz"]], "expected": [["abc", "bca", "cba"], ["xyz"]]},
        {"args": [["ab", "ba", "ab"]], "expected": [["ab", "ab", "ba"]]},
    ],
    "solution": """
from collections import defaultdict

def group_anagrams(words):
    buckets = defaultdict(list)
    for w in words:
        key = tuple(sorted(w))       # canonical form
        buckets[key].append(w)
    return sorted(sorted(g) for g in buckets.values())
""",
    "complexity": "O(n * k log k) where k is the max word length. O(n * k) space.",
    "explanation": """
### Ruby to Python notes
- `defaultdict(list)` is `Hash.new { |h,k| h[k] = [] }`. Without it you would write
  `buckets.setdefault(key, []).append(w)`.
- A dict key must be **hashable**, so `tuple(sorted(w))` works but `sorted(w)` (a list) raises
  `TypeError: unhashable type: 'list'`. Tuples are frozen lists. This is the closest thing
  Python has to a gotcha that Ruby does not share.
- `sorted(generator)` works fine; you do not need to materialise a list first.

### Generalising it
Swap the key function and this becomes a fuzzy-match deduper:
`key = re.sub(r'[^a-z]', '', name.lower())` groups "ACME Corp." with "Acme Corp".
Mention that connection in the interview -- it lands well for a Forward Deployed role.
""",
    "followups": [
        "Can you avoid the sort in the key? (Use a 26-length count tuple, O(k) per word.)",
        "How would you group 50 million strings that do not fit in memory?",
    ],
}

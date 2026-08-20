PROBLEM = {
    "title": "Flatten a nested submission payload",
    "difficulty": "medium",
    "pattern": "recursion",
    "tags": ["recursion", "dict", "real world"],
    "minutes": 15,
    "mode": "function",
    "func": "flatten",
    "prompt": """
A broker API sends deeply nested JSON. To load it into a flat warehouse table you must
flatten it to dotted keys.

- Nested dicts join with `.`
- Lists use the index as a path segment
- An empty dict or empty list maps to the value `null` (Python `None`) at its own path
- Everything else is a leaf
- An empty payload at the top level returns `{}` (there is no path to hang a null on)

```
{"insured": {"name": "Acme", "locs": [{"st": "CA"}, {"st": "NY"}]}, "tiv": 5}
->
{"insured.name": "Acme",
 "insured.locs.0.st": "CA",
 "insured.locs.1.st": "NY",
 "tiv": 5}
```

### Why this one
Every Forward Deployed Engineer writes this function in their first month. It is also
a clean recursion test with edge cases that reward careful thinking rather than
cleverness.
""",
    "starter": "def flatten(payload):\n    # payload: dict -> dict[str, any]\n    pass\n",
    "hints": [
        "Recursive helper: walk(node, prefix). Dispatch on isinstance(node, dict) / isinstance(node, list) / else leaf.",
        "Build the child prefix as prefix + '.' + key when prefix is non-empty, else just key. Getting that top-level case right is most of the problem.",
        "The empty TOP-LEVEL payload is special: there is no key path, so return {} rather than {'': None}. Guard it first.",
        "Handle the empty container BEFORE you loop -- otherwise the loop body never runs and the path silently disappears from the output.",
    ],
    "tests": [
        {"args": [{"insured": {"name": "Acme", "locs": [{"st": "CA"}, {"st": "NY"}]}, "tiv": 5}],
         "expected": {"insured.name": "Acme", "insured.locs.0.st": "CA",
                      "insured.locs.1.st": "NY", "tiv": 5}, "sample": True},
        {"args": [{}], "expected": {}, "sample": True},
        {"args": [{"a": {}}], "expected": {"a": None}, "sample": True},
        {"args": [{"a": []}], "expected": {"a": None}},
        {"args": [{"a": 1, "b": None}], "expected": {"a": 1, "b": None}},
        {"args": [{"a": {"b": {"c": {"d": 7}}}}], "expected": {"a.b.c.d": 7}},
        {"args": [{"xs": [1, 2, 3]}], "expected": {"xs.0": 1, "xs.1": 2, "xs.2": 3}},
        {"args": [{"a": [[1], [2]]}], "expected": {"a.0.0": 1, "a.1.0": 2}},
        {"args": [{"ok": True, "n": 1.5}], "expected": {"ok": True, "n": 1.5}},
    ],
    "solution": """
def flatten(payload):
    if not payload:
        return {}
    out = {}

    def walk(node, prefix):
        if isinstance(node, dict):
            if not node:
                out[prefix] = None
                return
            for k, v in node.items():
                walk(v, f"{prefix}.{k}" if prefix else str(k))
        elif isinstance(node, list):
            if not node:
                out[prefix] = None
                return
            for i, v in enumerate(node):
                walk(v, f"{prefix}.{i}" if prefix else str(i))
        else:
            out[prefix] = node

    walk(payload, "")
    return out
""",
    "complexity": "O(total nodes) time; output size is O(number of leaves).",
    "explanation": """
### Ruby to Python notes
- `isinstance(x, dict)` is `x.is_a?(Hash)`. Check `dict` and `list` explicitly -- do NOT check "is it iterable", because strings are iterable in Python and you will recurse into `"Acme"` one character at a time. That is the bug this problem is really testing for.
- f-strings: `f"{prefix}.{k}"` is Ruby's `"#{prefix}.#{k}"`. They are the modern way; use them everywhere.
- `for k, v in node.items()` is `each_pair`. Bare `for k in node` gives keys only.
- `True` and `None` are capitalised. `true` and `nil` are `NameError`s.

### The three edge cases that separate answers
1. Empty dict / empty list -- the spec says they become `None`, so handle them before the loop.
2. `None` as an actual value is a leaf, not an empty container.
3. Top-level keys must have no leading dot. Check your `if prefix else` branch.

Read the spec back to the interviewer before coding. On a data-integration problem that
IS the skill being measured.
""",
    "followups": [
        "Write the inverse: unflatten a dotted dict back to nested. (Harder -- you must decide whether '0' means a list index or a string key.)",
        "Keys can themselves contain a dot. How do you keep it unambiguous? (Escape them, or emit path tuples instead of strings.)",
        "The payload is 200 MB. (Streaming parser like ijson; yield leaves instead of building a dict.)",
    ],
}

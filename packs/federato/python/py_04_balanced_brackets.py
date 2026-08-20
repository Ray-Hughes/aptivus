PROBLEM = {
    "title": "Validate a nested rule expression (balanced brackets)",
    "difficulty": "easy",
    "pattern": "stack",
    "tags": ["stack", "string"],
    "minutes": 10,
    "mode": "function",
    "func": "is_valid",
    "prompt": """
Underwriting rules are stored as nested expressions using `()`, `[]` and `{}`.
Given the bracket skeleton of one, return `True` if every bracket is closed by the
matching type in the right order, else `False`.

```
"([]{})"  -> True
"([)]"    -> False
"("       -> False
```
""",
    "starter": "def is_valid(s):\n    # s: str -> bool\n    pass\n",
    "hints": [
        "Whenever a problem says 'most recently opened', reach for a stack. In Python a plain list IS the stack: .append() and .pop().",
        "Push opening brackets. On a closing bracket, pop and check the pair matches.",
        "Two ways to fail: popping an empty stack, and a non-empty stack at the end.",
    ],
    "tests": [
        {"args": ["([]{})"], "expected": True, "sample": True},
        {"args": ["([)]"], "expected": False, "sample": True},
        {"args": [""], "expected": True},
        {"args": ["("], "expected": False},
        {"args": [")"], "expected": False},
        {"args": ["{[()]}"], "expected": True},
        {"args": ["{[(])}"], "expected": False},
        {"args": ["(((((((((())))))))))"], "expected": True},
        {"args": ["]["], "expected": False},
    ],
    "solution": """
def is_valid(s):
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    for ch in s:
        if ch in "([{":
            stack.append(ch)
        elif ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
    return not stack
""",
    "complexity": "O(n) time, O(n) space.",
    "explanation": """
### Ruby to Python notes
- A Python `list` is Ruby's Array. `append` is `push`, `pop` is `pop`. There is no `Stack` class and you do not want one.
- `if not stack` is the idiomatic empty check. Empty list, empty string, empty dict, `0` and `None` are all falsy -- same instinct as Ruby except **`0` and `""` are falsy in Python** and truthy in Ruby. That difference will burn you at least once.
- `stack.pop()` on an empty list raises `IndexError`, which is why the `not stack or` guard comes first. `or` short-circuits exactly like Ruby.

### Say this out loud
"Matching pairs with a most-recent-first rule is a stack. One pass, and I check both
failure modes: a close with nothing open, and opens left over at the end."
""",
    "followups": [
        "Now return the index of the first offending character instead of a bool.",
        "Extend it to also validate quoted strings, where brackets inside quotes are literal.",
    ],
}

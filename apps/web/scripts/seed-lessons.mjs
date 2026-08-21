/**
 * The sample lessons themselves, in their own module so the seeder and the
 * verification check read exactly one copy. A fixture that drifts from what
 * was checked is worse than no fixture.
 */
const LESSONS = [
  {
    title: "Truthiness: empty is false here",
    relevance:
      "Every request handler you touch will branch on a list or a dict that came back from a query, and Ruby taught you the opposite rule.",
    estimatedMinutes: 7,
    func: "describe_batch",
    teaching: `## The habit

In Ruby, only \`nil\` and \`false\` are falsy. Everything else is true —
including \`0\`, \`""\` and \`[]\`:

\`\`\`ruby
if results        # true even when results == []
  render results
end
\`\`\`

## Here

Python treats emptiness as false. \`0\`, \`""\`, \`[]\`, \`{}\`, \`set()\` and
\`None\` are all falsy:

\`\`\`python
if results:       # False when results == []
    render(results)
\`\`\`

## The trap

This is the one that gets Rubyists in production, because both branches are
reachable and neither raises. \`if results:\` now treats *"the query ran and
legitimately found nothing"* the same as *"the query never ran"*. And
\`if user.credits:\` skips the user who has exactly zero credits — which is a
real user, with a real balance, who now silently gets nothing.

The fix is to say which question you are asking:

\`\`\`python
if results is not None:   # did it run?
if len(results) > 0:      # did it find anything?
\`\`\``,
    scaffold: `def describe_batch(rows):
    """Return one of three strings:

      "no batch"   - rows is None; the query never ran
      "empty"      - rows ran and came back with nothing
      "3 rows"     - however many rows there are

    The whole point of this lesson is that the first two are
    different things, and that "if rows:" cannot tell them apart.
    """
    # your turn
`,
    solution: `def describe_batch(rows):
    if rows is None:
        return "no batch"
    if len(rows) == 0:
        return "empty"
    return f"{len(rows)} rows"
`,
    hints: [
      "Write the None check first, on its own line. Once you start with `if rows:` you have already lost the distinction.",
      "`rows is None` asks whether it ran. `len(rows) == 0` asks whether it found anything. You need both, in that order.",
      "Three returns, no elif needed: `if rows is None: return ...`, then `if len(rows) == 0: return ...`, then the count.",
    ],
    tests: [
      { args: [null], expected: "no batch", sample: true },
      { args: [[]], expected: "empty", sample: true },
      { args: [[1, 2, 3]], expected: "3 rows", sample: false },
      { args: [[0]], expected: "1 rows", sample: false },
      { args: [[0, 0]], expected: "2 rows", sample: false },
    ],
  },
  {
    title: "A method without parentheses is an object",
    relevance:
      "Ruby lets you drop the parens everywhere, and Python turns that same keystroke into a condition that is always true.",
    estimatedMinutes: 6,
    func: "active_names",
    teaching: `## The habit

Ruby calls the method either way. \`user.admin?\` and \`user.admin?()\` are the
same thing, and dropping the parens is idiomatic.

## Here

\`user.is_admin\` does not call anything. It *evaluates to the method itself* —
a bound method object. \`user.is_admin()\` calls it.

\`\`\`python
>>> u.is_admin
<bound method User.is_admin of <User ...>>
>>> u.is_admin()
False
\`\`\`

## The trap

A bound method object is always truthy. So:

\`\`\`python
if user.is_admin:      # True for EVERY user
    grant_everything()
\`\`\`

No error. No warning. The condition reads perfectly in code review, and it
hands admin to everyone. The same shape bites on \`items.sort\` versus
\`items.sort()\`, and on \`s.strip\` inside a comprehension — where you get a
list of method objects rather than a list of strings, and the failure surfaces
somewhere else entirely.`,
    scaffold: `def active_names(users):
    """Each user is an object with .name and .is_active(),
    where is_active() is a METHOD, not an attribute.

    Return the names of the active users, in order.
    """
    # your turn
`,
    solution: `def active_names(users):
    return [u.name for u in users if u.is_active()]
`,
    hints: [
      "Read the docstring again: is_active is a method. What do you have to add for it to actually run?",
      "`if u.is_active` filters nothing out, because a bound method object is truthy. You want the result of calling it.",
      "A comprehension does it in one line: `[u.name for u in users if u.is_active()]`.",
    ],
    // The engine builds arguments from JSON, so the objects arrive as dicts and
    // the harness wraps them - the lesson is about the call, not about classes.
    tests: [
      { args: [[["ada", true], ["bob", false]]], expected: ["ada"], sample: true },
      { args: [[["ada", false], ["bob", false]]], expected: [], sample: true },
      { args: [[]], expected: [], sample: false },
      { args: [[["ada", true], ["bob", true]]], expected: ["ada", "bob"], sample: false },
    ],
    // A tiny prelude so the tests can pass plain data and still exercise a method.
    prelude: `class _U:
    def __init__(self, name, active):
        self.name = name
        self._active = active
    def is_active(self):
        return self._active
`,
    wrap: `def active_names(pairs):
    return _active_names([_U(n, a) for n, a in pairs])
`,
  },
  {
    title: "Default arguments are built once",
    relevance:
      "Ruby re-evaluates a default on every call. Python does not, and in a long-lived worker the difference compounds for days.",
    estimatedMinutes: 8,
    func: "collect",
    teaching: `## The habit

In Ruby the default expression runs on every call that omits the argument:

\`\`\`ruby
def collect(item, acc = [])
  acc << item          # a fresh [] every time
end
\`\`\`

## Here

Python evaluates the default **once**, when the \`def\` executes, and reuses
that same object for the lifetime of the function:

\`\`\`python
def collect(item, acc=[]):
    acc.append(item)     # the SAME list, every call
    return acc
\`\`\`

## The trap

\`\`\`python
>>> collect(1)
[1]
>>> collect(2)
[1, 2]
\`\`\`

Nothing raises. In a web process the \`def\` runs once at boot, so the list is
shared by every request that worker handles and grows for days. \`datetime.now()\`
as a default is the same bug with a different face: it freezes at import time,
and every "timestamp" is the moment the process started.

The idiom is \`None\` as the sentinel:

\`\`\`python
def collect(item, acc=None):
    if acc is None:
        acc = []
\`\`\``,
    scaffold: `def collect(item, acc=None):
    """Append item to acc and return it.

    Calling collect(1) then collect(2) must give [1] then [2],
    not [1] then [1, 2].
    """
    # your turn
`,
    solution: `def collect(item, acc=None):
    if acc is None:
        acc = []
    acc.append(item)
    return acc
`,
    hints: [
      "The signature is already right. The fix goes in the body, on the first line.",
      "`acc=None` means every call that omits it starts with None. Turn that None into a fresh list before you use it.",
      "`if acc is None: acc = []` — then append and return.",
    ],
    tests: [
      { args: [1], expected: [1], sample: true },
      { args: [2], expected: [2], sample: true },
      { args: [3, [0]], expected: [0, 3], sample: false },
      { args: ["x", []], expected: ["x"], sample: false },
    ],
  },
];


/* The lesson about bound methods needs objects; the engine passes JSON. The
   prelude and wrapper give it real objects without making the lesson about
   class syntax. */
for (const l of LESSONS) {
  if (l.prelude) {
    l.solution = `${l.prelude}\n${l.solution.replace(/^def active_names/m, "def _active_names")}\n${l.wrap}`;
    l.scaffold = `${l.prelude}\n${l.scaffold.replace(/^def active_names/m, "def _active_names")}\n${l.wrap}`;
    delete l.prelude;
    delete l.wrap;
  }
}


export { LESSONS };

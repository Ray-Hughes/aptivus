# Transition maps

A **transition map** is authored knowledge about moving from one language to
another: what maps onto what, and — far more valuable — where the habits from
the first language produce the wrong thing in the second.

## Why these are authored, not generated

The language-track feature generates a roadmap for a specific job. Generation
is right for *ordering and emphasis*: only a model can read "Senior backend
engineer on a payments team, Go, gRPC, Postgres" and decide that error
handling and context cancellation matter more than generics.

Generation is wrong for the *facts*. "In Ruby this returns `nil`; in Go this
returns a zero value and an error" is a claim that is either true or false,
and a model states false ones fluently. A wrong comparison is worse than no
comparison, because the learner has no way to check it — they came here
precisely because they do not know the target language yet. They will trust
it, encode it, and be wrong in a code review.

So the split is:

- **Authored (here):** the concept correspondences and the traps. Reviewable,
  diffable, correctable, and identical for every learner.
- **Generated:** which of them this job needs first, the worked examples, and
  the exercises — each verified by running its own tests before anyone sees it.

That also makes the product's answer to "why not just ask ChatGPT" concrete:
the comparisons are checked, and the exercises are executed before they reach
you.

## Format

One file per ordered pair, `<from>-to-<to>.json`:

```json
{
  "from": "ruby",
  "to": "go",
  "summary": "One paragraph on the shape of the change.",
  "concepts": [
    {
      "id": "error-handling",
      "title": "Errors are values, not exceptions",
      "theirs": "begin/rescue, raise, and an exception class hierarchy.",
      "yours": "Functions return (value, error) and you check err each time.",
      "trap": "There is no rescue to fall back on. Ignoring the returned error compiles fine and fails silently in production.",
      "severity": "high",
      "tags": ["errors", "control-flow"]
    }
  ]
}
```

`severity` is how badly the old instinct misleads: `high` means the code
compiles or runs and is quietly wrong, which is the most expensive kind.

## Adding a pair

Author it, then have someone who actually writes the target language read the
`trap` lines. Those are the sentences the product lives or dies on. An
unreviewed pair should not ship.

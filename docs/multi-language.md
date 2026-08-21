# Going multi-language

Written Aug 20, 2026, in response to: *what happens when we want Node, Ruby, C, C++?*

Short answer: you are right that the current shape does not extend, and the time to fix it
is now, before there is a lot of content. But the fix is **an interface and a content
format**, not a different framework — because no framework solves this.

---

## 1. Why "rebuild on something that supports this" has no answer

Two different problems get conflated:

**Running code in many languages** is solved. Judge0, Piston, and friends execute 40+
languages behind one API. If that were all we needed, we would adopt one and move on.

**Stepping through code with variable inspection** is not solved by anything
off-the-shelf. No multi-language execution service offers it. It is the thing that makes
Aptivus different from every other practice site, and it is per-language work whatever
stack you choose. Rewriting in Node, Go, or Rust would not move this problem one inch;
you would still be writing a Python tracer, a JS tracer, and a Ruby tracer.

So the pause is worth taking, but what it buys is a **language adapter interface** and a
**language-neutral problem format**. A framework is still worth having — see
`phase-2-plan.md` §2, where the stack decision landed on Next.js and TypeScript — but it
buys developer velocity and extensibility around the product, not a solution to tracing.
Tracing is ours to write in any stack.

---

## 2. What is actually possible, measured

I checked rather than guessed. All three ran in a headless browser today.

| Language | Mechanism | Status |
|---|---|---|
| **Python** | `sys.settrace`, native hook | **Verified.** Shipping. 57/57 parity with the server engine. |
| **Ruby** | `TracePoint` in `ruby.wasm` 3.3.3, native hook | **Verified.** Traced two-sum to `[0, 3]`, capturing `p=2500, i=0, seen={}` per line — same fidelity as Python. |
| **JavaScript** | No trace hook exists. Instrument the source: parse with Acorn, inject a step callback before each statement capturing the lexical scope | **Verified in prototype.** Correct result, `seen` observed filling to `{2500:0, 7500:1, 11000:2}`. Prototype is rough — 69 steps where Python takes 18, because the scope walker double-inserts — but the technique holds. |
| **C / C++** | Compiling in-browser is possible (Clang via WASM) but heavy. Tracing needs either source instrumentation with a real C parser, or DWARF plus a debugger. | **Not attempted.** Expect run-only for a long time. |
| **Java / Go / Rust** | In-browser toolchains are impractical or enormous. Server-side compile and run. | **Not attempted.** Run-only. |

The pattern: **languages with a native trace hook are cheap; languages without one need a
source instrumenter; compiled languages need a toolchain and are a different project.**

---

## 3. The architecture: capability-tiered adapters

One interface, and adapters declare what they can do. `run` is required; `trace` is
optional and advertised.

```
LanguageAdapter
  id            "python" | "javascript" | "ruby" | ...
  capabilities  { run: true, trace: true, evalAtStep: true }
  run(code, cases)                 -> result rows      (required)
  trace(code, case)                -> steps, pool      (optional)
  evalAtStep(code, case, n, expr)  -> value            (optional, implies trace)
```

The step and value shapes are already defined by the Python engine and are not
Python-specific: a step is `{line, func, locals, changed}` and a value is
`{short, pretty, type, len}`. Every adapter targets that contract, so **the entire UI —
stepper, narration, pinned inspector, expression console — is written once.** That is the
main prize from doing this properly.

Where adapters run:

- **Tier 1 (Python, Ruby, JavaScript)** — in the browser. No server execution, no
  sandbox, no per-run cost, works offline.
- **Tier 2 (C, C++, Java, Go, …)** — a server-side execution service (self-hosted Piston,
  or a vendor). Run and grade only, no stepping. This reintroduces server execution for
  those languages *only*, which is also a natural thing to meter.

The UI must state plainly which languages have the stepper. Silently degrading is worse
than saying "stepping is available for Python, Ruby and JavaScript."

---

## 4. The urgent part: the problem format

This is the reason to pause **now** rather than after launch. Adapters can be added any
time. Content cannot be cheaply re-authored — 27 problems is a day's rework, 200 is a
month's.

Today a problem is a Python dict with Python baked into it: one `starter`, one
`solution`, and explanations framed as "Ruby to Python notes".

The good news is that the expensive half is already language-neutral. **Tests are JSON in,
JSON out** — `{"args": [[2500, 7500], 6500], "expected": [0, 3]}` means the same thing in
any language. The prompts, hints, and follow-ups are about patterns, not syntax. All of
that survives.

What has to change is splitting the language-specific parts out:

```python
PROBLEM = {
    "id": "two_sum_premium",
    "title": "Two accounts hitting a premium target",
    "difficulty": "easy", "pattern": "hash map", "minutes": 10,

    "prompt": "...",              # language-neutral
    "hints": [...],               # language-neutral
    "explanation": "...",         # the idea, not the syntax
    "followups": [...],

    "signature": {                # per-language naming conventions differ
        "name":    {"python": "find_pair", "javascript": "findPair", "ruby": "find_pair"},
        "params":  [{"name": "premiums", "type": "int[]"},
                    {"name": "target",   "type": "int"}],
        "returns": "int[]",
    },

    "tests": [                    # JSON, shared by every language
        {"args": [[2500, 7500, 11000, 4000], 6500], "expected": [0, 3], "sample": True},
    ],

    "languages": {
        "python":     {"starter": "...", "solution": "...", "notes": "..."},
        "javascript": {"starter": "...", "solution": "...", "notes": "..."},
        "ruby":       {"starter": "...", "solution": "...", "notes": "..."},
    },
}
```

Three notes on that shape:

- **`signature.params` with types** looks like overkill for Python and Ruby, and it is —
  until C++ or Java, where the harness must declare types to call anything. Adding it now
  costs a few lines per problem; retrofitting it across a large library does not.
- **`notes` is per-language on purpose.** The current Python notes ("`enumerate` yields
  `(index, value)`, the reverse of Ruby") are some of the most useful content in the repo,
  and the equivalent for a Rubyist writing JavaScript is different content, not a
  translation.
- A problem is **valid with one language filled in.** `verify` should check every language
  present and ignore the rest, so the library grows language by language rather than
  needing all of them at once.

SQL stays as it is — already language-neutral, though dialect (SQLite vs Postgres) is its
own axis worth thinking about before there is a lot of SQL content.

---

## 5. What I would do, in order

1. **Problem format v2 and migrate the 27 problems.** ~2–3 days. Do this first; every day
   spent authoring content in the old format is rework.
2. **Adapter interface, with today's engine as the Python adapter.** ~2 days. Mostly
   moving code behind a boundary that already exists in spirit.
3. **JavaScript adapter.** ~1–1.5 weeks. Run is trivial; the instrumenter is the work.
   JS is the highest-value second language by candidate share.
4. **Ruby adapter.** ~3–5 days. TracePoint is verified; mostly plumbing plus a ruby.wasm
   payload decision (it is a large download — load it only when Ruby is selected).
5. **Tier 2 run-only via an execution service.** ~1 week when you want C/C++/Java/Go.
   Metered, since it costs real money per run.

That is roughly **3–4 weeks** to a genuinely multi-language product with stepping in three
languages and running in many.

All of it is TypeScript except the Python adapter's payload, which stays `engine.py` and
runs in Pyodide — verified working in the browser and under Node, so no contributor and no
CI job needs Python installed.

It also reorders Phase 2: this should come **before** accounts and billing. Selling
subscriptions for a Python-only tool and then reworking the content format underneath
paying customers is the worse sequence.

---

## 6. The honest trade

Stepping will never cover every language. A candidate practicing C++ gets run-and-grade,
the same as any other site, and does not get the feature that makes Aptivus worth paying
for. Two ways to live with that:

- **Be explicit.** Show the tier per language. Do not let someone subscribe expecting a
  stepper for Rust.
- **Choose depth over breadth.** Three languages with a real debugger beats fifteen with a
  text box. Python, JavaScript and Ruby already cover a large share of interview
  candidates, and Python and JavaScript alone cover most of them.

My recommendation is depth: ship Tier 1 for Python, JavaScript and Ruby, add Tier 2
run-only when someone actually asks for C++, and say clearly which is which.

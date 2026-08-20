"""Ask a question about the problem you are on.

Two modes, chosen automatically:

- **live**   - the `anthropic` package is installed and credentials resolve, so the
               question is answered in the app.
- **prompt** - otherwise, we assemble the full context and hand it back for you to
               paste into whatever AI tool you already use. No key, no install.

The core app never imports `anthropic` at module load, so aptivus stays
zero-install; only this optional panel needs `pip install anthropic`.
"""
import os

MODEL = "claude-opus-5"

SYSTEM = """You are a patient, sharp coding-interview tutor sitting next to someone
preparing for a technical interview in a few days. They are an experienced engineer -
an expert in Ruby and Rails - who is newer to Python. Treat them as a peer who is
missing specific knowledge, never as a beginner.

How to answer:

- Answer the actual question asked. Do not deliver a lecture around it.
- Work from THEIR code when they have written some. Quote the specific line that is
  wrong rather than pasting a whole corrected solution over the top of it.
- When something is confusing, find the reframe that makes it obvious - the sentence
  that makes the trick feel inevitable rather than clever. Lead with that.
- Trace a concrete example by hand when it would help. Small inputs, real values.
- Call out where a Ruby instinct produces wrong Python, and say what the Ruby
  equivalent would have been. That is usually the actual source of the confusion.
- If they are close, nudge rather than solve. If they are stuck or explicitly ask for
  the answer, give it - along with what to notice about it.
- End with what generalises: the pattern, and how to recognise it next time.

Be concise and concrete. Use short code blocks. No preamble, no "great question", no
restating the problem back at them. Plain text and markdown - this renders in a
narrow panel, so keep code lines under about 70 characters."""


def build_context(problem, code, question, results=None):
    """Assemble everything the model (or another AI tool) needs to answer well."""
    parts = ["## Problem: %s" % problem["title"],
             "(%s, pattern: %s)" % (problem.get("difficulty", ""), problem.get("pattern", "")),
             "", problem["prompt"].strip()]

    if problem["kind"] == "sql":
        parts += ["", "## Schema", "```sql", problem.get("schema", "").strip(), "```"]
    else:
        parts += ["", "## Expected function", "`%s`, called as %s(...)"
                  % (problem.get("func", ""), problem.get("func", ""))]

    if code and code.strip():
        lang = "sql" if problem["kind"] == "sql" else "python"
        parts += ["", "## My current code", "```%s" % lang, code.strip(), "```"]
    else:
        parts += ["", "## My current code", "(nothing written yet)"]

    if results:
        parts += ["", "## My last test run", results.strip()]

    parts += ["", "## My question", question.strip()]
    return "\n".join(parts)


def available():
    """Is the live path plausibly usable? Cheap check, no network."""
    try:
        import anthropic  # noqa: F401
    except ImportError:
        return False, "install"
    if os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        return True, ""
    # An `ant auth login` profile also works, so we cannot rule the live path out.
    return True, ""


def ask(problem, code, question, results=None):
    context = build_context(problem, code, question, results)
    ok, why = available()
    if not ok:
        return {"mode": "prompt", "prompt": context, "reason": why}

    try:
        import anthropic
    except ImportError:
        return {"mode": "prompt", "prompt": context, "reason": "install"}

    try:
        client = anthropic.Anthropic()
    except Exception:
        # No API key, no auth token, and no `ant auth login` profile on disk.
        return {"mode": "prompt", "prompt": context, "reason": "auth"}

    try:
        try:
            resp = client.beta.messages.create(
                model=MODEL,
                max_tokens=16000,
                system=SYSTEM,
                output_config={"effort": "medium"},
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
                messages=[{"role": "user", "content": context}],
            )
        except anthropic.BadRequestError:
            # Org may not have the server-side fallback beta; the answer matters
            # more than the safety net, so retry without it.
            resp = client.messages.create(
                model=MODEL,
                max_tokens=16000,
                system=SYSTEM,
                output_config={"effort": "medium"},
                messages=[{"role": "user", "content": context}],
            )
    except anthropic.AuthenticationError:
        return {"mode": "prompt", "prompt": context, "reason": "auth"}
    except anthropic.PermissionDeniedError:
        return {"mode": "prompt", "prompt": context, "reason": "auth"}
    except anthropic.RateLimitError:
        return {"mode": "prompt", "prompt": context, "reason": "ratelimit"}
    except anthropic.APIConnectionError:
        return {"mode": "prompt", "prompt": context, "reason": "offline"}
    except anthropic.APIStatusError as e:
        return {"mode": "prompt", "prompt": context,
                "reason": "error", "detail": str(e)[:300]}
    except Exception as e:
        msg = str(e)
        if "authentication" in msg.lower() or "api_key" in msg.lower():
            # SDK raises this at request time when no credential source resolves.
            return {"mode": "prompt", "prompt": context, "reason": "auth"}
        return {"mode": "prompt", "prompt": context,
                "reason": "error", "detail": msg[:300]}

    if resp.stop_reason == "refusal":
        return {"mode": "prompt", "prompt": context, "reason": "refusal"}

    answer = "\n".join(b.text for b in resp.content if b.type == "text")
    return {"mode": "live", "answer": answer.strip(), "model": resp.model}

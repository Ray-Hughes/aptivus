"""Trace modes.

Python: run the learner's code under sys.settrace and report, per executed line,
which local variables changed. Shows YOUR code running, not a canned animation.

SQL: split a WITH clause into its CTEs and run each one on its own, which is the
single most useful SQL debugging technique and the one this repo's docs recommend.
"""
import json
import os
import re
import subprocess
import sys
import tempfile

MAX_STEPS = 600

TRACE_HARNESS = r'''
import copy, json, os, sys

SOL = os.path.abspath("solution.py")
MAX_STEPS = %d
steps = []
state = {"truncated": False}


def short(v):
    try:
        r = repr(v)
    except Exception:
        return "<unrepr-able>"
    return r if len(r) <= 160 else r[:157] + "..."


def snap(loc):
    return {k: short(v) for k, v in loc.items() if not k.startswith("__")}


def tracer(frame, event, arg):
    if frame.f_code.co_filename != SOL:
        return None
    if event == "call":
        return tracer
    if len(steps) >= MAX_STEPS:
        state["truncated"] = True
        return None
    if event == "line":
        steps.append({"line": frame.f_lineno, "func": frame.f_code.co_name,
                      "locals": snap(frame.f_locals)})
    elif event == "return":
        steps.append({"line": frame.f_lineno, "func": frame.f_code.co_name,
                      "locals": snap(frame.f_locals), "returned": short(arg)})
    return tracer


cfg = json.load(open("cases.json"))
result, error = None, None

if cfg["mode"] == "function":
    import solution                      # module body runs untraced
    fn = getattr(solution, cfg["func"], None)
    if fn is None:
        error = "No function named %%r in your code." %% cfg["func"]
    else:
        sys.settrace(tracer)
        try:
            result = fn(*copy.deepcopy(cfg["args"]))
        except Exception as e:
            error = "%%s: %%s" %% (type(e).__name__, e)
        finally:
            sys.settrace(None)
else:
    sys.settrace(tracer)                 # trace the module body itself
    try:
        import solution
    except Exception as e:
        error = "%%s: %%s" %% (type(e).__name__, e)
    finally:
        sys.settrace(None)

print("---TRACE---")
print(json.dumps({"steps": steps, "truncated": state["truncated"],
                  "result": short(result), "error": error}))
''' % MAX_STEPS


def trace_python(problem, code, test_index=0):
    """Run one test case under the tracer and return per-step variable state."""
    tests = problem.get("tests", [])
    samples = [t for t in tests if t.get("sample")] or tests
    if not samples:
        return {"error": "This problem has no test cases to trace."}
    case = samples[min(test_index, len(samples) - 1)]
    mode = problem.get("mode", "function")

    cfg = {"mode": mode, "func": problem.get("func", ""),
           "args": case.get("args", [])}

    with tempfile.TemporaryDirectory() as td:
        with open(os.path.join(td, "solution.py"), "w") as f:
            f.write(code)
        with open(os.path.join(td, "trace_run.py"), "w") as f:
            f.write(TRACE_HARNESS)
        with open(os.path.join(td, "cases.json"), "w") as f:
            json.dump(cfg, f)
        try:
            proc = subprocess.run(
                [sys.executable, "trace_run.py"], cwd=td,
                input=case.get("stdin", ""), capture_output=True,
                text=True, timeout=20,
            )
        except subprocess.TimeoutExpired:
            return {"error": "Timed out while tracing. Tracing is slower than a "
                             "normal run, so a near-infinite loop will hit this."}

    out = proc.stdout
    if "---TRACE---" not in out:
        return {"error": (proc.stderr.strip() or "Your code crashed before "
                          "tracing could start.")[:2000]}
    printed, _, tail = out.partition("---TRACE---")
    try:
        payload = json.loads(tail.strip())
    except Exception:
        return {"error": "Could not read the trace output."}

    # Mark which variables changed on each step, so the UI can highlight them.
    steps, prev = [], {}
    for s in payload["steps"]:
        loc = s["locals"]
        s["changed"] = [k for k, v in loc.items() if prev.get(k) != v]
        prev = dict(loc)
        steps.append(s)

    return {
        "kind": "python",
        "source": code.split("\n"),
        "steps": steps,
        "truncated": payload["truncated"],
        "result": payload["result"],
        "error": payload["error"],
        "printed": printed.strip(),
        "case": {"args": case.get("args"), "stdin": case.get("stdin"),
                 "expected": case.get("expected")},
    }


# ---------------------------------------------------------------------------
# SQL: split the WITH clause and run each CTE on its own
# ---------------------------------------------------------------------------
def _skip_noise(sql, i):
    """Advance past whitespace and comments."""
    while i < len(sql):
        if sql[i].isspace():
            i += 1
        elif sql.startswith("--", i):
            nl = sql.find("\n", i)
            i = len(sql) if nl < 0 else nl + 1
        elif sql.startswith("/*", i):
            end = sql.find("*/", i + 2)
            i = len(sql) if end < 0 else end + 2
        else:
            break
    return i


def _match_paren(sql, start):
    """start is the index of '('. Return index just past the matching ')'."""
    depth, i = 0, start
    while i < len(sql):
        c = sql[i]
        if c == "'":
            i += 1
            while i < len(sql):
                if sql[i] == "'":
                    if i + 1 < len(sql) and sql[i + 1] == "'":
                        i += 2
                        continue
                    break
                i += 1
        elif c == '"':
            i += 1
            while i < len(sql) and sql[i] != '"':
                i += 1
        elif sql.startswith("--", i):
            nl = sql.find("\n", i)
            i = len(sql) if nl < 0 else nl
            continue
        elif sql.startswith("/*", i):
            end = sql.find("*/", i + 2)
            i = len(sql) if end < 0 else end + 1
        elif c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return -1


def split_ctes(sql):
    """Return (recursive: bool, [(name, body_sql), ...]). Empty list if no WITH."""
    i = _skip_noise(sql, 0)
    if not re.match(r"with\b", sql[i:i + 5], re.I):
        return False, []
    i += 4
    i = _skip_noise(sql, i)
    recursive = False
    if re.match(r"recursive\b", sql[i:i + 10], re.I):
        recursive = True
        i += 9
        i = _skip_noise(sql, i)

    ctes = []
    while i < len(sql):
        m = re.match(r'([A-Za-z_][\w$]*|"[^"]+")', sql[i:])
        if not m:
            break
        name = m.group(1).strip('"')
        i = _skip_noise(sql, i + m.end())
        if i < len(sql) and sql[i] == "(":          # optional column list
            close = _match_paren(sql, i)
            if close < 0:
                break
            i = _skip_noise(sql, close)
        if not re.match(r"as\b", sql[i:i + 3], re.I):
            break
        i = _skip_noise(sql, i + 2)
        if i >= len(sql) or sql[i] != "(":
            break
        close = _match_paren(sql, i)
        if close < 0:
            break
        ctes.append((name, sql[i + 1:close - 1].strip()))
        i = _skip_noise(sql, close)
        if i < len(sql) and sql[i] == ",":
            i = _skip_noise(sql, i + 1)
            continue
        break
    return recursive, ctes


def step_sql(problem, query, run_sql):
    """Run each CTE in turn so you can see what each step actually produces."""
    recursive, ctes = split_ctes(query)
    steps = []
    for idx, (name, _body) in enumerate(ctes):
        prefix = ", ".join(
            "%s AS (%s)" % (n, b) for n, b in ctes[:idx + 1]
        )
        probe = "WITH %s%s SELECT * FROM %s LIMIT 50" % (
            "RECURSIVE " if recursive else "", prefix, name)
        res = run_sql(problem, probe)
        steps.append({"name": name, "sql": probe, **res})

    final = run_sql(problem, query)
    plan = run_sql(problem, "EXPLAIN QUERY PLAN " + query)
    return {
        "kind": "sql",
        "steps": steps,
        "final": final,
        "plan": plan,
        "note": ("No WITH clause found, so there are no intermediate steps to show. "
                 "Splitting a query into CTEs is what makes it steppable - and "
                 "readable under interview pressure.") if not ctes else "",
    }

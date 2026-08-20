"""Trace modes.

Python: run the learner's code under sys.settrace and report, per executed line,
which local variables changed. Shows YOUR code running, not a canned animation.

SQL: split a WITH clause into its CTEs and run each one on its own, which is the
single most useful SQL debugging technique and the one this repo's docs recommend.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core import runner

def pick_case(problem, test_index):
    """Resolve a case selector to (case, cfg). test_index may be an int index into
    the problem's tests, or "file" to run the learner's file exactly as written."""
    if test_index == "file":
        return ({"label": "your file, run as written", "file": True},
                {"mode": "stdin", "func": "", "args": []})
    tests = problem.get("tests", [])
    if not tests:
        return None, None
    try:
        i = int(test_index)
    except (TypeError, ValueError):
        i = 0
    case = tests[i] if 0 <= i < len(tests) else tests[0]
    return case, {"mode": problem.get("mode", "function"),
                  "func": problem.get("func", ""), "args": case.get("args", [])}


def trace_python(problem, code, test_index=0):
    """Run one case under the tracer and return per-step variable state."""
    case, cfg = pick_case(problem, test_index)
    if case is None:
        return {"error": "This problem has no test cases to trace."}
    res, err = runner.call({"op": "trace", "code": code, "case": case,
                            "mode": cfg["mode"], "func": cfg["func"]},
                           timeout=runner.TRACE_TIMEOUT)
    if err:
        return {"error": err}
    res["case"] = {"args": case.get("args"), "stdin": case.get("stdin"),
                   "expected": case.get("expected"), "label": case.get("label"),
                   "file": bool(case.get("file"))}
    return res


def eval_at_step(problem, code, step, expr, test_index=0):
    """Re-run to `step` and evaluate `expr` in that frame."""
    case, cfg = pick_case(problem, test_index)
    if case is None:
        return {"error": "This problem has no test cases to trace."}
    res, err = runner.call({"op": "eval", "code": code, "case": case,
                            "step": step, "expr": expr,
                            "mode": cfg["mode"], "func": cfg["func"]},
                           timeout=runner.TRACE_TIMEOUT)
    if err:
        return {"error": err}
    return res


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

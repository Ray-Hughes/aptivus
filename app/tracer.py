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
import copy, json, os, pprint, sys

SOL = os.path.abspath("solution.py")
MAX_STEPS = %d
steps = []
state = {"truncated": False, "collapsed": False, "n": 0}


MAX_POOL = 1200
PRETTY_LIMIT = 20000

pool = []
pool_ix = {}


def short(v):
    try:
        r = repr(v)
    except Exception:
        return "<unrepr-able>"
    return r if len(r) <= 160 else r[:157] + "..."


def val_id(v):
    """Intern one value and return its index. Identical values across steps
    share an entry, which is what makes a full pretty copy affordable."""
    try:
        r = repr(v)
    except Exception:
        r = "<unrepr-able>"
    if len(r) > PRETTY_LIMIT:
        pretty = r[:PRETTY_LIMIT] + "\n... (truncated)"
    else:
        try:
            pretty = pprint.pformat(v, width=76, sort_dicts=False)
        except Exception:
            pretty = r
    if pretty in pool_ix:
        return pool_ix[pretty]
    if len(pool) >= MAX_POOL:
        return -1
    try:
        n = len(v)
    except Exception:
        n = None
    i = len(pool)
    pool.append({"s": r if len(r) <= 160 else r[:157] + "...",
                 "p": pretty, "t": type(v).__name__, "n": n})
    pool_ix[pretty] = i
    return i


def snap(loc):
    # "." names are the implicit arguments CPython gives comprehension frames.
    return {k: val_id(v) for k, v in loc.items()
            if not k.startswith("__") and not k.startswith(".")}


# Comprehensions and lambdas get their own frames. Stepping through them
# interleaved with the real function makes the flow unreadable, so collapse them.
SYNTHETIC = {"<lambda>", "<genexpr>", "<listcomp>", "<dictcomp>", "<setcomp>"}


def tracer(frame, event, arg):
    if frame.f_code.co_filename != SOL:
        return None
    if frame.f_code.co_name in SYNTHETIC:
        state["collapsed"] = True
        return None
    if event == "call":
        return tracer
    if event not in ("line", "return"):
        return tracer
    if state["n"] >= MAX_STEPS:
        state["truncated"] = True
        return None
    if EV is not None:
        # Same counting as trace mode, so step indices match exactly.
        if not ev["done"] and state["n"] == EV["step"]:
            do_eval(frame)
        state["n"] += 1
        return tracer
    row = {"line": frame.f_lineno, "func": frame.f_code.co_name,
           "fid": id(frame), "locals": snap(frame.f_locals)}
    if event == "return":
        row["returned"] = short(arg)
    steps.append(row)
    state["n"] += 1
    return tracer


cfg = json.load(open("cases.json"))
EV = cfg.get("eval")            # {"step": int, "expr": str} when evaluating
ev = {"done": False}
result, error = None, None


def do_eval(frame):
    """Evaluate the user's expression in this frame, once."""
    ev["done"] = True
    try:
        val = eval(compile(EV["expr"], "<expr>", "eval"),
                   frame.f_globals, frame.f_locals)
    except Exception as e:
        ev["ok"] = False
        ev["error"] = "%%s: %%s" %% (type(e).__name__, e)
        return
    ev["ok"] = True
    ev["repr"] = short(val)
    ev["type"] = type(val).__name__
    try:
        ev["len"] = len(val)
    except Exception:
        ev["len"] = None
    try:
        ev["pretty"] = pprint.pformat(val, width=76, sort_dicts=False)
    except Exception:
        ev["pretty"] = ev["repr"]

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
if EV is not None:
    print(json.dumps({"eval": ev}))
else:
    print(json.dumps({"steps": steps, "truncated": state["truncated"],
                      "collapsed": state["collapsed"], "pool": pool,
                      "result": short(result), "error": error}))
''' % MAX_STEPS


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


def _run_traced(problem, code, cfg_extra, test_index=0):
    """Execute one case under the harness. Returns (payload, printed, err)."""
    case, cfg = pick_case(problem, test_index)
    if case is None:
        return None, "", "This problem has no test cases to trace."
    cfg.update(cfg_extra)

    with tempfile.TemporaryDirectory() as td:
        with open(os.path.join(td, "solution.py"), "w") as f:
            f.write(code)
        with open(os.path.join(td, "trace_run.py"), "w") as f:
            f.write(TRACE_HARNESS)
        with open(os.path.join(td, "cases.json"), "w") as f:
            json.dump(cfg, f)
        try:
            proc = subprocess.run([sys.executable, "trace_run.py"], cwd=td,
                                  input=case.get("stdin", ""), capture_output=True,
                                  text=True, timeout=20)
        except subprocess.TimeoutExpired:
            return None, "", ("Timed out. Tracing is slower than a normal run, so a "
                              "near-infinite loop will hit this.")

    out = proc.stdout
    if "---TRACE---" not in out:
        return None, "", (proc.stderr.strip() or
                          "Your code crashed before tracing could start.")[:2000]
    printed, _, tail = out.partition("---TRACE---")
    try:
        return json.loads(tail.strip()), printed.strip(), None
    except Exception:
        return None, printed, "Could not read the trace output."


def eval_at_step(problem, code, step, expr, test_index=0):
    """Re-run to `step` and evaluate `expr` in that frame."""
    if not expr.strip():
        return {"error": "Type an expression."}
    payload, _printed, err = _run_traced(
        problem, code, {"eval": {"step": int(step), "expr": expr}}, test_index)
    if err:
        return {"error": err}
    ev = (payload or {}).get("eval") or {}
    if not ev.get("done"):
        return {"error": "That step was never reached on this run."}
    if not ev.get("ok"):
        return {"error": ev.get("error", "Could not evaluate that.")}
    return {"repr": ev["repr"], "pretty": ev["pretty"],
            "type": ev["type"], "len": ev["len"]}


def trace_python(problem, code, test_index=0):
    """Run one case under the tracer and return per-step variable state."""
    case, _cfg = pick_case(problem, test_index)
    if case is None:
        return {"error": "This problem has no test cases to trace."}

    payload, printed, err = _run_traced(problem, code, {}, test_index)
    if err:
        return {"error": err}

    # Diff each step against its own frame's previous state. The exception is a
    # frame's FIRST step: diff that against the caller, so entering a closure
    # reports the arguments rather than every captured variable.
    steps, prev_by_frame, last = [], {}, {}
    for s in payload["steps"]:
        loc = s["locals"]
        prev = prev_by_frame.get(s["fid"])
        if prev is None:
            prev = last
        s["changed"] = [k for k, v in loc.items() if prev.get(k) != v]
        prev_by_frame[s["fid"]] = dict(loc)
        last = dict(loc)
        steps.append(s)

    return {
        "kind": "python",
        "source": code.split("\n"),
        "steps": steps,
        "pool": payload.get("pool", []),
        "truncated": payload["truncated"],
        "collapsed": payload.get("collapsed", False),
        "funcs": sorted({s["func"] for s in steps}),
        "result": payload["result"],
        "error": payload["error"],
        "printed": printed,
        "case": {"args": case.get("args"), "stdin": case.get("stdin"),
                 "expected": case.get("expected"), "label": case.get("label"),
                 "file": bool(case.get("file"))},
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

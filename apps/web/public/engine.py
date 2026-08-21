"""The execution engine: runs a learner's code, traces it, evaluates expressions.

Pure standard library. No filesystem, no subprocess, no imports that are missing
under WebAssembly - so this exact module runs unchanged in two places:

  * CPython, inside a subprocess the local server spawns
  * Pyodide, inside a Web Worker in the browser

Isolation is the caller's job. The server gets it from the subprocess and its
timeout; the browser gets it from terminating the worker. Keeping that concern
outside this module is what lets one implementation serve both.
"""
import copy
import io
import json
import pprint
import sys
from contextlib import redirect_stdout

SOLUTION_FILE = "solution.py"
MAX_STEPS = 600
MAX_POOL = 1200
PRETTY_LIMIT = 20000
REPR_LIMIT = 160

# Comprehensions and lambdas run in their own frames. Stepping through them
# interleaved with the real function makes the flow unreadable, so they are
# collapsed. (CPython 3.12+ inlines list comprehensions, so those appear as
# repeats of the enclosing line instead - handled in the UI, not here.)
SYNTHETIC = {"<lambda>", "<genexpr>", "<listcomp>", "<dictcomp>", "<setcomp>"}


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def stable_repr(v):
    """repr(), except sets render in a deterministic order.

    Set iteration order is hash-derived and differs between CPython builds -
    including between CPython and the WebAssembly build - so the raw repr is
    not reproducible. It is also just nicer to read a set the same way twice.
    Exact type checks only: subclasses like defaultdict keep their own repr,
    which carries information a plain dict rendering would lose.
    """
    t = type(v)
    if t is set or t is frozenset:
        if not v:
            return "set()" if t is set else "frozenset()"
        try:
            items = sorted(v)
        except TypeError:
            items = sorted(v, key=repr)
        inner = ", ".join(stable_repr(x) for x in items)
        return "{" + inner + "}" if t is set else "frozenset({" + inner + "})"
    if t is list:
        return "[" + ", ".join(stable_repr(x) for x in v) + "]"
    if t is tuple:
        if len(v) == 1:
            return "(" + stable_repr(v[0]) + ",)"
        return "(" + ", ".join(stable_repr(x) for x in v) + ")"
    if t is dict:
        return "{" + ", ".join("%s: %s" % (stable_repr(k), stable_repr(x))
                               for k, x in v.items()) + "}"
    return repr(v)


def short(v):
    try:
        r = stable_repr(v)
    except Exception:
        return "<unrepr-able>"
    return r if len(r) <= REPR_LIMIT else r[: REPR_LIMIT - 3] + "..."


def pretty(v, fallback):
    try:
        if len(fallback) > PRETTY_LIMIT:
            return fallback[:PRETTY_LIMIT] + "\n... (truncated)"
        return pprint.pformat(v, width=76, sort_dicts=False)
    except Exception:
        return fallback


def norm(v):
    """Normalise a return value so it survives a JSON round trip."""
    if isinstance(v, set):
        return sorted(norm(x) for x in v)
    if isinstance(v, (list, tuple)):
        return [norm(x) for x in v]
    if isinstance(v, dict):
        return {str(k): norm(x) for k, x in v.items()}
    return v


def fmt_args(args):
    return ", ".join(json.dumps(a) for a in (args or []))


def compare(got, exp, unordered=False):
    if unordered and isinstance(got, list) and isinstance(exp, list):
        try:
            return sorted(map(json.dumps, got)) == sorted(map(json.dumps, exp))
        except Exception:
            pass
    if isinstance(exp, float) or isinstance(got, float):
        try:
            return abs(float(got) - float(exp)) < 1e-6
        except Exception:
            return False
    try:
        return json.loads(json.dumps(got)) == json.loads(json.dumps(exp))
    except Exception:
        return False


def _compile(code):
    return compile(code, SOLUTION_FILE, "exec")


def _exec_module(code, name):
    """Execute the learner's code in a fresh namespace and return it."""
    ns = {"__name__": name, "__file__": SOLUTION_FILE}
    exec(_compile(code), ns)
    return ns


# ---------------------------------------------------------------------------
# running tests
# ---------------------------------------------------------------------------
def run_tests(code, cases, mode="function", func="", unordered=False):
    """Return one result row per case, in the shape the UI renders."""
    if mode == "stdin":
        return _run_stdin_tests(code, cases)
    return _run_function_tests(code, cases, func, unordered)


def _run_function_tests(code, cases, func, unordered):
    buf = io.StringIO()
    try:
        with redirect_stdout(buf):
            ns = _exec_module(code, "solution")
    except Exception as e:
        return [_fail(c, "%s: %s" % (type(e).__name__, e)) for c in cases]

    fn = ns.get(func)
    if not callable(fn):
        names = sorted(k for k, v in ns.items()
                       if callable(v) and not k.startswith("_"))
        msg = "No function named %r found. Defined: %s" % (func, names)
        return [_fail(c, msg) for c in cases]

    out = []
    for case in cases:
        row = {"input": fmt_args(case.get("args")),
               "expected": case.get("expected"),
               "sample": bool(case.get("sample"))}
        try:
            with redirect_stdout(buf):
                value = fn(*copy.deepcopy(case.get("args") or []))
        except Exception as e:
            row.update({"got": None, "passed": False,
                        "error": "%s: %s" % (type(e).__name__, e)})
        else:
            got = norm(value)
            row.update({"got": got, "error": "",
                        "passed": compare(got, case.get("expected"),
                                          case.get("unordered") or unordered)})
        row["stdout"] = buf.getvalue().strip()
        out.append(row)
    return out


def _run_stdin_tests(code, cases):
    out = []
    for case in cases:
        row = {"input": case.get("stdin", ""),
               "expected": str(case.get("expected", "")).strip(),
               "sample": bool(case.get("sample"))}
        buf = io.StringIO()
        stdin = sys.stdin
        sys.stdin = io.StringIO(case.get("stdin", ""))
        try:
            with redirect_stdout(buf):
                _exec_module(code, "__main__")
        except Exception as e:
            row.update({"got": "", "passed": False,
                        "error": "%s: %s" % (type(e).__name__, e)})
        else:
            got = buf.getvalue().strip()
            row.update({"got": got, "error": "", "passed": got == row["expected"]})
        finally:
            sys.stdin = stdin
        out.append(row)
    return out


def _fail(case, message):
    return {"input": case.get("stdin") if "stdin" in case else fmt_args(case.get("args")),
            "expected": case.get("expected"), "got": None, "passed": False,
            "error": message, "sample": bool(case.get("sample")), "stdout": ""}


# ---------------------------------------------------------------------------
# tracing
# ---------------------------------------------------------------------------
class _Tracer:
    def __init__(self, eval_at=None, expr=None):
        self.steps = []
        self.pool = []
        self.pool_ix = {}
        self.n = 0
        self.truncated = False
        self.collapsed = False
        self.eval_at = eval_at          # step index to evaluate at, or None
        self.expr = expr
        self.ev = {"done": False}

    def val_id(self, v):
        """Intern a value. Identical values across steps share one entry, which
        is what makes carrying a full pretty-printed copy affordable."""
        try:
            r = stable_repr(v)
        except Exception:
            r = "<unrepr-able>"
        p = pretty(v, r)
        hit = self.pool_ix.get(p)
        if hit is not None:
            return hit
        if len(self.pool) >= MAX_POOL:
            return -1
        try:
            n = len(v)
        except Exception:
            n = None
        i = len(self.pool)
        self.pool.append({"s": r if len(r) <= REPR_LIMIT else r[: REPR_LIMIT - 3] + "...",
                          "p": p, "t": type(v).__name__, "n": n})
        self.pool_ix[p] = i
        return i

    def snap(self, loc):
        # "." names are the implicit arguments CPython gives comprehension frames.
        return {k: self.val_id(v) for k, v in loc.items()
                if not k.startswith("__") and not k.startswith(".")}

    def do_eval(self, frame):
        self.ev["done"] = True
        try:
            val = eval(compile(self.expr, "<expr>", "eval"),
                       frame.f_globals, frame.f_locals)
        except Exception as e:
            self.ev.update({"ok": False,
                            "error": "%s: %s" % (type(e).__name__, e)})
            return
        r = short(val)
        try:
            n = len(val)
        except Exception:
            n = None
        self.ev.update({"ok": True, "repr": r, "type": type(val).__name__,
                        "len": n, "pretty": pretty(val, r)})

    def __call__(self, frame, event, arg):
        if frame.f_code.co_filename != SOLUTION_FILE:
            return None
        if frame.f_code.co_name in SYNTHETIC:
            self.collapsed = True
            return None
        if event == "call":
            return self
        if event not in ("line", "return"):
            return self
        if self.n >= MAX_STEPS:
            self.truncated = True
            return None

        if self.eval_at is not None:
            # Count exactly as trace mode does, so step indices cannot drift.
            if not self.ev["done"] and self.n == self.eval_at:
                self.do_eval(frame)
            self.n += 1
            return self

        row = {"line": frame.f_lineno, "func": frame.f_code.co_name,
               "fid": id(frame), "locals": self.snap(frame.f_locals)}
        if event == "return":
            row["returned"] = short(arg)
        self.steps.append(row)
        self.n += 1
        return self


def _drive(code, case, mode, func, tracer):
    """Run one case under `tracer`. Returns (result_repr, error, printed)."""
    buf = io.StringIO()
    result, error = None, None
    stdin = sys.stdin
    sys.stdin = io.StringIO(case.get("stdin", "") or "")
    try:
        if mode == "function":
            with redirect_stdout(buf):
                ns = _exec_module(code, "solution")     # module body runs untraced
            fn = ns.get(func)
            if not callable(fn):
                return None, "No function named %r in your code." % func, ""
            sys.settrace(tracer)
            try:
                with redirect_stdout(buf):
                    result = fn(*copy.deepcopy(case.get("args") or []))
            except Exception as e:
                error = "%s: %s" % (type(e).__name__, e)
            finally:
                sys.settrace(None)
        else:
            sys.settrace(tracer)                        # trace the module body
            try:
                with redirect_stdout(buf):
                    _exec_module(code, "__main__")
            except Exception as e:
                error = "%s: %s" % (type(e).__name__, e)
            finally:
                sys.settrace(None)
    except Exception as e:
        error = "%s: %s" % (type(e).__name__, e)
    finally:
        sys.stdin = stdin
    return short(result), error, buf.getvalue().strip()


def trace(code, case, mode="function", func=""):
    t = _Tracer()
    result, error, printed = _drive(code, case, mode, func, t)

    # Diff each step against its own frame's previous state. The exception is a
    # frame's FIRST step: diff that against the caller, so entering a closure
    # reports the arguments rather than every captured variable.
    prev_by_frame, last = {}, {}
    for s in t.steps:
        loc = s["locals"]
        prev = prev_by_frame.get(s["fid"])
        if prev is None:
            prev = last
        s["changed"] = [k for k, v in loc.items() if prev.get(k) != v]
        prev_by_frame[s["fid"]] = dict(loc)
        last = dict(loc)

    return {
        "kind": "python",
        "source": code.split("\n"),
        "steps": t.steps,
        "pool": t.pool,
        "truncated": t.truncated,
        "collapsed": t.collapsed,
        "funcs": sorted({s["func"] for s in t.steps}),
        "result": result,
        "error": error,
        "printed": printed,
    }


def eval_at(code, case, step, expr, mode="function", func=""):
    if not (expr or "").strip():
        return {"error": "Type an expression."}
    t = _Tracer(eval_at=int(step), expr=expr)
    _drive(code, case, mode, func, t)
    if not t.ev.get("done"):
        return {"error": "That step was never reached on this run."}
    if not t.ev.get("ok"):
        return {"error": t.ev.get("error", "Could not evaluate that.")}
    return {"repr": t.ev["repr"], "pretty": t.ev["pretty"],
            "type": t.ev["type"], "len": t.ev["len"]}


# ---------------------------------------------------------------------------
# entry point used when this module is driven as a subprocess
# ---------------------------------------------------------------------------
_BUNDLE = {}


def load_bundle(text):
    """Parse problem data in Python rather than in JS.

    JSON has one number type; JavaScript therefore turns 1.0 into 1 and cannot
    turn it back. Parsing here keeps ints and floats distinct, so a case's
    arguments are byte-identical to what the server passes.
    """
    global _BUNDLE
    _BUNDLE = {p["id"]: p for p in json.loads(text).get("problems", [])}
    return {"loaded": len(_BUNDLE)}


def _cases_for(req):
    pid = req.get("from_bundle")
    if pid and pid in _BUNDLE:
        tests = _BUNDLE[pid].get("tests", [])
        if "case_index" in req:
            i = int(req["case_index"])
            return [tests[i]] if 0 <= i < len(tests) else tests[:1]
        return tests
    if "case" in req:
        return [req["case"]]
    return req.get("cases", [])


def dispatch(req):
    op = req.get("op")
    code = req.get("code", "")
    if op == "load_bundle":
        return load_bundle(req.get("text", "{}"))
    if op == "run":
        return {"results": run_tests(code, _cases_for(req),
                                     req.get("mode", "function"),
                                     req.get("func", ""),
                                     req.get("unordered", False))}
    if op == "trace":
        cases = _cases_for(req)
        return trace(code, cases[0] if cases else {}, req.get("mode", "function"),
                     req.get("func", ""))
    if op == "scratch":
        buf = io.StringIO()
        stdin = sys.stdin
        sys.stdin = io.StringIO(req.get("stdin", "") or "")
        err = ""
        try:
            with redirect_stdout(buf):
                _exec_module(code, "__main__")
        except Exception:
            import traceback
            err = traceback.format_exc()
        finally:
            sys.stdin = stdin
        return {"stdout": buf.getvalue(), "stderr": err}
    if op == "eval":
        cases = _cases_for(req)
        return eval_at(code, cases[0] if cases else {}, req.get("step", 0),
                       req.get("expr", ""), req.get("mode", "function"),
                       req.get("func", ""))
    return {"error": "unknown op %r" % op}


if __name__ == "__main__":
    payload = json.loads(sys.stdin.read())
    out = dispatch(payload)
    sys.stdout.write("\n---ENGINE---\n" + json.dumps(out))

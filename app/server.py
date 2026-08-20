#!/usr/bin/env python3
"""
Local HackerRank-style practice environment.
Stdlib only. Run:  python3 app/server.py   then open http://localhost:8777
"""
import copy
import http.server
import importlib.util
import json
import os
import re
import socketserver
import sqlite3
import subprocess
import sys
import tempfile
import traceback
import urllib.parse

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(ROOT)
STATIC = os.path.join(ROOT, "static")
PACKS_DIR = os.path.join(REPO, "packs")
PROGRESS_FILE = os.path.join(REPO, "progress.json")
PORT = int(os.environ.get("PORT", "8777"))
TIMEOUT_SEC = 8


# --------------------------------------------------------------------------
# Problem loading
# --------------------------------------------------------------------------
def load_problems():
    """Scan packs/<pack>/{python,sql}/*.py. Each file defines a PROBLEM dict."""
    problems = {}
    if not os.path.isdir(PACKS_DIR):
        return problems
    for pack in sorted(os.listdir(PACKS_DIR)):
        pack_dir = os.path.join(PACKS_DIR, pack)
        if not os.path.isdir(pack_dir) or pack.startswith("."):
            continue
        for kind in ("python", "sql"):
            d = os.path.join(pack_dir, kind)
            if not os.path.isdir(d):
                continue
            for fn in sorted(os.listdir(d)):
                if not fn.endswith(".py") or fn.startswith("_"):
                    continue
                path = os.path.join(d, fn)
                spec = importlib.util.spec_from_file_location(pack + "_" + fn[:-3], path)
                mod = importlib.util.module_from_spec(spec)
                try:
                    spec.loader.exec_module(mod)
                except Exception:
                    print("Failed to load %s:\n%s" % (path, traceback.format_exc()))
                    continue
                p = dict(mod.PROBLEM)
                p["kind"] = kind
                p["pack"] = pack
                p.setdefault("id", fn[:-3])
                p.setdefault("tags", [])
                p.setdefault("minutes", 15)
                if p["id"] in problems:
                    print("Duplicate problem id %r (%s) -- ids must be unique "
                          "across packs. Skipping." % (p["id"], path))
                    continue
                problems[p["id"]] = p
    return problems


PROBLEMS = load_problems()


def public_meta(p):
    return {
        "id": p["id"],
        "kind": p["kind"],
        "pack": p.get("pack", ""),
        "title": p["title"],
        "difficulty": p.get("difficulty", "medium"),
        "tags": p.get("tags", []),
        "minutes": p.get("minutes", 15),
        "pattern": p.get("pattern", ""),
    }


def public_problem(p):
    d = public_meta(p)
    d.update({
        "prompt": p["prompt"],
        "starter": p.get("starter", ""),
        "mode": p.get("mode", "function"),
        "func": p.get("func", ""),
        "hints": p.get("hints", []),
        "followups": p.get("followups", []),
    })
    if p["kind"] == "sql":
        d["schema_sql"] = p.get("schema", "")
        d["sample_rows"] = sample_tables(p)
        d["ordered"] = p.get("ordered", False)
    else:
        d["sample_tests"] = [
            {"args": t.get("args"), "stdin": t.get("stdin"), "expected": t.get("expected")}
            for t in p.get("tests", []) if t.get("sample")
        ]
    return d


# --------------------------------------------------------------------------
# Python execution
# --------------------------------------------------------------------------
HARNESS = r'''
import json, sys, copy, traceback
sys.setrecursionlimit(20000)
import solution

def norm(v):
    if isinstance(v, set):
        return sorted(norm(x) for x in v)
    if isinstance(v, tuple):
        return [norm(x) for x in v]
    if isinstance(v, list):
        return [norm(x) for x in v]
    if isinstance(v, dict):
        return {str(k): norm(x) for k, x in v.items()}
    return v

cfg = json.load(open("cases.json"))
fname = cfg["func"]
fn = getattr(solution, fname, None)
out = []
if fn is None:
    names = [n for n in dir(solution) if not n.startswith("_") and callable(getattr(solution, n))]
    print(json.dumps({"fatal": "No function named '%s' found. Defined: %s" % (fname, names)}))
    sys.exit(0)
for case in cfg["cases"]:
    args = copy.deepcopy(case["args"])
    try:
        res = fn(*args)
        out.append({"ok": True, "value": norm(res)})
    except Exception as e:
        out.append({"ok": False, "error": "%s: %s" % (type(e).__name__, e),
                    "trace": traceback.format_exc().splitlines()[-3:]})
print("---HARNESS---")
print(json.dumps({"results": out}))
'''


def run_python_file(workdir, argv, stdin_data=""):
    try:
        proc = subprocess.run(
            argv, cwd=workdir, input=stdin_data, capture_output=True,
            text=True, timeout=TIMEOUT_SEC,
        )
        return proc.returncode, proc.stdout, proc.stderr, False
    except subprocess.TimeoutExpired:
        return -1, "", "Timed out after %ds (infinite loop? or too slow)" % TIMEOUT_SEC, True


def run_python_freeform(code, stdin_data):
    """Just execute the file with the given stdin, like HackerRank's Run Code."""
    with tempfile.TemporaryDirectory() as td:
        with open(os.path.join(td, "solution.py"), "w") as f:
            f.write(code)
        rc, out, err, to = run_python_file(td, [sys.executable, "solution.py"], stdin_data)
        return {"stdout": out, "stderr": err, "timeout": to, "returncode": rc}


def run_python_tests(problem, code, tests):
    mode = problem.get("mode", "function")
    results = []
    if mode == "stdin":
        with tempfile.TemporaryDirectory() as td:
            with open(os.path.join(td, "solution.py"), "w") as f:
                f.write(code)
            for t in tests:
                rc, out, err, to = run_python_file(
                    td, [sys.executable, "solution.py"], t.get("stdin", ""))
                got = out.strip()
                exp = str(t["expected"]).strip()
                results.append({
                    "input": t.get("stdin", ""),
                    "expected": exp,
                    "got": got,
                    "passed": (got == exp) and not to and rc == 0,
                    "error": err.strip() if (err.strip() and rc != 0) or to else "",
                    "sample": bool(t.get("sample")),
                })
        return results

    with tempfile.TemporaryDirectory() as td:
        with open(os.path.join(td, "solution.py"), "w") as f:
            f.write(code)
        with open(os.path.join(td, "harness.py"), "w") as f:
            f.write(HARNESS)
        with open(os.path.join(td, "cases.json"), "w") as f:
            json.dump({"func": problem.get("func", "solve"),
                       "cases": [{"args": t["args"]} for t in tests]}, f)
        rc, out, err, to = run_python_file(td, [sys.executable, "harness.py"], "")

    if to:
        return [{"input": _fmt_args(t["args"]), "expected": t["expected"], "got": "",
                 "passed": False, "error": "Timed out after %ds" % TIMEOUT_SEC,
                 "sample": bool(t.get("sample"))} for t in tests]

    payload, user_stdout = None, out
    if "---HARNESS---" in out:
        user_stdout, _, tail = out.partition("---HARNESS---")
        try:
            payload = json.loads(tail.strip())
        except Exception:
            payload = None
    if payload is None:
        try:
            payload = json.loads(out.strip())
        except Exception:
            payload = None
    if payload is None or "fatal" in (payload or {}):
        msg = (payload or {}).get("fatal") if payload else (err.strip() or "Your code crashed before tests ran.")
        return [{"input": _fmt_args(t["args"]), "expected": t["expected"], "got": "",
                 "passed": False, "error": msg, "sample": bool(t.get("sample"))} for t in tests]

    for t, r in zip(tests, payload["results"]):
        if not r["ok"]:
            results.append({"input": _fmt_args(t["args"]), "expected": t["expected"], "got": "",
                            "passed": False, "error": r["error"], "sample": bool(t.get("sample")),
                            "stdout": user_stdout.strip()})
            continue
        got = r["value"]
        exp = t["expected"]
        passed = compare(got, exp, t.get("unordered") or problem.get("unordered"))
        results.append({"input": _fmt_args(t["args"]), "expected": exp, "got": got,
                        "passed": passed, "error": "", "sample": bool(t.get("sample")),
                        "stdout": user_stdout.strip()})
    return results


def _fmt_args(args):
    return ", ".join(json.dumps(a) for a in args)


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
    return json.loads(json.dumps(got)) == json.loads(json.dumps(exp))


# --------------------------------------------------------------------------
# SQL execution
# --------------------------------------------------------------------------
FORBIDDEN_SQL = re.compile(r"\b(attach|pragma)\b", re.I)


def sql_connect(problem):
    con = sqlite3.connect(":memory:")
    con.executescript(problem["schema"])
    con.executescript(problem["seed"])
    return con


def run_sql(problem, query):
    if FORBIDDEN_SQL.search(query):
        return {"error": "ATTACH/PRAGMA are not allowed here."}
    try:
        con = sql_connect(problem)
    except Exception as e:
        return {"error": "Problem seed failed: %s" % e}
    try:
        cur = con.execute(query)
        cols = [c[0] for c in (cur.description or [])]
        rows = cur.fetchall()
        return {"cols": cols, "rows": [list(r) for r in rows]}
    except Exception as e:
        return {"error": "%s: %s" % (type(e).__name__, e)}
    finally:
        con.close()


def sample_tables(problem):
    """Return a preview of every seeded table so the UI can show the data."""
    out = []
    try:
        con = sql_connect(problem)
    except Exception:
        return out
    try:
        names = [r[0] for r in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
        for n in names:
            cur = con.execute("SELECT * FROM %s LIMIT 12" % n)
            cols = [c[0] for c in cur.description]
            rows = [list(r) for r in cur.fetchall()]
            total = con.execute("SELECT COUNT(*) FROM %s" % n).fetchone()[0]
            out.append({"table": n, "cols": cols, "rows": rows, "total": total})
    finally:
        con.close()
    return out


def grade_sql(problem, query):
    got = run_sql(problem, query)
    if "error" in got:
        return {"passed": False, "got": got, "expected": None, "message": got["error"]}
    exp = run_sql(problem, problem["solution"])
    if "error" in exp:
        return {"passed": False, "got": got, "expected": None,
                "message": "Reference solution broke: %s" % exp["error"]}
    ordered = problem.get("ordered", False)
    g, e = got["rows"], exp["rows"]
    gn = [[_num(x) for x in r] for r in g]
    en = [[_num(x) for x in r] for r in e]
    if not ordered:
        gn = sorted(gn, key=lambda r: json.dumps(r, default=str))
        en = sorted(en, key=lambda r: json.dumps(r, default=str))
    passed = gn == en
    msg = "Correct." if passed else (
        "Wrong number of rows: got %d, expected %d." % (len(g), len(e)) if len(g) != len(e)
        else "Row count matches but values differ." + (
            " (This problem is order-sensitive — check your ORDER BY.)" if ordered else ""))
    if passed and len(got["cols"]) != len(exp["cols"]):
        passed, msg = False, "Wrong number of columns."
    return {"passed": passed, "got": got, "expected": exp, "message": msg}


def _num(x):
    if isinstance(x, float):
        return round(x, 6)
    return x


# --------------------------------------------------------------------------
# Progress
# --------------------------------------------------------------------------
def load_progress():
    if os.path.exists(PROGRESS_FILE):
        try:
            with open(PROGRESS_FILE) as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_progress(data):
    with open(PROGRESS_FILE, "w") as f:
        json.dump(data, f, indent=2)


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _send(self, code, body, ctype="application/json"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body)
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _file(self, path, ctype):
        try:
            with open(path, "rb") as f:
                self._send(200, f.read(), ctype)
        except FileNotFoundError:
            self._send(404, {"error": "not found"})

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        p = u.path
        if p in ("/", "/index.html"):
            return self._file(os.path.join(STATIC, "index.html"), "text/html; charset=utf-8")
        if p == "/static/app.js":
            return self._file(os.path.join(STATIC, "app.js"), "application/javascript")
        if p == "/static/style.css":
            return self._file(os.path.join(STATIC, "style.css"), "text/css")
        if p == "/api/problems":
            return self._send(200, {
                "problems": [public_meta(x) for x in PROBLEMS.values()],
                "progress": load_progress(),
            })
        if p.startswith("/api/problem/"):
            pid = p.rsplit("/", 1)[-1]
            if pid not in PROBLEMS:
                return self._send(404, {"error": "no such problem"})
            return self._send(200, public_problem(PROBLEMS[pid]))
        if p.startswith("/api/solution/"):
            pid = p.rsplit("/", 1)[-1]
            if pid not in PROBLEMS:
                return self._send(404, {"error": "no such problem"})
            pr = PROBLEMS[pid]
            return self._send(200, {
                "solution": pr.get("solution", ""),
                "explanation": pr.get("explanation", ""),
                "complexity": pr.get("complexity", ""),
            })
        return self._send(404, {"error": "not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            return self._send(400, {"error": "bad json"})
        p = urllib.parse.urlparse(self.path).path

        if p == "/api/progress":
            prog = load_progress()
            entry = prog.setdefault(body["id"], {})
            entry.update(body.get("patch", {}))
            save_progress(prog)
            return self._send(200, {"ok": True})

        if p == "/api/scratch":
            return self._send(200, run_python_freeform(body.get("code", ""), body.get("stdin", "")))

        pid = body.get("id")
        if pid not in PROBLEMS:
            return self._send(404, {"error": "no such problem"})
        pr = PROBLEMS[pid]

        if p == "/api/run" or p == "/api/submit":
            sample_only = (p == "/api/run")
            if pr["kind"] == "sql":
                res = grade_sql(pr, body.get("code", ""))
                return self._send(200, {"kind": "sql", **res})
            tests = [t for t in pr["tests"] if (t.get("sample") or not sample_only)]
            results = run_python_tests(pr, body.get("code", ""), tests)
            return self._send(200, {
                "kind": "python",
                "results": results,
                "passed": sum(1 for r in results if r["passed"]),
                "total": len(results),
            })
        return self._send(404, {"error": "not found"})


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    print("Loaded %d problems (%d python, %d sql)" % (
        len(PROBLEMS),
        sum(1 for x in PROBLEMS.values() if x["kind"] == "python"),
        sum(1 for x in PROBLEMS.values() if x["kind"] == "sql")))
    print("\n  ==>  http://localhost:%d\n" % PORT)
    with Server(("127.0.0.1", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nbye")

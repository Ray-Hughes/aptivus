#!/usr/bin/env python3
"""Run every reference solution against its own tests. Also sanity-checks SQL problems."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "app"))
import server

fails = 0
for pid, p in sorted(server.PROBLEMS.items()):
    if p["kind"] == "python":
        res = server.run_python_tests(p, p["solution"], p["tests"])
        bad = [(i, r) for i, r in enumerate(res) if not r["passed"]]
        if bad:
            fails += 1
            print("FAIL %s (%d/%d)" % (pid, len(res) - len(bad), len(res)))
            for i, r in bad[:4]:
                print("   test %d | in=%s | exp=%r | got=%r | err=%s"
                      % (i + 1, str(r["input"])[:90], r["expected"], r.get("got"), r["error"][:200]))
        else:
            print("ok   %s (%d tests)" % (pid, len(res)))
    else:
        out = server.run_sql(p, p["solution"])
        if "error" in out:
            fails += 1
            print("FAIL %s -> %s" % (pid, out["error"]))
        elif not out["rows"]:
            fails += 1
            print("FAIL %s -> reference query returned ZERO rows" % pid)
        else:
            g = server.grade_sql(p, p["solution"])
            status = "ok  " if g["passed"] else "FAIL"
            if not g["passed"]:
                fails += 1
            print("%s %s (%d rows, %d cols)" % (status, pid, len(out["rows"]), len(out["cols"])))

print("\n%d problem(s) failing" % fails)
sys.exit(1 if fails else 0)

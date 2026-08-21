#!/usr/bin/env python3
"""One-time migration: format v1 (Python dicts under packs/) -> format v2 JSON.

Run once, from anywhere:

    python3 packages/problems/scripts/migrate-v1.py

This is the only piece of the content layer that needs a Python interpreter, and
it needs one only because the v1 problems ARE Python source. Nothing downstream
does: the verifier gets its Python from Pyodide.

The migration is deliberately mechanical. Prompts, hints, tests, follow-ups and
explanations are copied byte for byte - none of it is re-worded - and the only
editorial decision encoded here is which *sections* of an explanation are about
Python's syntax rather than about the idea. Those move to
`languages.python.notes`, which is where v2 puts per-language commentary.
"""
import importlib.util
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(PKG))
V1 = os.path.join(REPO, "packs")
OUT = os.path.join(PKG, "packs")

# ---------------------------------------------------------------------------
# Editorial table: everything that is a judgement call, in one place.
# ---------------------------------------------------------------------------

# Explanation sections that are about Python rather than about the idea. They
# move verbatim, header included, into languages.python.notes. Anything not
# listed stays in the language-neutral explanation.
PYTHON_SECTIONS = {
    "py_01_two_sum_premium": ["Ruby to Python notes"],
    "py_02_top_k_brokers": ["Ruby to Python notes"],
    "py_03_group_anagrams": ["Ruby to Python notes"],
    "py_04_balanced_brackets": ["Ruby to Python notes"],
    "py_05_reconcile_feeds": ["Ruby to Python notes"],
    "py_06_longest_unique_run": ["Ruby to Python notes"],
    "py_07_merge_intervals": ["Ruby to Python notes"],
    "py_08_binary_search_rate": ["Ruby to Python notes"],
    "py_09_broker_hierarchy": ["Ruby to Python notes", "The iterative version, if they push"],
    "py_10_workflow_order": ["Ruby to Python notes"],
    "py_11_accumulation_window": ["Ruby to Python notes"],
    "py_12_stdin_totals": [
        "The four stdin patterns to have in muscle memory",
        "Ruby to Python notes",
    ],
    "py_13_min_layers": ["Ruby to Python notes", "Recursive alternative, if you prefer it"],
    "py_14_lru_cache": ["What to say when you reach for OrderedDict", "Ruby to Python notes"],
    "py_15_flatten_payload": ["Ruby to Python notes"],
}

# Typed signatures. v1 carried these as a comment in the starter
# ("# premiums: list[int], target: int -> list[int]"); v2 makes them data so a
# statically typed language can generate a call site.
SIGNATURES = {
    "py_01_two_sum_premium": {
        "py": "find_pair", "js": "findPair",
        "params": [("premiums", "int[]"), ("target", "int")], "returns": "int[]",
    },
    "py_02_top_k_brokers": {
        "py": "top_k_brokers", "js": "topKBrokers",
        "params": [("records", "any[][]"), ("k", "int")], "returns": "string[]",
    },
    "py_03_group_anagrams": {
        "py": "group_anagrams", "js": "groupAnagrams",
        "params": [("words", "string[]")], "returns": "string[][]",
    },
    "py_04_balanced_brackets": {
        "py": "is_valid", "js": "isValid",
        "params": [("s", "string")], "returns": "bool",
    },
    "py_05_reconcile_feeds": {
        "py": "reconcile", "js": "reconcile",
        "params": [("legacy", "any[][]"), ("platform", "any[][]")],
        "returns": "map<string, any>",
    },
    "py_06_longest_unique_run": {
        "py": "longest_unique", "js": "longestUnique",
        "params": [("codes", "string")], "returns": "int",
    },
    "py_07_merge_intervals": {
        "py": "merge_coverage", "js": "mergeCoverage",
        "params": [("periods", "int[][]")], "returns": "int[][]",
    },
    "py_08_binary_search_rate": {
        "py": "rate_for", "js": "rateFor",
        "params": [("table", "any[][]"), ("tiv", "int")], "returns": "float",
    },
    "py_09_broker_hierarchy": {
        "py": "rollup", "js": "rollup",
        "params": [("edges", "string[][]"), ("premiums", "map<string, int>"), ("root", "string")],
        "returns": "map<string, int>",
    },
    "py_10_workflow_order": {
        "py": "order_steps", "js": "orderSteps",
        "params": [("steps", "string[]"), ("deps", "string[][]")], "returns": "string[]",
    },
    "py_11_accumulation_window": {
        "py": "peak_accumulation", "js": "peakAccumulation",
        "params": [("events", "int[][]"), ("w", "int")], "returns": "int",
    },
    # stdin mode: a whole program, so there is no function to name and no
    # declared parameters. The contract is stdin in, stdout out.
    "py_12_stdin_totals": {"py": "", "js": "", "params": [], "returns": "void"},
    "py_13_min_layers": {
        "py": "min_layers", "js": "minLayers",
        "params": [("sizes", "int[]"), ("limit", "int")], "returns": "int",
    },
    "py_14_lru_cache": {
        "py": "run_ops", "js": "runOps",
        "params": [("capacity", "int"), ("ops", "any[][]")], "returns": "int[]",
    },
    "py_15_flatten_payload": {
        "py": "flatten", "js": "flatten",
        "params": [("payload", "map<string, any>")], "returns": "map<string, any>",
    },
}

PACK_META = {
    "federato": {
        "companies": [
            {"slug": "federato", "name": "Federato", "industry": "Insurance (P&C RiskOps)"},
        ],
    },
}


# ---------------------------------------------------------------------------
def split_sections(text):
    """Split a markdown explanation into (title, block) pairs.

    A block is the '### Title' line plus everything up to the next '### '. Text
    before the first header keeps the title None. Nothing is reflowed or
    trimmed beyond the outer newlines, so joining the pieces back together
    reproduces the original.
    """
    lines = text.split("\n")
    out, title, buf = [], None, []
    for line in lines:
        if line.startswith("### "):
            if buf or title is not None:
                out.append((title, "\n".join(buf)))
            title, buf = line[4:].strip(), [line]
        else:
            buf.append(line)
    if buf or title is not None:
        out.append((title, "\n".join(buf)))
    return out


def partition_explanation(pid, text):
    """Return (neutral_explanation, python_notes)."""
    wanted = PYTHON_SECTIONS.get(pid, [])
    if not wanted:
        return text.strip(), ""
    keep, move = [], []
    seen = set()
    for title, block in split_sections(text):
        (move if title in wanted else keep).append(block)
        if title in wanted:
            seen.add(title)
    missing = [w for w in wanted if w not in seen]
    if missing:
        raise SystemExit("%s: explanation has no section(s) %r" % (pid, missing))
    return "\n".join(keep).strip(), "\n".join(move).strip()


def load_v1(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.PROBLEM


def migrate_code(pid, pack, p):
    sig = SIGNATURES.get(pid)
    if sig is None:
        raise SystemExit("%s: no signature defined in SIGNATURES" % pid)
    if sig["py"] != p.get("func", ""):
        raise SystemExit("%s: signature name %r != v1 func %r" % (pid, sig["py"], p.get("func")))

    explanation, notes = partition_explanation(pid, p.get("explanation", ""))
    names = {}
    if sig["py"]:
        # Python and Ruby share snake_case, so the Ruby name is the same string.
        names = {"python": sig["py"], "ruby": sig["py"], "javascript": sig["js"]}
        names = {k: v for k, v in names.items() if v}

    out = {
        "id": pid,
        "pack": pack,
        "kind": "code",
        "title": p["title"],
        "difficulty": p.get("difficulty", "medium"),
        "pattern": p.get("pattern", ""),
        "tags": p.get("tags", []),
        "minutes": p.get("minutes", 15),
        "mode": p.get("mode", "function"),
        "prompt": p["prompt"].strip("\n"),
        "hints": p.get("hints", []),
        "explanation": explanation,
        "followups": p.get("followups", []),
        "signature": {
            "name": names,
            "params": [{"name": n, "type": t} for n, t in sig["params"]],
            "returns": sig["returns"],
        },
        "tests": [dict(t) for t in p.get("tests", [])],
        "languages": {
            "python": {
                "starter": p.get("starter", ""),
                "solution": p["solution"].strip("\n") + "\n",
                "notes": notes,
            },
        },
    }
    if p.get("complexity"):
        out["complexity"] = p["complexity"]
    if p.get("unordered"):
        out["unordered"] = True
    return out


ROWS_RE = re.compile(r"must have (\d+) rows")


def migrate_sql(pid, pack, p):
    out = {
        "id": pid,
        "pack": pack,
        "kind": "sql",
        "title": p["title"],
        "difficulty": p.get("difficulty", "medium"),
        "pattern": p.get("pattern", ""),
        "tags": p.get("tags", []),
        "minutes": p.get("minutes", 15),
        "prompt": p["prompt"].strip("\n"),
        "hints": p.get("hints", []),
        "explanation": p.get("explanation", "").strip(),
        "followups": p.get("followups", []),
        "sql": {
            "schema": p["schema"].strip("\n") + "\n",
            "seed": p["seed"].strip("\n") + "\n",
            "ordered": bool(p.get("ordered", False)),
            "dialect": "sqlite",
        },
        "languages": {
            "sql": {
                "starter": p.get("starter", ""),
                "solution": p["solution"].strip("\n") + "\n",
            },
        },
    }
    if p.get("complexity"):
        out["complexity"] = p["complexity"]
    # The starters make row-count claims to the reader. Lifting them into data
    # turns a comment nobody checks into something verify.mjs enforces.
    m = ROWS_RE.search(p.get("starter", ""))
    if m:
        out["sql"]["expectedRowCount"] = int(m.group(1))
    return out


def main():
    if not os.path.isdir(V1):
        raise SystemExit("no v1 packs at %s" % V1)
    total = 0
    for pack in sorted(os.listdir(V1)):
        pack_dir = os.path.join(V1, pack)
        if not os.path.isdir(pack_dir) or pack.startswith("."):
            continue
        dest = os.path.join(OUT, pack)
        problems = []
        for kind in ("python", "sql"):
            d = os.path.join(pack_dir, kind)
            if not os.path.isdir(d):
                continue
            for fn in sorted(os.listdir(d)):
                if not fn.endswith(".py") or fn.startswith("_"):
                    continue
                pid = fn[:-3]
                p = load_v1(os.path.join(d, fn), "%s_%s" % (pack, pid))
                problems.append(migrate_code(pid, pack, p) if kind == "python"
                                else migrate_sql(pid, pack, p))
        if not problems:
            continue
        os.makedirs(dest, exist_ok=True)

        manifest_path = os.path.join(pack_dir, "pack.json")
        manifest = {}
        if os.path.exists(manifest_path):
            with open(manifest_path) as f:
                manifest = json.load(f)
        v2_manifest = {
            "name": manifest.get("name", pack),
            "title": manifest.get("title", pack),
            "description": manifest.get("description", ""),
            # v1 packs declared a single "language"; v2 packs do not belong to
            # a language, so that field is dropped rather than carried.
            "companies": PACK_META.get(pack, {}).get("companies", []),
            "source": manifest.get("source", ""),
        }
        with open(os.path.join(dest, "pack.json"), "w") as f:
            json.dump(v2_manifest, f, indent=2, ensure_ascii=False)
            f.write("\n")

        for problem in problems:
            path = os.path.join(dest, problem["id"] + ".json")
            # Preserve an already-migrated problem's extra language bindings:
            # this script owns the v1 fields, not the JavaScript ones added
            # afterwards.
            if os.path.exists(path):
                with open(path) as f:
                    existing = json.load(f)
                for lang, binding in existing.get("languages", {}).items():
                    if lang not in problem["languages"]:
                        problem["languages"][lang] = binding
            with open(path, "w") as f:
                json.dump(problem, f, indent=2, ensure_ascii=False)
                f.write("\n")
            total += 1
        print("%-12s %d problems -> %s" % (pack, len(problems), dest))
    print("migrated %d problems" % total)


if __name__ == "__main__":
    sys.exit(main())

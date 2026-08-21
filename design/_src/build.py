#!/usr/bin/env python3
"""Assemble the standalone design prototypes.

Each source page carries the marker /*@CORE@*/ inside its <style>; it is
replaced with core.css so every published file is fully self-contained
(inline CSS, inline JS, no build step needed to view it).
"""
import pathlib, sys

HERE = pathlib.Path(__file__).parent
SRC = HERE          # the page sources live beside this script
OUT = HERE.parent   # the four standalone deliverables
OUT.mkdir(parents=True, exist_ok=True)

core = (SRC / "core.css").read_text()
pages = sys.argv[1:] or ["design-system", "landing", "profile", "coding"]

for name in pages:
    p = SRC / f"{name}.html"
    if not p.exists():
        print(f"  skip {name} (no source)")
        continue
    html = p.read_text()
    if "/*@CORE@*/" not in html:
        print(f"  !! {name}: no /*@CORE@*/ marker")
    html = html.replace("/*@CORE@*/", core)
    (OUT / f"{name}.html").write_text(html)
    print(f"  built {name}.html  ({len(html)//1024} KB)")

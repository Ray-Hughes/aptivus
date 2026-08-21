# Source for the prototypes

The four HTML files one level up are the deliverable and are fully self-contained —
they need nothing in this folder to open and work.

This folder is how they are kept consistent. Each page here carries a `/*@CORE@*/`
marker inside its `<style>`; `build.py` replaces that marker with `core.css` and
writes the result to `../`. So the token block and every shared primitive are
authored **once**, in `core.css`, and inlined into all four outputs.

```
python3 build.py                 # rebuild all four
python3 build.py coding          # rebuild one
```

If you edit `../coding.html` directly, edit it here too — or the next build will
overwrite you.

"""Server-side driver for core.engine.

The engine itself is isolation-agnostic. Here we give it the isolation the
server needs: a separate process with a wall-clock timeout, so an infinite
loop or a crash cannot take the server with it. The browser gets the same
guarantee by terminating its worker.
"""
import json
import os
import subprocess
import sys

ENGINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "engine.py")
MARKER = "\n---ENGINE---\n"
TIMEOUT = 8
TRACE_TIMEOUT = 20


def call(payload, timeout=TIMEOUT):
    """Run one engine op out-of-process. Returns (result, error_message)."""
    try:
        proc = subprocess.run(
            [sys.executable, ENGINE], input=json.dumps(payload),
            capture_output=True, text=True, timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return None, ("Timed out after %ds. An infinite loop, or just too slow."
                      % timeout)
    out = proc.stdout
    if MARKER not in out:
        return None, (proc.stderr.strip() or
                      "Your code crashed before it could be measured.")[:2000]
    printed, _, tail = out.partition(MARKER)
    try:
        result = json.loads(tail)
    except Exception:
        return None, "Could not read the engine output."
    if isinstance(result, dict) and printed.strip() and not result.get("printed"):
        result["printed"] = printed.strip()
    return result, None

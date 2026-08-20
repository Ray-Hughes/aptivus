/* Runs core/engine.py inside Pyodide, in a Web Worker.
 *
 * This is the same Python the server executes. Isolation comes from the worker:
 * the page can terminate it, which is how an infinite loop gets stopped without
 * a server-side sandbox - and why untrusted code never has to leave the browser.
 */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
importScripts(PYODIDE + "pyodide.js");

let pyodide = null;
let booting = null;

async function boot() {
  pyodide = await loadPyodide({ indexURL: PYODIDE });
  const src = await (await fetch("/core/engine.py")).text();
  // Write it to the virtual filesystem and import it as a module, so the
  // __main__ block (which reads stdin) never fires.
  pyodide.FS.writeFile("/home/pyodide/engine.py", src);
  pyodide.runPython(
    "import sys; sys.path.insert(0, '/home/pyodide')\n" +
    "import engine, json\n"
  );
  return pyodide;
}

function call(payload) {
  pyodide.globals.set("_req", JSON.stringify(payload));
  const out = pyodide.runPython("json.dumps(engine.dispatch(json.loads(_req)))");
  return JSON.parse(out);
}

self.onmessage = async (e) => {
  const { id, op, payload } = e.data;
  try {
    if (!booting) booting = boot();
    await booting;
    if (op === "ping") return self.postMessage({ id, ok: true, result: "ready" });
    self.postMessage({ id, ok: true, result: call({ op, ...payload }) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};

/* Runs core/engine.py inside Pyodide, in a Web Worker.
 *
 * The same Python the CLI runs. Isolation comes from the worker: the page can
 * terminate it, which is how an infinite loop is stopped without any
 * server-side sandbox - and why untrusted code never leaves the browser.
 */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
importScripts(PYODIDE + "pyodide.js");

let pyodide = null;
let booting = null;

async function boot() {
  pyodide = await loadPyodide({ indexURL: PYODIDE });
  const src = await (await fetch("/engine.py")).text();
  // Import as a module so engine.py's __main__ block (which reads stdin) never fires.
  pyodide.FS.writeFile("/home/pyodide/engine.py", src);
  pyodide.runPython("import sys; sys.path.insert(0,'/home/pyodide')\nimport engine, json\n");
  return pyodide;
}

function call(payload) {
  // Pass JSON as text and parse it in Python: JS has one number type and would
  // silently turn 1.0 into 1, which changes what a test actually asserts.
  pyodide.globals.set("_req", JSON.stringify(payload));
  return JSON.parse(pyodide.runPython("json.dumps(engine.dispatch(json.loads(_req)))"));
}

self.onmessage = async (e) => {
  const { id, op, payload } = e.data || {};
  try {
    if (!booting) booting = boot();
    await booting;
    if (op === "ping") return self.postMessage({ id, ok: true, result: "ready" });
    self.postMessage({ id, ok: true, result: call({ op, ...payload }) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};

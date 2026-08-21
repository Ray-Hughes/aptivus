/* Runs the learner's JavaScript against test cases, in a Web Worker.
 *
 * The worker is the sandbox: the page terminates it to stop an infinite loop,
 * and the code has no DOM, no cookies and no access to the session. Same
 * bargain as the Python engine - user code never reaches our servers.
 */
function shortRepr(v) {
  try {
    if (v === undefined) return "undefined";
    if (typeof v === "function") return "[Function]";
    const s = JSON.stringify(v);
    return s === undefined ? String(v) : s.length > 160 ? s.slice(0, 157) + "..." : s;
  } catch {
    return String(v);
  }
}

function compare(got, want, unordered) {
  if (unordered && Array.isArray(got) && Array.isArray(want)) {
    if (got.length !== want.length) return false;
    const k = (v) => JSON.stringify(v);
    return got.map(k).sort().join(" ") === want.map(k).sort().join(" ");
  }
  if (typeof want === "number" && typeof got === "number") {
    return Math.abs(got - want) < 1e-6;
  }
  try {
    return JSON.stringify(got ?? null) === JSON.stringify(want ?? null);
  } catch {
    return false;
  }
}

self.onmessage = (e) => {
  const { id, op, payload } = e.data || {};
  if (op === "ping") return self.postMessage({ id, ok: true, result: "ready" });

  const { code, cases, func, unordered } = payload || {};
  const logs = [];
  try {
    // Capture prints so a learner's console.log still reaches them.
    const sandboxConsole = {
      log: (...a) => logs.push(a.map(shortRepr).join(" ")),
      error: (...a) => logs.push(a.map(shortRepr).join(" ")),
      warn: (...a) => logs.push(a.map(shortRepr).join(" ")),
    };
    const src =
      '"use strict";\n' + code + '\n;return typeof ' + func +
      ' === "function" ? ' + func + " : undefined;";
    const fn = new Function("console", src)(sandboxConsole);

    if (typeof fn !== "function") {
      return self.postMessage({
        id,
        ok: false,
        error:
          "No function named " + func + " was defined. Check the name, and that it is " +
          "not scoped inside another block.",
      });
    }

    const results = (cases || []).map((c, index) => {
      const args = structuredClone(c.args ?? []);
      const row = {
        index,
        input: (c.args ?? []).map((a) => JSON.stringify(a)).join(", "),
        expected: c.expected,
        sample: Boolean(c.sample),
      };
      try {
        const value = fn(...args);
        const got =
          value instanceof Set ? Array.from(value).sort()
          : value instanceof Map ? Object.fromEntries(value)
          : value;
        return {
          ...row, got, error: "",
          passed: compare(got, c.expected, c.unordered || unordered),
        };
      } catch (err) {
        return { ...row, got: null, passed: false, error: err.name + ": " + err.message };
      }
    });

    self.postMessage({ id, ok: true, result: { results, printed: logs.join("\n") } });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.name + ": " + err.message });
  }
};

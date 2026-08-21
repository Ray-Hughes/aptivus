"use client";

import type { ResultRow, TestCase } from "./engine-client";

/**
 * JavaScript execution, mirroring the Python engine's contract so the UI does
 * not care which language it is driving.
 */
class JsEngine {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, { res: (v: unknown) => void; rej: (e: Error) => void }>();

  private ensure() {
    if (this.worker) return this.worker;
    const w = new Worker("/js-worker.js");
    w.onmessage = (e: MessageEvent) => {
      const { id, ok, result, error } = e.data || {};
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      if (ok) p.res(result);
      else p.rej(new Error(error));
    };
    this.worker = w;
    return w;
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
    for (const [, p] of this.pending) p.rej(new Error("Stopped."));
    this.pending.clear();
  }

  run(code: string, cases: TestCase[], func: string, unordered = false, timeoutMs = 10_000) {
    const w = this.ensure();
    const id = ++this.seq;
    return new Promise<{ results: ResultRow[]; printed: string }>((resolve, reject) => {
      const timer = setTimeout(() => {
        // Terminating the worker is the only way to stop a runaway loop.
        this.terminate();
        reject(new Error("Timed out. An infinite loop, or just too slow."));
      }, timeoutMs);
      this.pending.set(id, {
        res: (v) => {
          clearTimeout(timer);
          resolve(v as { results: ResultRow[]; printed: string });
        },
        rej: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      w.postMessage({ id, op: "run", payload: { code, cases, func, unordered } });
    });
  }
}

let singleton: JsEngine | null = null;
export function getJsEngine() {
  if (!singleton) singleton = new JsEngine();
  return singleton;
}

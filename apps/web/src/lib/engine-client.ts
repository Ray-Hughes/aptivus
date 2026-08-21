"use client";

/**
 * Browser-side execution. User code runs in a Web Worker, never on our servers,
 * so there is no sandbox to operate and no per-run cost.
 */
export type TestCase = { args?: unknown[]; stdin?: string; expected?: unknown; sample?: boolean };
export type ResultRow = {
  input: string; expected: unknown; got: unknown; passed: boolean;
  error: string; sample: boolean; stdout?: string; index?: number;
};
export type PoolValue = { s: string; p: string; t: string; n: number | null };
export type Step = {
  line: number; func: string; fid: number;
  locals: Record<string, number>; changed: string[]; returned?: string;
};
export type TraceResult = {
  kind: "python"; source: string[]; steps: Step[]; pool: PoolValue[];
  truncated: boolean; collapsed: boolean; funcs: string[];
  result: string; error: string | null; printed: string;
};

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

class Engine {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private ready = false;

  private ensure() {
    if (this.worker) return this.worker;
    const w = new Worker("/engine-worker.js");
    w.onmessage = (e: MessageEvent) => {
      const { id, ok, result, error } = e.data || {};
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      ok ? p.resolve(result) : p.reject(new Error(error));
    };
    this.worker = w;
    return w;
  }

  /** Kill a runaway program. The worker is the sandbox boundary. */
  terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    for (const [, p] of this.pending) p.reject(new Error("Stopped."));
    this.pending.clear();
  }

  private send<T>(op: string, payload: Record<string, unknown>, timeoutMs = 20_000) {
    const w = this.ensure();
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.terminate();
        reject(new Error("Timed out. An infinite loop, or just too slow."));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v as T); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      w.postMessage({ id, op, payload });
    });
  }

  async warm() {
    if (this.ready) return;
    await this.send<string>("ping", {}, 120_000);
    this.ready = true;
  }

  isReady() { return this.ready; }

  run(code: string, cases: TestCase[], mode = "function", func = "") {
    return this.send<{ results: ResultRow[] }>("run", { code, cases, mode, func });
  }

  trace(code: string, testCase: TestCase, mode = "function", func = "") {
    return this.send<TraceResult>("trace", { code, case: testCase, mode, func });
  }

  evalAt(code: string, testCase: TestCase, step: number, expr: string, mode = "function", func = "") {
    return this.send<{ repr?: string; pretty?: string; type?: string; len?: number | null; error?: string }>(
      "eval", { code, case: testCase, step, expr, mode, func },
    );
  }

  scratch(code: string, stdin: string) {
    return this.send<{ stdout: string; stderr: string }>("scratch", { code, stdin });
  }
}

let singleton: Engine | null = null;
export function getEngine() {
  if (!singleton) singleton = new Engine();
  return singleton;
}

"use client";

/**
 * SQLite in the browser, via sql.js. Same principle as the Python engine: the
 * learner's query runs in their own tab, and only the resulting rows go back
 * to be judged against a reference query they never receive.
 */
const CDN = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.11.0/";

type SqlJsStatic = { Database: new () => SqlDb };
type SqlDb = {
  run: (sql: string) => void;
  exec: (sql: string) => { columns: string[]; values: unknown[][] }[];
  close: () => void;
};

declare global {
  interface Window { initSqlJs?: (c: { locateFile: (f: string) => string }) => Promise<SqlJsStatic>; }
}

let ready: Promise<SqlJsStatic> | null = null;

function load(): Promise<SqlJsStatic> {
  if (ready) return ready;
  ready = new Promise((resolve, reject) => {
    if (window.initSqlJs) {
      window.initSqlJs({ locateFile: (f) => CDN + f }).then(resolve, reject);
      return;
    }
    const s = document.createElement("script");
    s.src = CDN + "sql-wasm.js";
    s.onload = () => window.initSqlJs!({ locateFile: (f) => CDN + f }).then(resolve, reject);
    s.onerror = () => reject(new Error("Could not load the SQL engine."));
    document.head.appendChild(s);
  });
  return ready;
}

export type SqlResult =
  | { ok: true; columns: string[]; rows: unknown[][] }
  | { ok: false; error: string };

export async function runQuery(schema: string, seed: string, query: string): Promise<SqlResult> {
  if (!query.trim()) return { ok: false, error: "Write a query first." };
  const SQL = await load();
  const db = new SQL.Database();
  try {
    db.run(schema);
    db.run(seed);
    const out = db.exec(query);
    if (!out.length) return { ok: true, columns: [], rows: [] };
    return { ok: true, columns: out[0].columns, rows: out[0].values };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    db.close();
  }
}

/** Preview every seeded table so the learner can see the data they are querying. */
export async function previewTables(schema: string, seed: string) {
  const SQL = await load();
  const db = new SQL.Database();
  try {
    db.run(schema);
    db.run(seed);
    const names = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const tables = (names[0]?.values ?? []).map((r) => String(r[0]));
    return tables.map((t) => {
      const res = db.exec(`SELECT * FROM ${t} LIMIT 8`);
      const count = db.exec(`SELECT COUNT(*) FROM ${t}`);
      return {
        table: t,
        columns: res[0]?.columns ?? [],
        rows: res[0]?.values ?? [],
        total: Number(count[0]?.values?.[0]?.[0] ?? 0),
      };
    });
  } catch {
    return [];
  } finally {
    db.close();
  }
}

import { createClient } from "@libsql/client";

/**
 * Grade a SQL answer without ever sending the reference query to the client.
 *
 * Same shape as the code path: the learner's query runs in their browser
 * against the schema and seed (both public - they are printed in the problem),
 * the resulting rows come back, and the reference query runs here so the
 * comparison happens against something the client never saw.
 */
export type SqlRows = { columns: string[]; rows: unknown[][] };

const FORBIDDEN = /\b(attach|pragma|vacuum)\b/i;

function normalise(rows: unknown[][], ordered: boolean) {
  const cell = (v: unknown) =>
    typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v === null ? null : v;
  const out = rows.map((r) => r.map(cell));
  if (ordered) return out;
  return out.slice().sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

export async function gradeSql(
  problem: { schema: string; seed: string; solution: string; ordered?: boolean },
  submitted: SqlRows,
): Promise<{ passed: boolean; message: string; expectedRows: number }> {
  if (FORBIDDEN.test(problem.solution)) {
    return { passed: false, message: "Reference query is not runnable.", expectedRows: 0 };
  }

  const db = createClient({ url: ":memory:" });
  try {
    for (const stmt of problem.schema.split(";")) if (stmt.trim()) await db.execute(stmt);
    for (const stmt of problem.seed.split(";")) if (stmt.trim()) await db.execute(stmt);
    const ref = await db.execute(problem.solution);

    const expected = normalise(ref.rows.map((r) => Array.from(r as unknown as unknown[])),
                               Boolean(problem.ordered));
    const got = normalise(submitted.rows ?? [], Boolean(problem.ordered));

    if (got.length !== expected.length) {
      return {
        passed: false,
        expectedRows: expected.length,
        message: `Wrong number of rows: got ${got.length}, expected ${expected.length}.`,
      };
    }
    if (ref.columns.length !== (submitted.columns?.length ?? 0)) {
      return {
        passed: false, expectedRows: expected.length,
        message: `Wrong number of columns: got ${submitted.columns?.length ?? 0}, expected ${ref.columns.length}.`,
      };
    }
    const same = JSON.stringify(got) === JSON.stringify(expected);
    return {
      passed: same,
      expectedRows: expected.length,
      message: same
        ? "Correct."
        : problem.ordered
          ? "Right number of rows, but the values or the order differ — check your ORDER BY."
          : "Right number of rows, but the values differ.",
    };
  } catch (e) {
    return { passed: false, expectedRows: 0, message: `Could not grade: ${(e as Error).message}` };
  } finally {
    db.close();
  }
}

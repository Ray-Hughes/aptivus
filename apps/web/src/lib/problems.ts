/**
 * Reading problems out of the database, and deciding what is allowed to leave
 * the server.
 *
 * The `problems.body` column holds the whole v2 problem: hidden tests, every
 * reference solution, the hint text and the write-up. That is deliberate - the
 * server is the only place any of it exists - and it means every read path has
 * to go through a redactor. `toPublic` and `toSummary` below are the only two
 * functions that may be used to build a response body for an unmetered route.
 *
 * The metered routes (`/hint`, `/solution`) reach past them on purpose, once
 * `spend()` has said yes.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { companies, problems } from "@/db/schema";
import type {
  Binding,
  Language,
  Problem,
  ProblemSummary,
  PublicProblem,
  PublicTest,
} from "@aptivus/problems";

export type ProblemRow = typeof problems.$inferSelect;
export type CompanyRef = { slug: string; name: string } | null;
export type LoadedProblem = { row: ProblemRow; body: Problem; company: CompanyRef };

/**
 * The stored body is written by `scripts/import-problems.mjs`, which validates
 * it against the zod schema before it is ever inserted. Re-parsing it on every
 * read would be a waste; the import is the gate.
 */
export function bodyOf(row: ProblemRow): Problem {
  return row.body as Problem;
}

/** Languages this problem actually carries a reference solution for. */
export function languagesOf(body: Problem): Language[] {
  return (Object.keys(body.languages) as Language[]).filter((l) =>
    body.languages[l]?.solution?.trim(),
  );
}

export function bindingOf(body: Problem, language: Language): Binding | undefined {
  return body.languages[language];
}

/* ------------------------------------------------------------------ */
/* redaction                                                           */
/* ------------------------------------------------------------------ */

/**
 * `showCompany` follows the `company_packs` flag: with the flag off the whole
 * company surface is absent, not just the filter, so turning it off is a real
 * off switch rather than a hidden-but-reachable one.
 */
export function toSummary(
  { row, body, company }: LoadedProblem,
  showCompany = true,
): ProblemSummary {
  return {
    id: row.slug,
    pack: row.pack,
    kind: body.kind,
    title: row.title,
    difficulty: body.difficulty,
    pattern: body.pattern,
    tags: body.tags,
    minutes: row.minutes,
    languages: languagesOf(body),
    company: showCompany ? company : null,
  };
}

/**
 * The full problem minus everything that is paid for. Built by naming each
 * field that travels rather than by deleting the ones that must not: a new
 * secret field added to the format then defaults to staying on the server.
 */
export function toPublic(loaded: LoadedProblem, showCompany = true): PublicProblem {
  const { body } = loaded;
  const base: PublicProblem = {
    ...toSummary(loaded, showCompany),
    prompt: body.prompt,
    followups: body.followups,
    hintCount: body.hints.length,
    starters: Object.fromEntries(
      (Object.keys(body.languages) as Language[]).map((l) => [
        l,
        { starter: body.languages[l]?.starter ?? "" },
      ]),
    ),
  };

  if (body.kind === "sql") {
    const { expectedRowCount: _expected, ...sql } = body.sql;
    return { ...base, sql };
  }

  const sampleTests = body.tests.filter((t): t is PublicTest => t.sample === true);
  return {
    ...base,
    mode: body.mode,
    signature: body.signature,
    unordered: body.unordered,
    sampleTests,
    hiddenTestCount: body.tests.length - sampleTests.length,
  };
}

/* ------------------------------------------------------------------ */
/* queries                                                             */
/* ------------------------------------------------------------------ */

const companyRef = (slug: string | null, name: string | null): CompanyRef =>
  slug && name ? { slug, name } : null;

export type ListFilter = {
  pack?: string;
  kind?: Problem["kind"];
  difficulty?: Problem["difficulty"];
  /** Company slug. Gated behind the `company_packs` flag by the route. */
  company?: string;
  language?: Language;
  limit: number;
};

export async function listProblems(filter: ListFilter): Promise<LoadedProblem[]> {
  const where = [eq(problems.isPublished, true)];
  if (filter.pack) where.push(eq(problems.pack, filter.pack));
  if (filter.kind) where.push(eq(problems.kind, filter.kind));
  if (filter.difficulty) where.push(eq(problems.difficulty, filter.difficulty));
  if (filter.company) {
    const ids = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.slug, filter.company), eq(companies.isPublished, true)));
    if (!ids.length) return [];
    where.push(inArray(problems.companyId, ids.map((c) => c.id)));
  }

  const rows = await db
    .select({
      problem: problems,
      companySlug: companies.slug,
      companyName: companies.name,
    })
    .from(problems)
    .leftJoin(companies, eq(companies.id, problems.companyId))
    .where(and(...where))
    .orderBy(asc(problems.pack), asc(problems.slug))
    .limit(filter.limit);

  return rows
    .map((r) => ({
      row: r.problem,
      body: bodyOf(r.problem),
      company: companyRef(r.companySlug, r.companyName),
    }))
    .filter((p) => !filter.language || languagesOf(p.body).includes(filter.language));
}

export async function findProblem(slug: string): Promise<LoadedProblem | null> {
  const [r] = await db
    .select({
      problem: problems,
      companySlug: companies.slug,
      companyName: companies.name,
    })
    .from(problems)
    .leftJoin(companies, eq(companies.id, problems.companyId))
    .where(and(eq(problems.slug, slug), eq(problems.isPublished, true)))
    .limit(1);
  if (!r) return null;
  return {
    row: r.problem,
    body: bodyOf(r.problem),
    company: companyRef(r.companySlug, r.companyName),
  };
}

/** How many tests a submission is graded against. Never taken from the client. */
export function testCount(body: Problem): number {
  return body.kind === "code" ? body.tests.length : 1;
}

/**
 * GET /api/problems - the catalog.
 *
 * Browsable without an account on purpose: requiring a signup to see the
 * product is the cheapest way to kill conversion. Nothing here is metered
 * content - it is titles, patterns and difficulties - and `toSummary` is what
 * guarantees that.
 *
 *   ?pack=federato        ?kind=code|sql        ?difficulty=easy|medium|hard
 *   ?company=federato     ?language=python      ?limit=100
 */
import { z } from "zod";
import { auth } from "@/auth";
import { fail, isResponse, json, readQuery } from "@/lib/api";
import { FLAGS, isEnabled } from "@/lib/flags";
import { listProblems, toSummary } from "@/lib/problems";

const Query = z.object({
  pack: z.string().min(1).max(64).optional(),
  kind: z.enum(["code", "sql"]).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  company: z.string().min(1).max(64).optional(),
  language: z.enum(["python", "javascript", "ruby", "sql"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export async function GET(request: Request): Promise<Response> {
  const query = readQuery(new URL(request.url), Query);
  if (isResponse(query)) return query;

  // Company-targeted listing is the paid-tier surface, so it is behind a flag
  // rather than behind "it happens to work".
  const session = await auth();
  const companyPacks = await isEnabled(FLAGS.companyPacks, session?.user?.id ?? null);
  if (query.company && !companyPacks) {
    return fail(403, "Company packs are not available on this account.", {
      flag: FLAGS.companyPacks,
    });
  }

  const found = await listProblems(query);
  return json({
    count: found.length,
    filter: query,
    problems: found.map((p) => toSummary(p, companyPacks)),
  });
}

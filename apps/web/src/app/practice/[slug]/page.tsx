import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { problems } from "@/db/schema";
import { summary } from "@/lib/entitlements";
import { Workbench } from "./Workbench";

export default async function PracticePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  const { slug } = await params;
  if (!session?.user?.id) redirect(`/signin?next=/practice/${slug}`);

  const [row] = await db.select().from(problems).where(eq(problems.slug, slug)).limit(1);
  if (!row) notFound();

  const body = row.body as Record<string, unknown>;
  const languages = (body.languages ?? {}) as Record<string, { starter?: string }>;
  const tests = (body.tests ?? []) as { sample?: boolean }[];
  const isSql = row.kind === "sql";
  // Only offer languages this problem actually has a binding for. 14 problems
  // carry JavaScript; offering it on the rest would be a dead option.
  const signature = (body.signature as { name?: Record<string, string> }) ?? {};
  const available = (["python", "javascript"] as const).filter(
    (l) => Boolean(languages[l]?.starter) && Boolean(signature.name?.[l]),
  );
  const sqlSpec = (body.sql ?? {}) as { schema?: string; seed?: string; ordered?: boolean };
  const ent = await summary(session.user.id);

  // Hidden tests and reference solutions never reach the client unmetered.
  // Sample cases only; everything else is graded behind the API.
  return (
    <Workbench
      slug={row.slug}
      title={row.title}
      difficulty={row.difficulty}
      pattern={row.pattern ?? ""}
      minutes={row.minutes}
      prompt={String(body.prompt ?? "")}
      followups={(body.followups ?? []) as string[]}
      hintCount={((body.hints ?? []) as string[]).length}
      kind={isSql ? "sql" : "code"}
      languages={isSql ? [] : available}
      starters={Object.fromEntries(available.map((l) => [l, languages[l]?.starter ?? ""]))}
      funcs={Object.fromEntries(available.map((l) => [l, signature.name?.[l] ?? ""]))}
      sqlSchema={sqlSpec.schema ?? ""}
      sqlSeed={sqlSpec.seed ?? ""}
      sqlOrdered={Boolean(sqlSpec.ordered)}
      starter={isSql ? (languages.sql?.starter ?? "SELECT\n") : (languages.python?.starter ?? "")}
      func={(body.signature as { name?: Record<string, string> })?.name?.python ?? "solve"}
      sampleTests={tests.filter((t) => t.sample)}
      hiddenCount={tests.filter((t) => !t.sample).length}
      entitlements={{ pro: ent.pro, gems: ent.gems,
                      hintsLeft: Number.isFinite(ent.hintsLeft) ? ent.hintsLeft : -1,
                      solutionsLeft: Number.isFinite(ent.solutionsLeft) ? ent.solutionsLeft : -1 }}
    />
  );
}

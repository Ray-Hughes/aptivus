import Link from "next/link";
import { notFound } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { attempts, companies, problems } from "@/db/schema";
import { requireAdminPage } from "@/lib/admin";
import ActionForm from "../../_components/action-form";
import { Badge, Card, JsonBlock, formatDate } from "../../_components/ui";
import { setProblemPublished } from "../../_actions/problems";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-edge/60 py-2 last:border-0">
      <dt className="text-xs uppercase tracking-wide text-faint">{label}</dt>
      <dd className="min-w-0 text-right text-sm">{children}</dd>
    </div>
  );
}

export default async function ProblemDetailPage(props: PageProps<"/admin/problems/[id]">) {
  await requireAdminPage("/admin/problems");
  const { id } = await props.params;

  const [problem] = await db.select().from(problems).where(eq(problems.id, id)).limit(1);
  if (!problem) notFound();

  const [company, [attemptRow]] = await Promise.all([
    problem.companyId
      ? db.select().from(companies).where(eq(companies.id, problem.companyId)).limit(1)
      : Promise.resolve([]),
    db.select({ n: count() }).from(attempts).where(eq(attempts.problemId, problem.id)),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/problems" className="text-xs text-accent2 hover:underline">
          ← All problems
        </Link>
        <h2 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
          <span className="truncate">{problem.title}</span>
          {problem.isPublished ? <Badge tone="good">live</Badge> : <Badge tone="warn">draft</Badge>}
        </h2>
        <p className="font-mono text-sm text-muted">{problem.slug}</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Metadata" className="xl:col-span-1">
          <dl>
            <Row label="ID">
              <code className="font-mono text-xs break-all">{problem.id}</code>
            </Row>
            <Row label="Pack">{problem.pack}</Row>
            <Row label="Company">{company[0]?.name ?? "—"}</Row>
            <Row label="Kind">{problem.kind}</Row>
            <Row label="Difficulty">{problem.difficulty}</Row>
            <Row label="Pattern">{problem.pattern ?? "—"}</Row>
            <Row label="Target minutes">{problem.minutes}</Row>
            <Row label="Source">{problem.source}</Row>
            <Row label="Verified">
              {problem.verifiedAt ? formatDate(problem.verifiedAt) : <Badge tone="warn">no</Badge>}
            </Row>
            <Row label="Created">{formatDate(problem.createdAt)}</Row>
            <Row label="Attempts">{attemptRow?.n ?? 0}</Row>
          </dl>

          <div className="mt-4 border-t border-edge pt-4">
            <ActionForm
              action={setProblemPublished}
              hidden={{
                problemId: problem.id,
                publish: problem.isPublished ? "false" : "true",
              }}
              submitLabel={problem.isPublished ? "Unpublish" : "Publish"}
              variant={problem.isPublished ? "danger" : "primary"}
              footerClassName="flex flex-wrap items-center gap-3"
            />
          </div>
        </Card>

        <Card title="Body (JSON)" className="xl:col-span-2" bodyClassName="p-4">
          <JsonBlock value={problem.body} />
        </Card>
      </div>
    </div>
  );
}

import Link from "next/link";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, problems } from "@/db/schema";
import { requireAdminPage } from "@/lib/admin";
import ActionForm from "../_components/action-form";
import {
  Badge,
  EmptyRow,
  Pagination,
  Table,
  Td,
  Th,
  formatDay,
  selectClass,
} from "../_components/ui";
import { setProblemPublished } from "../_actions/problems";

const PAGE_SIZE = 20;
const DIFFICULTIES = ["easy", "medium", "hard"];
const KINDS = ["python", "sql"];

function difficultyTone(d: string) {
  if (d === "easy") return "good" as const;
  if (d === "hard") return "bad" as const;
  return "warn" as const;
}

export default async function ProblemsPage(props: PageProps<"/admin/problems">) {
  await requireAdminPage("/admin/problems");
  const sp = await props.searchParams;

  const pack = typeof sp.pack === "string" ? sp.pack : "";
  const kind = typeof sp.kind === "string" && KINDS.includes(sp.kind) ? sp.kind : "";
  const difficulty =
    typeof sp.difficulty === "string" && DIFFICULTIES.includes(sp.difficulty)
      ? sp.difficulty
      : "";
  const published = sp.published === "yes" || sp.published === "no" ? sp.published : "";
  const page = Math.max(1, Number.parseInt(String(sp.page ?? "1"), 10) || 1);

  const conditions = [];
  if (pack) conditions.push(eq(problems.pack, pack));
  if (kind) conditions.push(eq(problems.kind, kind));
  if (difficulty) conditions.push(eq(problems.difficulty, difficulty));
  if (published) conditions.push(eq(problems.isPublished, published === "yes"));
  const where = conditions.length ? and(...conditions) : undefined;

  const [packRows, [totalRow], rows] = await Promise.all([
    db.selectDistinct({ pack: problems.pack }).from(problems).orderBy(problems.pack),
    db.select({ n: count() }).from(problems).where(where),
    db
      .select({
        id: problems.id,
        slug: problems.slug,
        title: problems.title,
        pack: problems.pack,
        kind: problems.kind,
        difficulty: problems.difficulty,
        pattern: problems.pattern,
        minutes: problems.minutes,
        source: problems.source,
        isPublished: problems.isPublished,
        verifiedAt: problems.verifiedAt,
        createdAt: problems.createdAt,
        companyName: companies.name,
      })
      .from(problems)
      .leftJoin(companies, eq(problems.companyId, companies.id))
      .where(where)
      .orderBy(problems.pack, desc(problems.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);

  const total = totalRow?.n ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <form
        method="get"
        action="/admin/problems"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-edge bg-surface p-4"
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Pack</span>
          <select name="pack" defaultValue={pack} className={selectClass}>
            <option value="">Any</option>
            {packRows.map((p) => (
              <option key={p.pack} value={p.pack}>
                {p.pack}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Kind</span>
          <select name="kind" defaultValue={kind} className={selectClass}>
            <option value="">Any</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Difficulty</span>
          <select name="difficulty" defaultValue={difficulty} className={selectClass}>
            <option value="">Any</option>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Published</span>
          <select name="published" defaultValue={published} className={selectClass}>
            <option value="">Any</option>
            <option value="yes">Published</option>
            <option value="no">Draft</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-ink transition hover:brightness-110"
        >
          Apply
        </button>
        {(pack || kind || difficulty || published) && (
          <Link
            href="/admin/problems"
            className="rounded-md border border-edge bg-raised px-3.5 py-2 text-sm transition hover:border-accent2"
          >
            Reset
          </Link>
        )}
      </form>

      <div className="overflow-hidden rounded-xl border border-edge bg-surface">
        <Table>
          <thead>
            <tr>
              <Th>Problem</Th>
              <Th>Pack</Th>
              <Th>Kind</Th>
              <Th>Difficulty</Th>
              <Th>Source</Th>
              <Th className="text-right">Added</Th>
              <Th className="text-right">Published</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={7}>
                {total === 0 && !where
                  ? "No problems in the database. Run node scripts/seed-demo.mjs."
                  : "No problems match those filters."}
              </EmptyRow>
            ) : (
              rows.map((p) => (
                <tr key={p.id} className="transition hover:bg-raised/40">
                  <Td>
                    <Link
                      href={`/admin/problems/${p.id}`}
                      className="block hover:text-accent2"
                    >
                      <span className="block truncate font-medium">{p.title}</span>
                      <span className="block truncate font-mono text-xs text-muted">
                        {p.slug}
                      </span>
                    </Link>
                  </Td>
                  <Td>
                    <span className="text-xs">{p.pack}</span>
                    {p.companyName ? (
                      <span className="block text-xs text-faint">{p.companyName}</span>
                    ) : null}
                  </Td>
                  <Td>
                    <Badge tone={p.kind === "sql" ? "info" : "neutral"}>{p.kind}</Badge>
                  </Td>
                  <Td>
                    <Badge tone={difficultyTone(p.difficulty)}>{p.difficulty}</Badge>
                  </Td>
                  <Td className="text-xs text-muted">
                    {p.source}
                    {p.source === "generated" && !p.verifiedAt ? (
                      <span className="block text-warn">unverified</span>
                    ) : null}
                  </Td>
                  <Td className="whitespace-nowrap text-right text-xs text-muted">
                    {formatDay(p.createdAt)}
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {p.isPublished ? (
                        <Badge tone="good">live</Badge>
                      ) : (
                        <Badge tone="warn">draft</Badge>
                      )}
                      <ActionForm
                        action={setProblemPublished}
                        hidden={{
                          problemId: p.id,
                          publish: p.isPublished ? "false" : "true",
                        }}
                        submitLabel={p.isPublished ? "Unpublish" : "Publish"}
                        pendingLabel="…"
                        variant="ghost"
                        footerClassName="flex items-center gap-2"
                      />
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
        <Pagination
          basePath="/admin/problems"
          params={{ pack, kind, difficulty, published }}
          page={page}
          pageCount={pageCount}
          total={total}
          noun="problems"
        />
      </div>
    </div>
  );
}

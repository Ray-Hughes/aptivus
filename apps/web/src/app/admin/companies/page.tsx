import Link from "next/link";
import { asc, count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, problems } from "@/db/schema";
import { requireAdminPage } from "@/lib/admin";
import ActionForm from "../_components/action-form";
import {
  Badge,
  EmptyRow,
  Field,
  Table,
  Td,
  Th,
  formatDay,
  inputClass,
} from "../_components/ui";
import { createCompany, setCompanyPublished } from "../_actions/companies";

export default async function CompaniesPage() {
  await requireAdminPage("/admin/companies");

  const rows = await db
    .select({
      id: companies.id,
      slug: companies.slug,
      name: companies.name,
      industry: companies.industry,
      isPublished: companies.isPublished,
      createdAt: companies.createdAt,
      problemCount: sql<number>`(select count(*) from ${problems} where ${problems.companyId} = ${companies.id})`,
    })
    .from(companies)
    .orderBy(asc(companies.name));

  const [totalRow] = await db.select({ n: count() }).from(companies);

  return (
    <div className="space-y-4">
      <details className="rounded-xl border border-edge bg-surface">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          New company
        </summary>
        <div className="border-t border-edge p-4">
          <ActionForm
            action={createCompany}
            submitLabel="Create company"
            pendingLabel="Creating…"
            className="space-y-3"
          >
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Name">
                <input name="name" required minLength={2} className={inputClass} />
              </Field>
              <Field label="Slug" hint="lowercase, digits and hyphens">
                <input
                  name="slug"
                  required
                  minLength={2}
                  pattern="[a-z0-9\-]+"
                  className={inputClass}
                />
              </Field>
              <Field label="Industry">
                <input name="industry" className={inputClass} />
              </Field>
            </div>
            <Field label="Profile (JSON)" hint="Loop shape, patterns tested, sources. Leave blank for none.">
              <textarea
                name="profile"
                rows={4}
                spellCheck={false}
                placeholder='{"loop": ["phone screen", "onsite"], "patterns": ["hash map"]}'
                className={`${inputClass} font-mono`}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isPublished"
                className="h-4 w-4 accent-[#39c06c]"
              />
              <span>Publish immediately</span>
            </label>
          </ActionForm>
        </div>
      </details>

      <div className="overflow-hidden rounded-xl border border-edge bg-surface">
        <Table>
          <thead>
            <tr>
              <Th>Company</Th>
              <Th>Industry</Th>
              <Th className="text-right">Problems</Th>
              <Th className="text-right">Created</Th>
              <Th className="text-right">Published</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={5}>
                No companies yet. Create one above, or run node scripts/seed-demo.mjs.
              </EmptyRow>
            ) : (
              rows.map((c) => (
                <tr key={c.id} className="transition hover:bg-raised/40">
                  <Td>
                    <Link
                      href={`/admin/companies/${c.id}`}
                      className="block hover:text-accent2"
                    >
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className="block truncate font-mono text-xs text-muted">
                        {c.slug}
                      </span>
                    </Link>
                  </Td>
                  <Td className="text-sm text-muted">{c.industry ?? "—"}</Td>
                  <Td className="text-right tabular-nums text-muted">{c.problemCount}</Td>
                  <Td className="whitespace-nowrap text-right text-xs text-muted">
                    {formatDay(c.createdAt)}
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {c.isPublished ? (
                        <Badge tone="good">live</Badge>
                      ) : (
                        <Badge tone="warn">draft</Badge>
                      )}
                      <ActionForm
                        action={setCompanyPublished}
                        hidden={{
                          companyId: c.id,
                          publish: c.isPublished ? "false" : "true",
                        }}
                        submitLabel={c.isPublished ? "Unpublish" : "Publish"}
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
        <p className="border-t border-edge px-4 py-3 text-xs text-muted">
          {(totalRow?.n ?? 0).toLocaleString()} companies
        </p>
      </div>
    </div>
  );
}

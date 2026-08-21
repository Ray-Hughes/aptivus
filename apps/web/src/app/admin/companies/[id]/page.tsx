import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, problems } from "@/db/schema";
import { requireAdminPage } from "@/lib/admin";
import ActionForm from "../../_components/action-form";
import {
  Badge,
  Card,
  EmptyState,
  Field,
  formatDate,
  inputClass,
} from "../../_components/ui";
import { deleteCompany, updateCompany } from "../../_actions/companies";

export default async function CompanyDetailPage(props: PageProps<"/admin/companies/[id]">) {
  await requireAdminPage("/admin/companies");
  const { id } = await props.params;

  const [company] = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  if (!company) notFound();

  const attached = await db
    .select({ id: problems.id, title: problems.title, slug: problems.slug })
    .from(problems)
    .where(eq(problems.companyId, id))
    .orderBy(problems.title);

  const profileText = company.profile ? JSON.stringify(company.profile, null, 2) : "";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/companies" className="text-xs text-accent2 hover:underline">
          ← All companies
        </Link>
        <h2 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
          <span className="truncate">{company.name}</span>
          {company.isPublished ? (
            <Badge tone="good">live</Badge>
          ) : (
            <Badge tone="warn">draft</Badge>
          )}
        </h2>
        <p className="text-sm text-muted">
          <span className="font-mono">{company.slug}</span> · created{" "}
          {formatDate(company.createdAt)}
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Edit company" className="xl:col-span-2">
          <ActionForm
            action={updateCompany}
            hidden={{ companyId: company.id }}
            submitLabel="Save changes"
            pendingLabel="Saving…"
            className="space-y-3"
          >
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Name">
                <input
                  name="name"
                  required
                  minLength={2}
                  defaultValue={company.name}
                  className={inputClass}
                />
              </Field>
              <Field label="Slug">
                <input
                  name="slug"
                  required
                  minLength={2}
                  pattern="[a-z0-9\-]+"
                  defaultValue={company.slug}
                  className={inputClass}
                />
              </Field>
              <Field label="Industry">
                <input
                  name="industry"
                  defaultValue={company.industry ?? ""}
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Profile (JSON)">
              <textarea
                name="profile"
                rows={12}
                spellCheck={false}
                defaultValue={profileText}
                className={`${inputClass} font-mono`}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isPublished"
                defaultChecked={company.isPublished}
                className="h-4 w-4 accent-[#39c06c]"
              />
              <span>Published</span>
            </label>
          </ActionForm>
        </Card>

        <div className="space-y-6">
          <Card title={`Problems (${attached.length})`}>
            {attached.length === 0 ? (
              <EmptyState
                title="No problems attached"
                description="Nothing in the problems table points at this company yet."
              />
            ) : (
              <ul className="space-y-1.5">
                {attached.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/admin/problems/${p.id}`}
                      className="block truncate rounded-md px-2 py-1.5 text-sm transition hover:bg-raised hover:text-accent2"
                    >
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Danger zone">
            <p className="mb-3 text-sm text-muted">
              Deleting is permanent. It is refused while problems still reference this
              company, so nothing is orphaned.
            </p>
            <ActionForm
              action={deleteCompany}
              hidden={{ companyId: company.id }}
              submitLabel="Delete company"
              variant="danger"
              confirm={`Permanently delete ${company.name}?`}
              footerClassName="flex flex-wrap items-center gap-3"
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

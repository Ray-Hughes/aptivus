import Link from "next/link";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { requireAdminPage } from "@/lib/admin";
import {
  Badge,
  EmptyRow,
  Pagination,
  Table,
  Td,
  Th,
  formatDate,
  selectClass,
} from "../_components/ui";

const PAGE_SIZE = 30;

function actionTone(action: string) {
  if (action.includes("delete") || action.includes("revoke") || action.includes("unpublish")) {
    return "bad" as const;
  }
  if (action.includes("grant") || action.includes("create") || action.includes("publish")) {
    return "good" as const;
  }
  return "info" as const;
}

export default async function AuditPage(props: PageProps<"/admin/audit">) {
  await requireAdminPage("/admin/audit");
  const sp = await props.searchParams;

  const actor = typeof sp.actor === "string" ? sp.actor : "";
  const action = typeof sp.action === "string" ? sp.action : "";
  const page = Math.max(1, Number.parseInt(String(sp.page ?? "1"), 10) || 1);

  const conditions = [];
  if (actor) conditions.push(eq(auditLog.actorUserId, actor));
  if (action) conditions.push(eq(auditLog.action, action));
  const where = conditions.length ? and(...conditions) : undefined;

  const [actorRows, actionRows, [totalRow], rows] = await Promise.all([
    db
      .selectDistinct({ id: auditLog.actorUserId, email: users.email })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorUserId))
      .orderBy(users.email),
    db.selectDistinct({ action: auditLog.action }).from(auditLog).orderBy(auditLog.action),
    db.select({ n: count() }).from(auditLog).where(where),
    db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        targetType: auditLog.targetType,
        targetId: auditLog.targetId,
        meta: auditLog.meta,
        ip: auditLog.ip,
        createdAt: auditLog.createdAt,
        actorUserId: auditLog.actorUserId,
        actorEmail: users.email,
        actorName: users.displayName,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorUserId))
      .where(where)
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);

  const total = totalRow?.n ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <form
        method="get"
        action="/admin/audit"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-edge bg-surface p-4"
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Actor</span>
          <select name="actor" defaultValue={actor} className={selectClass}>
            <option value="">Anyone</option>
            {actorRows
              .filter((a) => a.id)
              .map((a) => (
                <option key={a.id ?? ""} value={a.id ?? ""}>
                  {a.email ?? a.id}
                </option>
              ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Action</span>
          <select name="action" defaultValue={action} className={selectClass}>
            <option value="">Any action</option>
            {actionRows.map((a) => (
              <option key={a.action} value={a.action}>
                {a.action}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-ink transition hover:brightness-110"
        >
          Filter
        </button>
        {(actor || action) && (
          <Link
            href="/admin/audit"
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
              <Th>When</Th>
              <Th>Actor</Th>
              <Th>Action</Th>
              <Th>Target</Th>
              <Th>Detail</Th>
              <Th className="text-right">IP</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={6}>
                {actor || action
                  ? "No audit entries match those filters."
                  : "Nothing has been written to the audit log yet. Perform an admin action and it will appear here."}
              </EmptyRow>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="align-top transition hover:bg-raised/40">
                  <Td className="whitespace-nowrap text-xs text-muted">
                    {formatDate(row.createdAt)}
                  </Td>
                  <Td>
                    {row.actorUserId ? (
                      <Link
                        href={`/admin/users/${row.actorUserId}`}
                        className="block truncate text-sm hover:text-accent2"
                      >
                        {row.actorName ?? row.actorEmail ?? row.actorUserId}
                      </Link>
                    ) : (
                      <span className="text-sm text-muted">system</span>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={actionTone(row.action)}>{row.action}</Badge>
                  </Td>
                  <Td className="text-xs text-muted">
                    {row.targetType ? (
                      <>
                        <span className="block">{row.targetType}</span>
                        {row.targetType === "user" && row.targetId ? (
                          <Link
                            href={`/admin/users/${row.targetId}`}
                            className="block max-w-40 truncate font-mono hover:text-accent2"
                          >
                            {row.targetId}
                          </Link>
                        ) : (
                          <span className="block max-w-40 truncate font-mono">
                            {row.targetId ?? "—"}
                          </span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    {row.meta ? (
                      <details className="max-w-80">
                        <summary className="cursor-pointer text-xs text-accent2">
                          meta
                        </summary>
                        <pre className="mt-1 overflow-x-auto rounded border border-edge bg-ink p-2 font-mono text-[11px] leading-relaxed">
                          {JSON.stringify(row.meta, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-xs text-faint">—</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-right font-mono text-xs text-muted">
                    {row.ip ?? "—"}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
        <Pagination
          basePath="/admin/audit"
          params={{ actor, action }}
          page={page}
          pageCount={pageCount}
          total={total}
          noun="entries"
        />
      </div>
    </div>
  );
}

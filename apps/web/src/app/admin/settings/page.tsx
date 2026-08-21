import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { requireAdminPage } from "@/lib/admin";
import { Badge, Card, EmptyRow, Table, Td, Th, formatDate } from "../_components/ui";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-edge/60 py-2 last:border-0">
      <dt className="text-xs uppercase tracking-wide text-faint">{label}</dt>
      <dd className="min-w-0 text-right text-sm">{children}</dd>
    </div>
  );
}

export default async function AdminSettingsPage() {
  const admin = await requireAdminPage("/admin/settings");

  const [me] = await db.select().from(users).where(eq(users.id, admin.id)).limit(1);
  const recent = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      createdAt: auditLog.createdAt,
      ip: auditLog.ip,
    })
    .from(auditLog)
    .where(eq(auditLog.actorUserId, admin.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(15);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Your account">
          <dl>
            <Row label="Display name">{me?.displayName ?? "—"}</Row>
            <Row label="Email">{me?.email ?? admin.email}</Row>
            <Row label="Role">
              <Badge tone="info">{me?.role ?? admin.role}</Badge>
            </Row>
            <Row label="User ID">
              <code className="font-mono text-xs break-all">{admin.id}</code>
            </Row>
            <Row label="Timezone">{me?.timezone ?? "UTC"}</Row>
            <Row label="Gem balance">{me?.gemBalance ?? 0}</Row>
            <Row label="Joined">{formatDate(me?.createdAt)}</Row>
          </dl>
        </Card>

        <Card title="How admin access works">
          <ul className="space-y-3 text-sm text-muted">
            <li>
              There is no admin signup route. The role is set by{" "}
              <code className="font-mono text-fg">node scripts/seed.mjs</code> or by another
              admin on the Users page, and every promotion is written to the audit log.
            </li>
            <li>
              Each admin page calls <code className="font-mono text-fg">requireAdminPage()</code>{" "}
              and every mutation calls{" "}
              <code className="font-mono text-fg">requireAdminApi()</code>. Hiding a button
              is not a permission check, so nothing here relies on it.
            </li>
            <li>
              You cannot revoke your own admin role or delete your own account from this
              panel. Both are how an operator locks themselves out of the only screen that
              can undo it.
            </li>
            <li>
              Profile editing, password change and data export are user-facing settings and
              live outside the admin panel; they are not built yet.
            </li>
          </ul>
        </Card>
      </div>

      <Card title="Your recent admin actions" bodyClassName="">
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Action</Th>
              <Th>Target</Th>
              <Th className="text-right">IP</Th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 ? (
              <EmptyRow colSpan={4}>You have not made any changes yet.</EmptyRow>
            ) : (
              recent.map((row) => (
                <tr key={row.id}>
                  <Td className="whitespace-nowrap text-xs text-muted">
                    {formatDate(row.createdAt)}
                  </Td>
                  <Td>
                    <Badge tone="info">{row.action}</Badge>
                  </Td>
                  <Td className="text-xs text-muted">
                    {row.targetType ?? "—"}
                    {row.targetId ? (
                      <span className="ml-1 font-mono">{row.targetId.slice(0, 8)}…</span>
                    ) : null}
                  </Td>
                  <Td className="whitespace-nowrap text-right font-mono text-xs text-muted">
                    {row.ip ?? "—"}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

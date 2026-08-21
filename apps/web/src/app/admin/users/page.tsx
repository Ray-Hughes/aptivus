import Link from "next/link";
import { and, count, desc, eq, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { attempts, subscriptions, users } from "@/db/schema";
import { requireAdminPage } from "@/lib/admin";
import {
  Badge,
  EmptyRow,
  Pagination,
  Table,
  Td,
  Th,
  formatDay,
  inputClass,
  selectClass,
} from "../_components/ui";

const PAGE_SIZE = 20;

export default async function UsersPage(props: PageProps<"/admin/users">) {
  await requireAdminPage("/admin/users");
  const sp = await props.searchParams;

  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const role = sp.role === "admin" || sp.role === "user" ? sp.role : "";
  const status = sp.status === "deleted" ? "deleted" : "active";
  const page = Math.max(1, Number.parseInt(String(sp.page ?? "1"), 10) || 1);

  const conditions = [];
  if (q) {
    const needle = `%${q.toLowerCase()}%`;
    conditions.push(
      or(
        like(sql`lower(${users.email})`, needle),
        like(sql`lower(coalesce(${users.displayName}, ''))`, needle),
      ),
    );
  }
  if (role) conditions.push(eq(users.role, role));
  conditions.push(status === "deleted" ? isNotNull(users.deletedAt) : isNull(users.deletedAt));

  const where = and(...conditions);

  const [[totalRow], rows] = await Promise.all([
    db.select({ n: count() }).from(users).where(where),
    db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        gemBalance: users.gemBalance,
        createdAt: users.createdAt,
        deletedAt: users.deletedAt,
        plan: subscriptions.plan,
        subStatus: subscriptions.status,
        attemptCount: sql<number>`(select count(*) from ${attempts} where ${attempts.userId} = ${users.id})`,
      })
      .from(users)
      .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);

  const total = totalRow?.n ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <form
        method="get"
        action="/admin/users"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-edge bg-surface p-4"
      >
        <label className="flex min-w-56 flex-1 flex-col gap-1.5 text-sm">
          <span className="text-muted">Search</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="email or display name"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Role</span>
          <select name="role" defaultValue={role} className={selectClass}>
            <option value="">Any</option>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Status</span>
          <select name="status" defaultValue={status} className={selectClass}>
            <option value="active">Active</option>
            <option value="deleted">Deleted</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-ink transition hover:brightness-110"
        >
          Apply
        </button>
        {(q || role || status === "deleted") && (
          <Link
            href="/admin/users"
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
              <Th>User</Th>
              <Th>Role</Th>
              <Th>Plan</Th>
              <Th className="text-right">Gems</Th>
              <Th className="text-right">Attempts</Th>
              <Th className="text-right">Joined</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={6}>
                {q || role || status === "deleted"
                  ? "No users match those filters."
                  : "No users yet. Run node scripts/seed-demo.mjs to populate the panel."}
              </EmptyRow>
            ) : (
              rows.map((u) => (
                <tr key={u.id} className="transition hover:bg-raised/40">
                  <Td>
                    <Link href={`/admin/users/${u.id}`} className="block hover:text-accent2">
                      <span className="flex items-center gap-2 font-medium">
                        <span className="truncate">{u.displayName ?? "—"}</span>
                        {u.deletedAt ? <Badge tone="bad">deleted</Badge> : null}
                      </span>
                      <span className="block truncate text-xs text-muted">{u.email}</span>
                    </Link>
                  </Td>
                  <Td>
                    {u.role === "admin" ? <Badge tone="info">admin</Badge> : <Badge>user</Badge>}
                  </Td>
                  <Td>
                    {u.subStatus === "active" || u.subStatus === "trialing" ? (
                      <Badge tone="good">{u.plan ?? "pro"}</Badge>
                    ) : (
                      <Badge>free</Badge>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{u.gemBalance}</Td>
                  <Td className="text-right tabular-nums text-muted">{u.attemptCount}</Td>
                  <Td className="whitespace-nowrap text-right text-xs text-muted">
                    {formatDay(u.createdAt)}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
        <Pagination
          basePath="/admin/users"
          params={{ q, role, status }}
          page={page}
          pageCount={pageCount}
          total={total}
          noun="users"
        />
      </div>
    </div>
  );
}

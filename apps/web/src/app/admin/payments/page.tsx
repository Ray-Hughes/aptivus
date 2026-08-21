import Link from "next/link";
import { count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { gemLedger, subscriptions, users } from "@/db/schema";
import { requireAdminPage } from "@/lib/admin";
import { FLAGS, isEnabled } from "@/lib/flags";
import {
  Badge,
  Card,
  EmptyRow,
  Notice,
  Pagination,
  StatCard,
  Table,
  Td,
  Th,
  formatDate,
  formatDay,
} from "../_components/ui";

const PAGE_SIZE = 25;

type LedgerRow = {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  delta: number;
  kind: string;
  reason: string;
  created_at: number;
  running: number;
};

export default async function PaymentsPage(props: PageProps<"/admin/payments">) {
  const admin = await requireAdminPage("/admin/payments");
  const sp = await props.searchParams;
  const page = Math.max(1, Number.parseInt(String(sp.page ?? "1"), 10) || 1);

  const [billingOn, subs, [ledgerTotal], ledgerRows, [activeCount], [gemsOutstanding]] =
    await Promise.all([
      isEnabled(FLAGS.billing, admin.id),
      db
        .select({
          userId: subscriptions.userId,
          plan: subscriptions.plan,
          status: subscriptions.status,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
          updatedAt: subscriptions.updatedAt,
          stripeCustomerId: subscriptions.stripeCustomerId,
          email: users.email,
          displayName: users.displayName,
        })
        .from(subscriptions)
        .leftJoin(users, eq(users.id, subscriptions.userId))
        .orderBy(desc(subscriptions.updatedAt))
        .limit(50),
      db.select({ n: count() }).from(gemLedger),
      db.all<LedgerRow>(sql`
        select l.id            as id,
               l.user_id       as user_id,
               u.email         as email,
               u.display_name  as display_name,
               l.delta         as delta,
               l.kind          as kind,
               l.reason        as reason,
               l.created_at    as created_at,
               sum(l.delta) over (
                 partition by l.user_id
                 order by l.created_at, l.id
               ) as running
        from ${gemLedger} l
        left join ${users} u on u.id = l.user_id
        order by l.created_at desc, l.id desc
        limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}
      `),
      db
        .select({ n: count() })
        .from(subscriptions)
        .where(inArray(subscriptions.status, ["active", "trialing"])),
      db.select({ n: sql<number>`coalesce(sum(${users.gemBalance}), 0)` }).from(users),
    ]);

  const total = ledgerTotal?.n ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <Notice tone="warn">
        Read-only. Billing is behind the <code className="font-mono">billing</code> feature
        flag (currently {billingOn ? "on for you" : "off"}) and Stripe is not wired up yet,
        so nothing here charges or refunds anyone.
      </Notice>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Active subscriptions"
          value={activeCount?.n ?? 0}
          hint="active or trialing"
          tone="accent"
        />
        <StatCard
          label="Subscription rows"
          value={subs.length}
          hint="most recent 50 shown"
          tone="muted"
        />
        <StatCard
          label="Gems outstanding"
          value={(gemsOutstanding?.n ?? 0).toLocaleString()}
          hint="sum of cached balances"
          tone="brand"
        />
      </div>

      <Card title="Subscriptions" bodyClassName="">
        <Table>
          <thead>
            <tr>
              <Th>User</Th>
              <Th>Plan</Th>
              <Th>Status</Th>
              <Th>Stripe customer</Th>
              <Th className="text-right">Period ends</Th>
              <Th className="text-right">Updated</Th>
            </tr>
          </thead>
          <tbody>
            {subs.length === 0 ? (
              <EmptyRow colSpan={6}>
                No subscription rows. Everyone is on the free tier.
              </EmptyRow>
            ) : (
              subs.map((s) => (
                <tr key={s.userId} className="transition hover:bg-raised/40">
                  <Td>
                    <Link
                      href={`/admin/users/${s.userId}`}
                      className="block hover:text-accent2"
                    >
                      <span className="block truncate">{s.displayName ?? "—"}</span>
                      <span className="block truncate text-xs text-muted">{s.email}</span>
                    </Link>
                  </Td>
                  <Td>{s.plan}</Td>
                  <Td>
                    {s.status === "active" || s.status === "trialing" ? (
                      <Badge tone="good">{s.status}</Badge>
                    ) : s.status === "past_due" || s.status === "canceled" ? (
                      <Badge tone="bad">{s.status}</Badge>
                    ) : (
                      <Badge>{s.status}</Badge>
                    )}
                  </Td>
                  <Td>
                    <code className="font-mono text-xs text-muted">
                      {s.stripeCustomerId ?? "—"}
                    </code>
                  </Td>
                  <Td className="whitespace-nowrap text-right text-xs text-muted">
                    {formatDay(s.currentPeriodEnd)}
                  </Td>
                  <Td className="whitespace-nowrap text-right text-xs text-muted">
                    {formatDay(s.updatedAt)}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      <Card title="Gem ledger" bodyClassName="">
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>User</Th>
              <Th>Kind</Th>
              <Th>Reason</Th>
              <Th className="text-right">Delta</Th>
              <Th className="text-right">Running balance</Th>
            </tr>
          </thead>
          <tbody>
            {ledgerRows.length === 0 ? (
              <EmptyRow colSpan={6}>
                The gem ledger is empty. Nothing has been earned, spent or granted.
              </EmptyRow>
            ) : (
              ledgerRows.map((row) => (
                <tr key={row.id} className="transition hover:bg-raised/40">
                  <Td className="whitespace-nowrap text-xs text-muted">
                    {formatDate(row.created_at)}
                  </Td>
                  <Td>
                    <Link
                      href={`/admin/users/${row.user_id}`}
                      className="block truncate text-sm hover:text-accent2"
                    >
                      {row.display_name ?? row.email ?? row.user_id}
                    </Link>
                  </Td>
                  <Td>
                    <Badge tone={row.delta >= 0 ? "good" : "warn"}>{row.kind}</Badge>
                  </Td>
                  <Td className="max-w-64 truncate text-xs text-muted">{row.reason}</Td>
                  <Td
                    className={`text-right font-medium tabular-nums ${
                      row.delta >= 0 ? "text-accent" : "text-danger"
                    }`}
                  >
                    {row.delta > 0 ? `+${row.delta}` : row.delta}
                  </Td>
                  <Td className="text-right tabular-nums">{row.running}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
        <Pagination
          basePath="/admin/payments"
          params={{}}
          page={page}
          pageCount={pageCount}
          total={total}
          noun="ledger rows"
        />
      </Card>
    </div>
  );
}

import Link from "next/link";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { attempts, problems, subscriptions, users } from "@/db/schema";
import { requireAdminPage } from "@/lib/admin";
import {
  Badge,
  Card,
  EmptyRow,
  StatCard,
  Table,
  Td,
  Th,
  relativeTime,
} from "./_components/ui";

export default async function DashboardPage() {
  await requireAdminPage("/admin");

  const [
    [userCount],
    [problemCount],
    [attemptCount],
    [activeSubCount],
    [publishedProblems],
    recentSignups,
    recentAttempts,
  ] = await Promise.all([
    db.select({ n: count() }).from(users).where(isNull(users.deletedAt)),
    db.select({ n: count() }).from(problems),
    db.select({ n: count() }).from(attempts),
    db
      .select({ n: count() })
      .from(subscriptions)
      .where(inArray(subscriptions.status, ["active", "trialing"])),
    db.select({ n: count() }).from(problems).where(eq(problems.isPublished, true)),
    db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        gemBalance: users.gemBalance,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(isNull(users.deletedAt))
      .orderBy(desc(users.createdAt))
      .limit(8),
    db
      .select({
        id: attempts.id,
        status: attempts.status,
        language: attempts.language,
        testsPassed: attempts.testsPassed,
        testsTotal: attempts.testsTotal,
        createdAt: attempts.createdAt,
        userId: attempts.userId,
        userEmail: users.email,
        userName: users.displayName,
        problemTitle: problems.title,
      })
      .from(attempts)
      .leftJoin(users, eq(attempts.userId, users.id))
      .leftJoin(problems, eq(attempts.problemId, problems.id))
      .orderBy(desc(attempts.createdAt))
      .limit(8),
  ]);

  // The cutoff is computed by SQLite, not by the render: a component must not
  // read the clock, and the database already has one.
  const [weekly] = await db
    .select({ n: count() })
    .from(users)
    .where(
      and(isNull(users.deletedAt), sql`${users.createdAt} >= unixepoch() - 604800`),
    );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Users"
          value={(userCount?.n ?? 0).toLocaleString()}
          hint={`${weekly?.n ?? 0} joined in the last 7 days`}
          tone="brand"
        />
        <StatCard
          label="Problems"
          value={(problemCount?.n ?? 0).toLocaleString()}
          hint={`${publishedProblems?.n ?? 0} published`}
          tone="accent2"
        />
        <StatCard
          label="Attempts"
          value={(attemptCount?.n ?? 0).toLocaleString()}
          hint="one row per submission"
          tone="accent"
        />
        <StatCard
          label="Active subscriptions"
          value={(activeSubCount?.n ?? 0).toLocaleString()}
          hint="status active or trialing"
          tone="muted"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          title="Recent signups"
          bodyClassName=""
          action={
            <Link href="/admin/users" className="text-xs text-accent2 hover:underline">
              All users
            </Link>
          }
        >
          <Table>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th className="text-right">Gems</Th>
                <Th className="text-right">Joined</Th>
              </tr>
            </thead>
            <tbody>
              {recentSignups.length === 0 ? (
                <EmptyRow colSpan={4}>
                  No users yet. Run <code className="font-mono">node scripts/seed-demo.mjs</code>{" "}
                  to populate the panel.
                </EmptyRow>
              ) : (
                recentSignups.map((u) => (
                  <tr key={u.id} className="transition hover:bg-raised/40">
                    <Td className="max-w-56">
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="block min-w-0 hover:text-accent2"
                      >
                        <span className="block truncate font-medium">
                          {u.displayName ?? "—"}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {u.email}
                        </span>
                      </Link>
                    </Td>
                    <Td>
                      {u.role === "admin" ? (
                        <Badge tone="info">admin</Badge>
                      ) : (
                        <Badge>user</Badge>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">{u.gemBalance}</Td>
                    <Td className="whitespace-nowrap text-right text-xs text-muted">
                      {relativeTime(u.createdAt)}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>

        <Card title="Recent attempts" bodyClassName="">
          <Table>
            <thead>
              <tr>
                <Th>Problem</Th>
                <Th>User</Th>
                <Th>Result</Th>
                <Th className="text-right">When</Th>
              </tr>
            </thead>
            <tbody>
              {recentAttempts.length === 0 ? (
                <EmptyRow colSpan={4}>No attempts recorded yet.</EmptyRow>
              ) : (
                recentAttempts.map((a) => (
                  <tr key={a.id} className="transition hover:bg-raised/40">
                    <Td className="max-w-56">
                      <span className="block truncate font-medium">
                        {a.problemTitle ?? "(deleted problem)"}
                      </span>
                      <span className="text-xs text-muted">{a.language}</span>
                    </Td>
                    <Td className="max-w-32">
                      <Link
                        href={`/admin/users/${a.userId}`}
                        className="block truncate text-xs text-muted hover:text-accent2"
                      >
                        {a.userName ?? a.userEmail ?? a.userId}
                      </Link>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        {a.status === "solved" ? (
                          <Badge tone="good">solved</Badge>
                        ) : (
                          <Badge tone="warn">tried</Badge>
                        )}
                        <span className="text-xs tabular-nums text-muted">
                          {a.testsPassed}/{a.testsTotal}
                        </span>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-right text-xs text-muted">
                      {relativeTime(a.createdAt)}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

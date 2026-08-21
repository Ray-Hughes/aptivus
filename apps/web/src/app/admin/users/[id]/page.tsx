import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  achievements,
  attempts,
  dailyUsage,
  gemLedger,
  problems,
  profiles,
  subscriptions,
  userAchievements,
  users,
} from "@/db/schema";
import { requireAdminPage } from "@/lib/admin";
import ActionForm from "../../_components/action-form";
import {
  Badge,
  Card,
  EmptyRow,
  Field,
  Table,
  Td,
  Th,
  formatDate,
  formatDay,
  inputClass,
} from "../../_components/ui";
import { grantGems, restoreUser, setUserRole, softDeleteUser } from "../../_actions/users";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-edge/60 py-2 last:border-0">
      <dt className="text-xs uppercase tracking-wide text-faint">{label}</dt>
      <dd className="min-w-0 text-right text-sm">{children}</dd>
    </div>
  );
}

export default async function UserDetailPage(props: PageProps<"/admin/users/[id]">) {
  const admin = await requireAdminPage("/admin/users");
  const { id } = await props.params;

  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) notFound();

  const [profile, subscription, ledger, userAttempts, badges, usage] = await Promise.all([
    db.select().from(profiles).where(eq(profiles.userId, id)).limit(1),
    db.select().from(subscriptions).where(eq(subscriptions.userId, id)).limit(1),
    db
      .select()
      .from(gemLedger)
      .where(eq(gemLedger.userId, id))
      .orderBy(desc(gemLedger.createdAt))
      .limit(15),
    db
      .select({
        id: attempts.id,
        status: attempts.status,
        language: attempts.language,
        testsPassed: attempts.testsPassed,
        testsTotal: attempts.testsTotal,
        hintLevelUsed: attempts.hintLevelUsed,
        solutionRevealed: attempts.solutionRevealed,
        createdAt: attempts.createdAt,
        problemTitle: problems.title,
        problemId: attempts.problemId,
      })
      .from(attempts)
      .leftJoin(problems, eq(attempts.problemId, problems.id))
      .where(eq(attempts.userId, id))
      .orderBy(desc(attempts.createdAt))
      .limit(15),
    db
      .select({
        name: achievements.name,
        icon: achievements.icon,
        tier: achievements.tier,
        progress: userAchievements.progress,
        earnedAt: userAchievements.earnedAt,
      })
      .from(userAchievements)
      .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
      .where(eq(userAchievements.userId, id))
      .orderBy(desc(userAchievements.earnedAt)),
    db
      .select()
      .from(dailyUsage)
      .where(eq(dailyUsage.userId, id))
      .orderBy(desc(dailyUsage.dayUtc))
      .limit(1),
  ]);

  const sub = subscription[0];
  const prof = profile[0];
  const today = usage[0];
  const isSelf = user.id === admin.id;
  const isPro = sub?.status === "active" || sub?.status === "trialing";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/admin/users" className="text-xs text-accent2 hover:underline">
            ← All users
          </Link>
          <h2 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
            <span className="truncate">{user.displayName ?? user.email}</span>
            {user.role === "admin" ? <Badge tone="info">admin</Badge> : null}
            {user.deletedAt ? <Badge tone="bad">deleted</Badge> : null}
            {isPro ? <Badge tone="good">{sub?.plan}</Badge> : <Badge>free</Badge>}
          </h2>
          <p className="truncate text-sm text-muted">{user.email}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Profile">
          <dl>
            <Row label="User ID">
              <code className="font-mono text-xs break-all">{user.id}</code>
            </Row>
            <Row label="Display name">{user.displayName ?? "—"}</Row>
            <Row label="Email verified">
              {user.emailVerifiedAt ? formatDay(user.emailVerifiedAt) : <Badge tone="warn">no</Badge>}
            </Row>
            <Row label="Password set">
              {user.passwordHash ? "yes" : <span className="text-muted">passwordless</span>}
            </Row>
            <Row label="Timezone">{user.timezone}</Row>
            <Row label="Joined">{formatDate(user.createdAt)}</Row>
            <Row label="Last seen">{formatDate(user.lastSeenAt)}</Row>
            <Row label="Target company">{prof?.targetCompany ?? "—"}</Row>
            <Row label="Target role">{prof?.targetRole ?? "—"}</Row>
            <Row label="Experience">{prof?.experienceLevel ?? "—"}</Row>
            <Row label="Language">{prof?.primaryLanguage ?? "—"}</Row>
            <Row label="Interview date">{formatDay(prof?.interviewDate)}</Row>
          </dl>
        </Card>

        <Card title="Plan and allowance">
          <dl>
            <Row label="Plan">{sub?.plan ?? "free"}</Row>
            <Row label="Status">
              {sub ? (
                isPro ? (
                  <Badge tone="good">{sub.status}</Badge>
                ) : (
                  <Badge>{sub.status}</Badge>
                )
              ) : (
                <Badge>none</Badge>
              )}
            </Row>
            <Row label="Renews">{formatDay(sub?.currentPeriodEnd)}</Row>
            <Row label="Stripe customer">
              <code className="font-mono text-xs">{sub?.stripeCustomerId ?? "—"}</code>
            </Row>
            <Row label="Gem balance">
              <span className="text-lg font-semibold tabular-nums text-accent">
                {user.gemBalance}
              </span>
            </Row>
            <Row label="Hints today">{today ? today.hintsUsed : 0}</Row>
            <Row label="Solutions today">{today ? today.solutionsUsed : 0}</Row>
            <Row label="Generations today">{today ? today.generationsUsed : 0}</Row>
          </dl>
        </Card>

        <Card title="Actions">
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-faint">Admin role</p>
              {isSelf ? (
                <p className="text-sm text-muted">
                  This is your own account. Demoting yourself from here would lock you out
                  of the only screen that can put you back, so it is refused.
                </p>
              ) : (
                <ActionForm
                  action={setUserRole}
                  hidden={{ userId: user.id, role: user.role === "admin" ? "user" : "admin" }}
                  submitLabel={user.role === "admin" ? "Revoke admin" : "Grant admin"}
                  variant={user.role === "admin" ? "danger" : "primary"}
                  confirm={
                    user.role === "admin"
                      ? `Revoke admin from ${user.email}?`
                      : `Grant admin to ${user.email}? They will get the full panel.`
                  }
                  footerClassName="flex flex-wrap items-center gap-3"
                />
              )}
            </div>

            <div className="border-t border-edge pt-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-faint">Grant gems</p>
              <ActionForm
                action={grantGems}
                hidden={{ userId: user.id }}
                submitLabel="Apply"
                pendingLabel="Applying…"
                className="space-y-3"
              >
                <Field label="Amount" hint="Negative removes gems. Writes a ledger row either way.">
                  <input
                    name="amount"
                    type="number"
                    step="1"
                    defaultValue={10}
                    required
                    className={inputClass}
                  />
                </Field>
                <Field label="Reason">
                  <input
                    name="reason"
                    type="text"
                    required
                    minLength={3}
                    maxLength={200}
                    placeholder="support goodwill"
                    className={inputClass}
                  />
                </Field>
              </ActionForm>
            </div>

            <div className="border-t border-edge pt-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-faint">Account</p>
              {isSelf ? (
                <p className="text-sm text-muted">You cannot delete your own account here.</p>
              ) : user.deletedAt ? (
                <ActionForm
                  action={restoreUser}
                  hidden={{ userId: user.id }}
                  submitLabel="Restore user"
                  variant="ghost"
                  footerClassName="flex flex-wrap items-center gap-3"
                />
              ) : (
                <ActionForm
                  action={softDeleteUser}
                  hidden={{ userId: user.id }}
                  submitLabel="Soft-delete user"
                  variant="danger"
                  confirm={`Soft-delete ${user.email}? Their history is kept and sign-in is refused.`}
                  footerClassName="flex flex-wrap items-center gap-3"
                />
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Gem ledger" bodyClassName="">
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Kind</Th>
                <Th>Reason</Th>
                <Th className="text-right">Delta</Th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 ? (
                <EmptyRow colSpan={4}>No gem movements for this user.</EmptyRow>
              ) : (
                ledger.map((row) => (
                  <tr key={row.id}>
                    <Td className="whitespace-nowrap text-xs text-muted">
                      {formatDate(row.createdAt)}
                    </Td>
                    <Td>
                      <Badge tone={row.delta >= 0 ? "good" : "warn"}>{row.kind}</Badge>
                    </Td>
                    <Td className="max-w-48 truncate text-xs text-muted">{row.reason}</Td>
                    <Td
                      className={`text-right font-medium tabular-nums ${
                        row.delta >= 0 ? "text-accent" : "text-danger"
                      }`}
                    >
                      {row.delta > 0 ? `+${row.delta}` : row.delta}
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
                <Th>Result</Th>
                <Th>Aids</Th>
                <Th className="text-right">When</Th>
              </tr>
            </thead>
            <tbody>
              {userAttempts.length === 0 ? (
                <EmptyRow colSpan={4}>This user has not attempted anything yet.</EmptyRow>
              ) : (
                userAttempts.map((a) => (
                  <tr key={a.id}>
                    <Td>
                      <span className="block truncate">{a.problemTitle ?? a.problemId}</span>
                      <span className="text-xs text-muted">{a.language}</span>
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
                    <Td className="text-xs text-muted">
                      {a.hintLevelUsed > 0 ? `hint L${a.hintLevelUsed}` : "no hint"}
                      {a.solutionRevealed ? " · solution" : ""}
                    </Td>
                    <Td className="whitespace-nowrap text-right text-xs text-muted">
                      {formatDay(a.createdAt)}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card>
      </div>

      <Card title="Achievements">
        {badges.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            No achievements unlocked or in progress.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {badges.map((b) => (
              <li
                key={b.name}
                className="flex items-center gap-3 rounded-lg border border-edge bg-raised px-3 py-2.5"
              >
                <span aria-hidden="true" className="text-xl">
                  {b.icon ?? "🏅"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{b.name}</p>
                  <p className="text-xs text-muted">
                    {b.earnedAt
                      ? `earned ${formatDay(b.earnedAt)}`
                      : `${Math.round(b.progress * 100)}% complete`}
                  </p>
                </div>
                <Badge tone={b.earnedAt ? "good" : "neutral"}>{b.tier}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

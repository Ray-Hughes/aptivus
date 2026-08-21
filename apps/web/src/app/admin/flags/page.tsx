import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { featureFlags, users } from "@/db/schema";
import { requireAdminPage } from "@/lib/admin";
import ActionForm from "../_components/action-form";
import AllowListEditor from "../_components/allow-list-editor";
import { Badge, EmptyState, Notice, formatDate, inputClass } from "../_components/ui";
import { removeFlagAllowUser, updateFlag } from "../_actions/flags";

export default async function FlagsPage() {
  await requireAdminPage("/admin/flags");

  const flags = await db.select().from(featureFlags).orderBy(asc(featureFlags.key));

  const allowedIds = [...new Set(flags.flatMap((f) => f.allowUserIds ?? []))];
  const allowedUsers = allowedIds.length
    ? await db
        .select({ id: users.id, email: users.email, displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, allowedIds))
    : [];
  const byId = new Map(allowedUsers.map((u) => [u.id, u]));

  return (
    <div className="space-y-6">
      <Notice>
        Every flag defaults off and an unknown key is off, so a typo hides a feature rather
        than exposing one. The allow list is evaluated before the percentage; the
        percentage itself is a deterministic hash of{" "}
        <code className="font-mono">key:userId</code>, so a user never flickers between
        loads. Saving here calls <code className="font-mono">invalidateFlagCache()</code>.
      </Notice>

      {flags.length === 0 ? (
        <EmptyState
          title="No feature flags"
          description="Run node scripts/seed.mjs to create the seven product flags."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {flags.map((flag) => {
            const allowIds = flag.allowUserIds ?? [];
            return (
              <section
                key={flag.key}
                className="overflow-hidden rounded-xl border border-edge bg-surface"
              >
                <header className="flex items-start justify-between gap-3 border-b border-edge px-4 py-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-mono text-sm font-semibold">{flag.key}</h2>
                    <p className="mt-0.5 text-xs text-muted">{flag.description}</p>
                  </div>
                  {flag.enabled ? (
                    <Badge tone="good">on</Badge>
                  ) : (
                    <Badge tone="bad">off</Badge>
                  )}
                </header>

                <div className="space-y-4 p-4">
                  <ActionForm
                    action={updateFlag}
                    hidden={{ key: flag.key }}
                    submitLabel="Save"
                    pendingLabel="Saving…"
                    className="space-y-3"
                    footerClassName="flex flex-wrap items-center gap-3"
                  >
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="enabled"
                        defaultChecked={flag.enabled}
                        className="h-4 w-4 accent-[#39c06c]"
                      />
                      <span>Enabled</span>
                    </label>

                    <label className="flex items-center gap-3 text-sm">
                      <span className="w-28 text-muted">Rollout %</span>
                      <input
                        type="number"
                        name="rolloutPercent"
                        min={0}
                        max={100}
                        step={1}
                        defaultValue={flag.rolloutPercent}
                        className={`${inputClass} w-24`}
                      />
                    </label>
                  </ActionForm>

                  <div className="border-t border-edge pt-4">
                    <p className="mb-2 text-xs uppercase tracking-wide text-faint">
                      Allow list ({allowIds.length})
                    </p>

                    {allowIds.length === 0 ? (
                      <p className="mb-3 text-sm text-muted">
                        Nobody is explicitly allowed. The percentage rollout decides.
                      </p>
                    ) : (
                      <ul className="mb-3 divide-y divide-edge overflow-hidden rounded-md border border-edge">
                        {allowIds.map((id) => {
                          const user = byId.get(id);
                          return (
                            <li
                              key={id}
                              className="flex items-center justify-between gap-3 px-3 py-2"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm">
                                  {user?.displayName ?? "—"}
                                </span>
                                <span className="block truncate text-xs text-muted">
                                  {user?.email ?? `${id} (no such user)`}
                                </span>
                              </span>
                              <ActionForm
                                action={removeFlagAllowUser}
                                hidden={{ key: flag.key, userId: id }}
                                submitLabel="Remove"
                                pendingLabel="…"
                                variant="ghost"
                                footerClassName="flex items-center"
                              />
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <AllowListEditor flagKey={flag.key} />
                  </div>

                  <p className="border-t border-edge pt-3 text-xs text-faint">
                    Updated {formatDate(flag.updatedAt)}
                  </p>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

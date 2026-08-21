import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { achievements, userAchievements } from "@/db/schema";
import { requireAdminPage } from "@/lib/admin";
import ActionForm from "../_components/action-form";
import {
  Badge,
  EmptyState,
  Field,
  JsonBlock,
  inputClass,
  selectClass,
} from "../_components/ui";
import { TIERS } from "../_components/constants";
import { updateAchievement } from "../_actions/achievements";

function tierTone(tier: string) {
  if (tier === "gold" || tier === "platinum") return "warn" as const;
  if (tier === "silver") return "info" as const;
  return "neutral" as const;
}

export default async function AchievementsPage() {
  await requireAdminPage("/admin/achievements");

  const rows = await db
    .select({
      id: achievements.id,
      slug: achievements.slug,
      name: achievements.name,
      description: achievements.description,
      icon: achievements.icon,
      tier: achievements.tier,
      gemReward: achievements.gemReward,
      rule: achievements.rule,
      earnedCount: sql<number>`(
        select count(*) from ${userAchievements}
        where ${userAchievements.achievementId} = ${achievements.id}
          and ${userAchievements.earnedAt} is not null
      )`,
      inProgressCount: sql<number>`(
        select count(*) from ${userAchievements}
        where ${userAchievements.achievementId} = ${achievements.id}
          and ${userAchievements.earnedAt} is null
      )`,
    })
    .from(achievements)
    .orderBy(asc(achievements.tier), asc(achievements.name));

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No achievements"
        description="Run node scripts/seed.mjs to create the ten seeded achievements."
      />
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {rows.map((a) => (
        <section
          key={a.id}
          className="overflow-hidden rounded-xl border border-edge bg-surface"
        >
          <header className="flex items-start gap-3 border-b border-edge px-4 py-3">
            <span aria-hidden="true" className="text-2xl leading-none">
              {a.icon ?? "🏅"}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold">{a.name}</h2>
              <p className="truncate font-mono text-xs text-muted">{a.slug}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Badge tone={tierTone(a.tier)}>{a.tier}</Badge>
              <span className="text-xs text-muted">{a.gemReward} gems</span>
            </div>
          </header>

          <div className="space-y-3 p-4">
            <p className="text-sm text-muted">{a.description}</p>
            <p className="text-xs text-faint">
              {a.earnedCount} earned · {a.inProgressCount} in progress
            </p>

            <details className="rounded-lg border border-edge">
              <summary className="cursor-pointer select-none px-3 py-2 text-sm">
                Edit
              </summary>
              <div className="border-t border-edge p-3">
                <ActionForm
                  action={updateAchievement}
                  hidden={{ achievementId: a.id }}
                  submitLabel="Save"
                  pendingLabel="Saving…"
                  className="space-y-3"
                  footerClassName="flex flex-wrap items-center gap-3"
                >
                  <Field label="Name">
                    <input
                      name="name"
                      required
                      minLength={2}
                      maxLength={80}
                      defaultValue={a.name}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Description">
                    <textarea
                      name="description"
                      required
                      minLength={4}
                      maxLength={240}
                      rows={2}
                      defaultValue={a.description}
                      className={inputClass}
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Icon">
                      <input
                        name="icon"
                        maxLength={8}
                        defaultValue={a.icon ?? ""}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Tier">
                      <select name="tier" defaultValue={a.tier} className={selectClass}>
                        {TIERS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Gem reward">
                      <input
                        name="gemReward"
                        type="number"
                        min={0}
                        max={1000}
                        step={1}
                        defaultValue={a.gemReward}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                </ActionForm>
              </div>
            </details>

            {a.rule ? (
              <details className="rounded-lg border border-edge">
                <summary className="cursor-pointer select-none px-3 py-2 text-sm">
                  Rule (JSON)
                </summary>
                <div className="border-t border-edge p-3">
                  <JsonBlock value={a.rule} />
                </div>
              </details>
            ) : (
              <p className="text-xs text-faint">
                No rule stored; this badge is awarded by application code.
              </p>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

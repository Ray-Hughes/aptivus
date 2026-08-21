import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { featureFlags } from "@/db/schema";

/**
 * Feature flags. Every flag defaults OFF and unknown keys are OFF, so a typo
 * hides a feature rather than exposing one.
 */
export const FLAGS = {
  billing: "billing",
  gems: "gems",
  generatedProblems: "generated_problems",
  companyPacks: "company_packs",
  achievements: "achievements",
  multiLanguage: "multi_language",
  adminPanel: "admin_panel",
  languageTracks: "language_tracks",
  coach: "coach",
} as const;

export type FlagKey = (typeof FLAGS)[keyof typeof FLAGS];

let cache: { at: number; rows: Map<string, typeof featureFlags.$inferSelect> } | null = null;
const TTL_MS = 10_000;

async function load() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const rows = await db.select().from(featureFlags);
  cache = { at: Date.now(), rows: new Map(rows.map((r) => [r.key, r])) };
  return cache.rows;
}

export function invalidateFlagCache() {
  cache = null;
}

/**
 * Deterministic per user: the same user always lands the same side of a
 * percentage rollout, so nobody sees a feature flicker between page loads.
 */
function inRollout(key: string, userId: string, percent: number) {
  if (percent >= 100) return true;
  if (percent <= 0) return false;
  const h = createHash("sha256").update(`${key}:${userId}`).digest();
  return h.readUInt32BE(0) % 100 < percent;
}

export async function isEnabled(key: FlagKey, userId?: string | null) {
  const flag = (await load()).get(key);
  if (!flag) return false;
  if (!flag.enabled) return false;
  if (userId && flag.allowUserIds?.includes(userId)) return true;
  if (flag.rolloutPercent >= 100) return true;
  if (!userId) return false;
  return inRollout(key, userId, flag.rolloutPercent);
}

export async function allFlagsFor(userId?: string | null) {
  const rows = await load();
  const out: Record<string, boolean> = {};
  for (const key of Object.values(FLAGS)) out[key] = await isEnabled(key, userId);
  return out;
}

export async function setFlag(
  key: FlagKey,
  patch: Partial<Pick<typeof featureFlags.$inferSelect, "enabled" | "rolloutPercent" | "allowUserIds" | "description">>,
) {
  await db
    .update(featureFlags)
    .set({ ...patch, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(featureFlags.key, key));
  invalidateFlagCache();
}

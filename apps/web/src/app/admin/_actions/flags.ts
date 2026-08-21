"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { featureFlags, users } from "@/db/schema";
import { HttpError, audit, requireAdminApi } from "@/lib/admin";
import { invalidateFlagCache } from "@/lib/flags";
import { fail, ok, type ActionState } from "@/lib/forms";

const KeyInput = z.string().trim().min(1).max(64);

const SettingsInput = z.object({
  key: KeyInput,
  enabled: z.boolean(),
  rolloutPercent: z.coerce
    .number()
    .int("Whole percentages only.")
    .min(0, "Rollout cannot be below 0.")
    .max(100, "Rollout cannot exceed 100."),
});

function guard(error: unknown): ActionState {
  if (error instanceof HttpError) return fail(error.message);
  console.error("[admin/flags]", error);
  return fail("Something went wrong. The error was logged.");
}

async function loadFlag(key: string) {
  const [flag] = await db
    .select()
    .from(featureFlags)
    .where(eq(featureFlags.key, key))
    .limit(1);
  return flag ?? null;
}

/** Toggle + rollout percentage in one save. */
export async function updateFlag(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdminApi();
    const parsed = SettingsInput.safeParse({
      key: formData.get("key"),
      enabled: formData.get("enabled") === "on",
      rolloutPercent: formData.get("rolloutPercent"),
    });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid flag.");

    const before = await loadFlag(parsed.data.key);
    if (!before) return fail("No such flag.");

    await db
      .update(featureFlags)
      .set({
        enabled: parsed.data.enabled,
        rolloutPercent: parsed.data.rolloutPercent,
        updatedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(featureFlags.key, parsed.data.key));

    // Flags are cached for 10s in-process; without this the panel would report a
    // change the app has not started honouring yet.
    invalidateFlagCache();

    await audit({
      actorUserId: admin.id,
      action: "flag.update",
      targetType: "feature_flag",
      targetId: parsed.data.key,
      meta: {
        before: { enabled: before.enabled, rolloutPercent: before.rolloutPercent },
        after: { enabled: parsed.data.enabled, rolloutPercent: parsed.data.rolloutPercent },
      },
    });

    revalidatePath("/admin/flags");
    return ok(
      `Saved: ${parsed.data.enabled ? "on" : "off"} at ${parsed.data.rolloutPercent}%.`,
    );
  } catch (error) {
    return guard(error);
  }
}

/** Add a user to a flag's explicit allow list, by user id. */
export async function addFlagAllowUser(
  key: string,
  userId: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const admin = await requireAdminApi();
    const parsed = z
      .object({ key: KeyInput, userId: z.string().trim().min(1).max(64) })
      .safeParse({ key, userId });
    if (!parsed.success) return { ok: false, message: "Invalid request." };

    const flag = await loadFlag(parsed.data.key);
    if (!flag) return { ok: false, message: "No such flag." };

    const [target] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, parsed.data.userId))
      .limit(1);
    if (!target) return { ok: false, message: "No such user." };

    const current = flag.allowUserIds ?? [];
    if (current.includes(target.id)) {
      return { ok: true, message: `${target.email} is already on the list.` };
    }
    const next = [...current, target.id];

    await db
      .update(featureFlags)
      .set({ allowUserIds: next, updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(featureFlags.key, parsed.data.key));
    invalidateFlagCache();

    await audit({
      actorUserId: admin.id,
      action: "flag.allow_add",
      targetType: "feature_flag",
      targetId: parsed.data.key,
      meta: { userId: target.id, email: target.email },
    });

    revalidatePath("/admin/flags");
    return { ok: true, message: `Added ${target.email}.` };
  } catch (error) {
    if (error instanceof HttpError) return { ok: false, message: error.message };
    console.error("[admin/flags]", error);
    return { ok: false, message: "Something went wrong." };
  }
}

export async function removeFlagAllowUser(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdminApi();
    const parsed = z
      .object({ key: KeyInput, userId: z.string().trim().min(1).max(64) })
      .safeParse({ key: formData.get("key"), userId: formData.get("userId") });
    if (!parsed.success) return fail("Invalid request.");

    const flag = await loadFlag(parsed.data.key);
    if (!flag) return fail("No such flag.");

    const current = flag.allowUserIds ?? [];
    if (!current.includes(parsed.data.userId)) return ok("Not on the list.");
    const next = current.filter((id) => id !== parsed.data.userId);

    await db
      .update(featureFlags)
      .set({ allowUserIds: next, updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(featureFlags.key, parsed.data.key));
    invalidateFlagCache();

    await audit({
      actorUserId: admin.id,
      action: "flag.allow_remove",
      targetType: "feature_flag",
      targetId: parsed.data.key,
      meta: { userId: parsed.data.userId },
    });

    revalidatePath("/admin/flags");
    return ok("Removed from the allow list.");
  } catch (error) {
    return guard(error);
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { achievements } from "@/db/schema";
import { HttpError, audit, requireAdminApi } from "@/lib/admin";
import { fail, ok, type ActionState } from "@/lib/forms";
import { TIERS } from "../_components/constants";

const Input = z.object({
  achievementId: z.string().min(1),
  name: z.string().trim().min(2, "Name is too short.").max(80),
  description: z.string().trim().min(4, "Description is too short.").max(240),
  icon: z
    .string()
    .trim()
    .max(8, "One emoji is plenty.")
    .transform((v) => (v ? v : null)),
  tier: z.enum(TIERS),
  gemReward: z.coerce
    .number()
    .int("Whole gems only.")
    .min(0, "Cannot be negative.")
    .max(1000, "That is far too generous."),
});

export async function updateAchievement(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdminApi();
    const parsed = Input.safeParse({
      achievementId: formData.get("achievementId"),
      name: formData.get("name"),
      description: formData.get("description"),
      icon: formData.get("icon"),
      tier: formData.get("tier"),
      gemReward: formData.get("gemReward"),
    });
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid achievement.");
    }

    const [before] = await db
      .select()
      .from(achievements)
      .where(eq(achievements.id, parsed.data.achievementId))
      .limit(1);
    if (!before) return fail("No such achievement.");

    await db
      .update(achievements)
      .set({
        name: parsed.data.name,
        description: parsed.data.description,
        icon: parsed.data.icon,
        tier: parsed.data.tier,
        gemReward: parsed.data.gemReward,
      })
      .where(eq(achievements.id, parsed.data.achievementId));

    await audit({
      actorUserId: admin.id,
      action: "achievement.update",
      targetType: "achievement",
      targetId: parsed.data.achievementId,
      meta: {
        slug: before.slug,
        before: { name: before.name, tier: before.tier, gemReward: before.gemReward },
        after: {
          name: parsed.data.name,
          tier: parsed.data.tier,
          gemReward: parsed.data.gemReward,
        },
      },
    });

    revalidatePath("/admin/achievements");
    return ok("Saved.");
  } catch (error) {
    if (error instanceof HttpError) return fail(error.message);
    console.error("[admin/achievements]", error);
    return fail("Something went wrong. The error was logged.");
  }
}

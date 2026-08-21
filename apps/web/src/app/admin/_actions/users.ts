"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { gemLedger, users } from "@/db/schema";
import { HttpError, audit, requireAdminApi } from "@/lib/admin";
import { fail, ok, type ActionState } from "@/lib/forms";

const RoleInput = z.object({
  userId: z.string().min(1),
  role: z.enum(["user", "admin"]),
});

const GrantInput = z.object({
  userId: z.string().min(1),
  amount: z.coerce
    .number()
    .int("Whole gems only.")
    .refine((n) => n !== 0, "Use a non-zero amount.")
    .refine((n) => Math.abs(n) <= 10_000, "That is too large for a manual grant."),
  reason: z.string().trim().min(3, "Say why.").max(200),
});

const UserIdInput = z.object({ userId: z.string().min(1) });

function guard(error: unknown): ActionState {
  if (error instanceof HttpError) return fail(error.message);
  console.error("[admin/users]", error);
  return fail("Something went wrong. The error was logged.");
}

/** Promote or demote. An admin cannot demote themselves - that is how you lock
 *  yourself out of the only panel that can put you back. */
export async function setUserRole(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdminApi();
    const parsed = RoleInput.safeParse({
      userId: formData.get("userId"),
      role: formData.get("role"),
    });
    if (!parsed.success) return fail("Invalid role change.");

    const { userId, role } = parsed.data;
    if (userId === admin.id && role !== "admin") {
      return fail("You cannot remove your own admin role.");
    }

    const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) return fail("No such user.");
    if (target.role === role) return ok(`Already ${role}.`);

    await db.update(users).set({ role }).where(eq(users.id, userId));
    await audit({
      actorUserId: admin.id,
      action: role === "admin" ? "user.grant_admin" : "user.revoke_admin",
      targetType: "user",
      targetId: userId,
      meta: { from: target.role, to: role, email: target.email },
    });

    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
    return ok(role === "admin" ? "Admin granted." : "Admin revoked.");
  } catch (error) {
    return guard(error);
  }
}

/**
 * Gems move in exactly one way: a ledger row and the cached balance, together,
 * in a single transaction. Either both land or neither does - a balance without
 * the row that explains it is unauditable, and a row without the balance is a
 * user complaining their gems vanished.
 */
export async function grantGems(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdminApi();
    const parsed = GrantInput.safeParse({
      userId: formData.get("userId"),
      amount: formData.get("amount"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Invalid grant.");
    }
    const { userId, amount, reason } = parsed.data;

    const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) return fail("No such user.");
    if (target.gemBalance + amount < 0) {
      return fail(
        `That would take the balance below zero (currently ${target.gemBalance}).`,
      );
    }

    await db.transaction(async (tx) => {
      await tx.insert(gemLedger).values({
        userId,
        delta: amount,
        kind: amount > 0 ? "grant" : "spend",
        reason: `admin:${reason}`,
      });
      await tx
        .update(users)
        .set({ gemBalance: sql`${users.gemBalance} + ${amount}` })
        .where(eq(users.id, userId));
    });

    await audit({
      actorUserId: admin.id,
      action: "user.grant_gems",
      targetType: "user",
      targetId: userId,
      meta: {
        delta: amount,
        reason,
        balanceBefore: target.gemBalance,
        balanceAfter: target.gemBalance + amount,
      },
    });

    revalidatePath(`/admin/users/${userId}`);
    revalidatePath("/admin/payments");
    return ok(
      `${amount > 0 ? "Granted" : "Removed"} ${Math.abs(amount)} gems. New balance ${
        target.gemBalance + amount
      }.`,
    );
  } catch (error) {
    return guard(error);
  }
}

/** Soft delete: the row stays so attempts, ledger and audit history survive. */
export async function softDeleteUser(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdminApi();
    const parsed = UserIdInput.safeParse({ userId: formData.get("userId") });
    if (!parsed.success) return fail("Invalid user.");
    const { userId } = parsed.data;
    if (userId === admin.id) return fail("You cannot delete your own account here.");

    const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) return fail("No such user.");
    if (target.deletedAt) return ok("Already deleted.");

    await db
      .update(users)
      .set({ deletedAt: Math.floor(Date.now() / 1000) })
      .where(eq(users.id, userId));
    await audit({
      actorUserId: admin.id,
      action: "user.soft_delete",
      targetType: "user",
      targetId: userId,
      meta: { email: target.email },
    });

    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
    return ok("User soft-deleted. Sign-in is now refused for this account.");
  } catch (error) {
    return guard(error);
  }
}

export async function restoreUser(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdminApi();
    const parsed = UserIdInput.safeParse({ userId: formData.get("userId") });
    if (!parsed.success) return fail("Invalid user.");
    const { userId } = parsed.data;

    const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) return fail("No such user.");
    if (!target.deletedAt) return ok("Not deleted.");

    await db.update(users).set({ deletedAt: null }).where(eq(users.id, userId));
    await audit({
      actorUserId: admin.id,
      action: "user.restore",
      targetType: "user",
      targetId: userId,
      meta: { email: target.email },
    });

    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
    return ok("User restored.");
  } catch (error) {
    return guard(error);
  }
}

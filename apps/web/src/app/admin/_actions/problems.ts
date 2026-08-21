"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { problems } from "@/db/schema";
import { HttpError, audit, requireAdminApi } from "@/lib/admin";
import { fail, ok, type ActionState } from "@/lib/forms";

const Input = z.object({
  problemId: z.string().min(1),
  publish: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export async function setProblemPublished(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdminApi();
    const parsed = Input.safeParse({
      problemId: formData.get("problemId"),
      publish: formData.get("publish"),
    });
    if (!parsed.success) return fail("Invalid request.");
    const { problemId, publish } = parsed.data;

    const [problem] = await db
      .select()
      .from(problems)
      .where(eq(problems.id, problemId))
      .limit(1);
    if (!problem) return fail("No such problem.");
    if (problem.isPublished === publish) {
      return ok(publish ? "Already published." : "Already unpublished.");
    }

    await db.update(problems).set({ isPublished: publish }).where(eq(problems.id, problemId));
    await audit({
      actorUserId: admin.id,
      action: publish ? "problem.publish" : "problem.unpublish",
      targetType: "problem",
      targetId: problemId,
      meta: { slug: problem.slug, title: problem.title },
    });

    revalidatePath("/admin/problems");
    revalidatePath(`/admin/problems/${problemId}`);
    return ok(publish ? "Published." : "Unpublished.");
  } catch (error) {
    if (error instanceof HttpError) return fail(error.message);
    console.error("[admin/problems]", error);
    return fail("Something went wrong. The error was logged.");
  }
}

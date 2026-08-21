"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { companies, problems } from "@/db/schema";
import { HttpError, audit, requireAdminApi } from "@/lib/admin";
import { fail, ok, type ActionState } from "@/lib/forms";

const jsonObject = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (!value) return null;
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        ctx.addIssue({ code: "custom", message: "Profile must be a JSON object." });
        return z.NEVER;
      }
      return parsed;
    } catch {
      ctx.addIssue({ code: "custom", message: "Profile is not valid JSON." });
      return z.NEVER;
    }
  });

const CompanyFields = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Slug is too short.")
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, digits and hyphens."),
  name: z.string().trim().min(2, "Name is too short.").max(120),
  industry: z
    .string()
    .trim()
    .max(120)
    .transform((v) => (v ? v : null)),
  profile: jsonObject,
  isPublished: z
    .union([z.literal("on"), z.literal("true"), z.null(), z.undefined()])
    .transform((v) => v === "on" || v === "true"),
});

function read(formData: FormData) {
  return {
    slug: String(formData.get("slug") ?? ""),
    name: String(formData.get("name") ?? ""),
    industry: String(formData.get("industry") ?? ""),
    profile: String(formData.get("profile") ?? ""),
    isPublished: formData.get("isPublished") as "on" | null,
  };
}

function guard(error: unknown): ActionState {
  if (error instanceof HttpError) return fail(error.message);
  const message = error instanceof Error ? error.message : "";
  if (message.includes("UNIQUE") && message.includes("slug")) {
    return fail("That slug is already taken.");
  }
  console.error("[admin/companies]", error);
  return fail("Something went wrong. The error was logged.");
}

export async function createCompany(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let createdId: string | null = null;
  try {
    const admin = await requireAdminApi();
    const parsed = CompanyFields.safeParse(read(formData));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid company.");

    const [row] = await db
      .insert(companies)
      .values({
        slug: parsed.data.slug,
        name: parsed.data.name,
        industry: parsed.data.industry,
        profile: parsed.data.profile,
        isPublished: parsed.data.isPublished,
      })
      .returning({ id: companies.id });
    if (!row) return fail("Insert failed.");

    await audit({
      actorUserId: admin.id,
      action: "company.create",
      targetType: "company",
      targetId: row.id,
      meta: { slug: parsed.data.slug, name: parsed.data.name },
    });
    createdId = row.id;
    revalidatePath("/admin/companies");
  } catch (error) {
    return guard(error);
  }
  // Outside the try: redirect() signals by throwing and must not be swallowed.
  redirect(`/admin/companies/${createdId}`);
}

export async function updateCompany(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdminApi();
    const id = String(formData.get("companyId") ?? "");
    if (!id) return fail("Missing company.");
    const parsed = CompanyFields.safeParse(read(formData));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid company.");

    const [before] = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
    if (!before) return fail("No such company.");

    await db
      .update(companies)
      .set({
        slug: parsed.data.slug,
        name: parsed.data.name,
        industry: parsed.data.industry,
        profile: parsed.data.profile,
        isPublished: parsed.data.isPublished,
      })
      .where(eq(companies.id, id));

    await audit({
      actorUserId: admin.id,
      action: "company.update",
      targetType: "company",
      targetId: id,
      meta: {
        before: { slug: before.slug, name: before.name, isPublished: before.isPublished },
        after: {
          slug: parsed.data.slug,
          name: parsed.data.name,
          isPublished: parsed.data.isPublished,
        },
      },
    });

    revalidatePath("/admin/companies");
    revalidatePath(`/admin/companies/${id}`);
    return ok("Saved.");
  } catch (error) {
    return guard(error);
  }
}

export async function setCompanyPublished(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const admin = await requireAdminApi();
    const parsed = z
      .object({
        companyId: z.string().min(1),
        publish: z.enum(["true", "false"]).transform((v) => v === "true"),
      })
      .safeParse({
        companyId: formData.get("companyId"),
        publish: formData.get("publish"),
      });
    if (!parsed.success) return fail("Invalid request.");

    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, parsed.data.companyId))
      .limit(1);
    if (!company) return fail("No such company.");

    await db
      .update(companies)
      .set({ isPublished: parsed.data.publish })
      .where(eq(companies.id, parsed.data.companyId));
    await audit({
      actorUserId: admin.id,
      action: parsed.data.publish ? "company.publish" : "company.unpublish",
      targetType: "company",
      targetId: parsed.data.companyId,
      meta: { slug: company.slug },
    });

    revalidatePath("/admin/companies");
    revalidatePath(`/admin/companies/${parsed.data.companyId}`);
    return ok(parsed.data.publish ? "Published." : "Unpublished.");
  } catch (error) {
    return guard(error);
  }
}

export async function deleteCompany(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let deleted = false;
  try {
    const admin = await requireAdminApi();
    const id = String(formData.get("companyId") ?? "");
    if (!id) return fail("Missing company.");

    const [company] = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
    if (!company) return fail("No such company.");

    // problems.company_id has no ON DELETE rule, so a delete would leave rows
    // pointing at nothing. Refuse instead of orphaning content.
    const attached = await db
      .select({ id: problems.id })
      .from(problems)
      .where(eq(problems.companyId, id))
      .limit(1);
    if (attached.length > 0) {
      return fail("Problems are still attached to this company. Move them first.");
    }

    await db.delete(companies).where(eq(companies.id, id));
    await audit({
      actorUserId: admin.id,
      action: "company.delete",
      targetType: "company",
      targetId: id,
      meta: { slug: company.slug, name: company.name },
    });
    revalidatePath("/admin/companies");
    deleted = true;
  } catch (error) {
    return guard(error);
  }
  if (deleted) redirect("/admin/companies");
  return fail("Delete failed.");
}

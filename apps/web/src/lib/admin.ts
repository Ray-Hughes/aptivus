import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import type { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

export type AdminUser = {
  id: string;
  email: string;
  role: string;
  name?: string | null;
  image?: string | null;
};

/**
 * Page guard for Server Components.
 *
 * Signed out  -> redirect to /signin with a `next` hop back here.
 * Signed in, not an admin -> a real 403 page via forbidden(). Never a redirect,
 * because redirecting a signed-in user to /signin is exactly how you build an
 * infinite loop: they are already signed in, so /signin sends them back.
 */
export async function requireAdminPage(nextPath = "/admin"): Promise<AdminUser> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) redirect(`/signin?next=${encodeURIComponent(nextPath)}`);
  if (user.role !== "admin") forbidden();
  return user;
}

/** Thrown by the API/Server-Action guard; carries the status to return. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Guard for Route Handlers and Server Actions. Both are publicly reachable POST
 * endpoints regardless of what the UI renders, so every single one calls this.
 */
export async function requireAdminApi(): Promise<AdminUser> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) throw new HttpError(401, "Unauthorized");
  if (user.role !== "admin") throw new HttpError(403, "Forbidden");
  return user;
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error("[admin api]", err);
  return Response.json({ error: "Internal error" }, { status: 500 });
}

/** Best-effort client IP for the audit trail. */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? null;
  return h.get("x-real-ip") ?? h.get("cf-connecting-ip") ?? null;
}

type Auditable = {
  actorUserId: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  meta?: unknown;
};

/**
 * Every consequential mutation lands here. Writing the audit row is part of the
 * action, not an afterthought: an admin panel you cannot reconstruct after the
 * fact is a liability.
 */
export async function audit(entry: Auditable): Promise<void> {
  await db.insert(auditLog).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    meta: entry.meta ?? null,
    ip: await clientIp(),
  });
}

/** Flattens a zod issue list into { fieldName: message }. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Only same-origin absolute paths survive, so `next=` cannot be an open redirect. */
export function safeNext(value: unknown, fallback = "/admin"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}

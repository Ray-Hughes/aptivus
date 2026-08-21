/**
 * Small helpers every route handler in this API shares: consistent JSON
 * envelopes, and one place that decides what an error looks like on the wire.
 */
import type { ZodType } from "zod";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    // Problems, hints and solutions are user-specific and metered. Nothing in
    // this API may sit in a shared cache.
    headers: { "Cache-Control": "no-store" },
  });
}

export function fail(status: number, error: string, extra: Record<string, unknown> = {}): Response {
  return json({ error, ...extra }, status);
}

export const unauthorized = () => fail(401, "Sign in to do that.");
export const notFound = (what = "Not found.") => fail(404, what);

/**
 * Parse a JSON request body against a schema. Returns the value, or a 400
 * Response describing what was wrong with it.
 */
export async function readBody<T>(request: Request, schema: ZodType<T>): Promise<T | Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = {};
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return fail(400, "Invalid request body.", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return parsed.data;
}

/** Parse `?a=b` against a schema, with the same error shape. */
export function readQuery<T>(url: URL, schema: ZodType<T>): T | Response {
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return fail(400, "Invalid query.", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return parsed.data;
}

export const isResponse = (v: unknown): v is Response => v instanceof Response;

import { and, eq, isNull, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { errorResponse, requireAdminApi } from "@/lib/admin";

const Query = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(25).default(8),
});

/**
 * User lookup for the feature-flag allow-list editor.
 *
 * Guarded exactly like the pages are: an API route that trusts the UI to have
 * hidden it is not guarded at all.
 */
export async function GET(request: Request) {
  try {
    await requireAdminApi();

    const url = new URL(request.url);
    const parsed = Query.safeParse({
      q: url.searchParams.get("q") ?? "",
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return Response.json({ error: "Invalid query.", results: [] }, { status: 400 });
    }

    const needle = `%${parsed.data.q.toLowerCase()}%`;
    const results = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
      })
      .from(users)
      .where(
        and(
          isNull(users.deletedAt),
          or(
            like(sql`lower(${users.email})`, needle),
            like(sql`lower(coalesce(${users.displayName}, ''))`, needle),
            eq(users.id, parsed.data.q),
          ),
        ),
      )
      .limit(parsed.data.limit);

    return Response.json({ results });
  } catch (error) {
    return errorResponse(error);
  }
}

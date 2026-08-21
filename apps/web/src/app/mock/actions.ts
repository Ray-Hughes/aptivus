"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { mockRoundProblems, mockRounds } from "@/db/schema";
import {
  LENGTHS, SHAPES, compose, findSource, liveRound, publicSlot,
  type PublicSlot,
} from "@/lib/mock";

const Input = z.object({
  sourceId: z.string().trim().min(1).max(120),
  shape: z.enum(SHAPES),
  length: z.coerce.number().int().refine((n): n is (typeof LENGTHS)[number] => (LENGTHS as readonly number[]).includes(n), {
    message: "Not a round length we offer.",
  }),
  roll: z.coerce.number().int().min(0).max(9999),
});

export type Preview =
  | { ok: true; slots: PublicSlot[]; seconds: number; slackSeconds: number }
  | { ok: false; error: string };

/**
 * The shape of the round, and nothing more.
 *
 * Titles and patterns are deliberately absent from the return value rather
 * than merely hidden in the markup: a named pattern is a hint, and anything
 * that reaches the browser before the clock starts has been given away.
 */
export async function previewRound(raw: z.input<typeof Input>): Promise<Preview> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Sign in to compose a round." };

  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid round." };

  const source = await findSource(parsed.data.sourceId);
  if (!source) return { ok: false, error: "No such company or pack." };

  const c = await compose({
    userId: session.user.id,
    source,
    shape: parsed.data.shape,
    length: parsed.data.length as (typeof LENGTHS)[number],
    roll: parsed.data.roll,
  });
  if (c.slots.length < 2) return { ok: false, error: "Not enough problems in that pack for a two-problem round." };

  return { ok: true, slots: c.slots.map(publicSlot), seconds: c.seconds, slackSeconds: c.slackSeconds };
}

/**
 * Start it. `started_at` comes from the database's own clock and is never
 * accepted from the request, which is the whole reason the scorecard can be
 * believed later.
 */
export async function beginRound(raw: z.input<typeof Input>): Promise<{ ok: false; error: string } | never> {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?next=/mock");
  const userId = session.user.id;

  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid round." };

  // One open round at a time: two live clocks is not a thing that can be true.
  const open = await liveRound(userId);
  if (open) redirect(`/mock/${open.id}`);

  const source = await findSource(parsed.data.sourceId);
  if (!source) return { ok: false, error: "No such company or pack." };

  const c = await compose({
    userId,
    source,
    shape: parsed.data.shape,
    length: parsed.data.length as (typeof LENGTHS)[number],
    roll: parsed.data.roll,
  });
  if (c.slots.length < 2) return { ok: false, error: "Not enough problems in that pack for a two-problem round." };

  const [round] = await db
    .insert(mockRounds)
    .values({
      userId,
      companySlug: source.kind === "company" ? source.slug : null,
      pack: source.kind === "pack" ? source.slug : null,
      shape: parsed.data.shape,
      durationSeconds: c.seconds,
      status: "in_progress",
      activity: { blocks: [], events: [] },
    })
    .returning({ id: mockRounds.id });

  await db.insert(mockRoundProblems).values(
    c.slots.map((s, i) => ({ roundId: round.id, problemId: s.problemId, orderIndex: i })),
  );

  redirect(`/mock/${round.id}`);
}

/**
 * Throw an open round away without scoring it.
 *
 * A round nobody ever ended would otherwise block every future one, and an
 * abandoned round deliberately gets no scorecard: it is not a result.
 */
export async function abandonRound(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;
  const id = z.string().trim().min(1).max(64).safeParse(formData.get("roundId"));
  if (!id.success) return;
  await db
    .update(mockRounds)
    .set({ status: "abandoned", endedAt: Math.floor(Date.now() / 1000) })
    .where(and(eq(mockRounds.id, id.data), eq(mockRounds.userId, session.user.id), eq(mockRounds.status, "in_progress")));
  revalidatePath("/mock");
}

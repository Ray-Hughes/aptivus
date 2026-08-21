import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { subscriptions, users } from "@/db/schema";
import { GEM_PACKS, PRO_PRICE_ID, stripe, stripeConfigured } from "@/lib/billing";
import { FLAGS, isEnabled } from "@/lib/flags";

const Body = z.object({
  kind: z.enum(["pro", "gems"]),
  pack: z.enum(["small", "medium", "large"]).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  if (!(await isEnabled(FLAGS.billing, session.user.id))) {
    return NextResponse.json({ error: "Billing is not available yet." }, { status: 403 });
  }
  if (!stripeConfigured || !stripe) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const [existing] = await db
    .select().from(subscriptions).where(eq(subscriptions.userId, session.user.id)).limit(1);

  let customerId = existing?.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: session.user.email,
      metadata: { userId: session.user.id },
    });
    customerId = customer.id;
    await db
      .insert(subscriptions)
      .values({ userId: session.user.id, stripeCustomerId: customerId })
      .onConflictDoUpdate({ target: subscriptions.userId, set: { stripeCustomerId: customerId } });
  }

  const base = process.env.AUTH_URL ?? "http://localhost:3000";
  const isPro = parsed.data.kind === "pro";
  const priceId = isPro ? PRO_PRICE_ID : GEM_PACKS[parsed.data.pack ?? "medium"].priceId;
  if (!priceId) return NextResponse.json({ error: "Price not configured." }, { status: 503 });

  const checkout = await stripe.checkout.sessions.create({
    mode: isPro ? "subscription" : "payment",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/settings?checkout=success`,
    cancel_url: `${base}/settings?checkout=canceled`,
    automatic_tax: { enabled: true },
    // Read back in the webhook. Entitlement is granted there and nowhere else.
    metadata: {
      userId: session.user.id,
      kind: parsed.data.kind,
      gems: isPro ? "0" : String(GEM_PACKS[parsed.data.pack ?? "medium"].gems),
    },
  });

  await db.update(users).set({ lastSeenAt: Math.floor(Date.now() / 1000) })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ url: checkout.url });
}

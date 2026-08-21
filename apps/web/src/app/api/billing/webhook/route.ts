import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/db";
import { gemLedger, processedEvents, subscriptions, users } from "@/db/schema";
import { stripe, stripeConfigured } from "@/lib/billing";

/**
 * The ONLY place entitlement is granted. A browser returning from Checkout is
 * a UI hint, never proof of payment.
 */
export async function POST(req: Request) {
  if (!stripeConfigured || !stripe) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) return NextResponse.json({ error: "unsigned" }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  // Webhooks are delivered at least once. Granting 500 gems twice is a question
  // of when, not if, so dedupe on the event id before doing any work.
  const inserted = await db
    .insert(processedEvents)
    .values({ eventId: event.id, type: event.type })
    .onConflictDoNothing()
    .returning({ id: processedEvents.eventId });
  if (inserted.length === 0) return NextResponse.json({ received: true, duplicate: true });

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const userId = s.metadata?.userId;
      if (!userId) break;
      if (s.metadata?.kind === "gems") {
        const gems = Number(s.metadata.gems ?? 0);
        if (gems > 0) {
          await db.transaction(async (tx) => {
            await tx.insert(gemLedger).values({
              userId, delta: gems, kind: "purchase",
              reason: "gem_pack", stripeRef: s.id,
            });
            await tx.update(users)
              .set({ gemBalance: sql`${users.gemBalance} + ${gems}` })
              .where(eq(users.id, userId));
          });
        }
      } else {
        await db
          .insert(subscriptions)
          .values({
            userId, stripeCustomerId: String(s.customer ?? ""),
            stripeSubscriptionId: String(s.subscription ?? ""),
            status: "active", plan: "pro",
          })
          .onConflictDoUpdate({
            target: subscriptions.userId,
            set: {
              stripeSubscriptionId: String(s.subscription ?? ""),
              status: "active", plan: "pro",
              updatedAt: Math.floor(Date.now() / 1000),
            },
          });
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.userId;
      const patch = {
        status: event.type.endsWith("deleted") ? "canceled" : sub.status,
        currentPeriodEnd: (sub as unknown as { current_period_end?: number }).current_period_end ?? null,
        plan: event.type.endsWith("deleted") ? "free" : "pro",
        updatedAt: Math.floor(Date.now() / 1000),
      };
      if (userId) {
        await db.update(subscriptions).set(patch).where(eq(subscriptions.userId, userId));
      } else {
        await db.update(subscriptions).set(patch)
          .where(eq(subscriptions.stripeSubscriptionId, sub.id));
      }
      break;
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const customer = String(inv.customer ?? "");
      if (customer) {
        await db.update(subscriptions)
          .set({ status: "past_due", updatedAt: Math.floor(Date.now() / 1000) })
          .where(eq(subscriptions.stripeCustomerId, customer));
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}

import Stripe from "stripe";

/**
 * Billing is behind the `billing` feature flag and is inert without keys, so
 * the app runs fine with Stripe unconfigured - which is the state today.
 */
export const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);

export const stripe = stripeConfigured
  ? new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-07-29.dahlia" })
  : null;

export const PRO_PRICE_ID = process.env.STRIPE_PRICE_PRO ?? "";

/** Gem packs, priced so a daily user finds Pro the better deal. */
export const GEM_PACKS = {
  small: { gems: 60, priceId: process.env.STRIPE_PRICE_GEMS_SMALL ?? "", label: "60 gems", amount: 199 },
  medium: { gems: 200, priceId: process.env.STRIPE_PRICE_GEMS_MEDIUM ?? "", label: "200 gems", amount: 499 },
  large: { gems: 500, priceId: process.env.STRIPE_PRICE_GEMS_LARGE ?? "", label: "500 gems", amount: 999 },
} as const;

export type GemPack = keyof typeof GEM_PACKS;

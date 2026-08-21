/** Shared literals that both Server Actions and pages need. Kept out of the
 *  "use server" files, which may only export async functions. */
export const TIERS = ["bronze", "silver", "gold", "platinum"] as const;
export type Tier = (typeof TIERS)[number];

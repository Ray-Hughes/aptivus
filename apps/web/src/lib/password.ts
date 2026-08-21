import { hash, verify } from "@node-rs/argon2";

/** Argon2id. OWASP-ish parameters; tune memoryCost if login latency matters. */
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (plain: string) => hash(plain, OPTS);

export async function verifyPassword(digest: string | null, plain: string) {
  // Always do the work, even with no stored hash, so response time does not
  // reveal whether an account exists.
  if (!digest) {
    await hash("dummy-value-for-constant-time", OPTS);
    return false;
  }
  try {
    return await verify(digest, plain);
  } catch {
    return false;
  }
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return "Use at least 10 characters.";
  if (pw.length > 200) return "That is too long.";
  if (/^\d+$/.test(pw)) return "Digits alone are easy to guess.";
  return null;
}

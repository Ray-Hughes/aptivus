/**
 * Fail fast on configuration that is safe in development and dangerous
 * deployed. With JWT sessions, anyone who knows AUTH_SECRET can mint an admin
 * session, so a placeholder secret in production is a full compromise.
 */
const WEAK = [
  "dev-only-secret-change-me-in-production-0123456789abcdef",
  "secret", "changeme", "development",
];

export function assertProductionConfig() {
  const isProd =
    process.env.NODE_ENV === "production" || process.env.APTIVUS_ENV === "production";
  if (!isProd) return;

  const problems: string[] = [];
  const secret = process.env.AUTH_SECRET ?? "";
  if (!secret) problems.push("AUTH_SECRET is not set");
  else if (secret.length < 32) problems.push("AUTH_SECRET is shorter than 32 characters");
  else if (WEAK.some((w) => secret.toLowerCase().includes(w))) {
    problems.push("AUTH_SECRET still looks like the development placeholder");
  }
  if (!process.env.AUTH_URL?.startsWith("https://")) {
    problems.push("AUTH_URL must be an https URL in production");
  }
  if (problems.length) {
    throw new Error(
      "Refusing to start with unsafe configuration:\n  - " + problems.join("\n  - "),
    );
  }
}

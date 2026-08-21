import { headers } from "next/headers";

/**
 * The origin to build emailed links from.
 *
 * AUTH_URL is used when it is a clean origin, but it is easy to set wrongly and
 * a wrong value here silently produces dead links in password-reset emails.
 * Falling back to the actual request host means links work even when the
 * variable is missing.
 */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.AUTH_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      /* fall through to the request */
    }
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Cheap cookie presence check only. Real authorisation happens in the page and
 * in every API route via requireUser/requireAdmin - middleware runs on the edge
 * and must not be the only gate.
 */
const PROTECTED = [/^\/dashboard/, /^\/settings/, /^\/admin/, /^\/practice/];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((re) => re.test(pathname))) return NextResponse.next();

  const hasSession =
    req.cookies.has("authjs.session-token") ||
    req.cookies.has("__Secure-authjs.session-token");
  if (hasSession) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/signin";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*", "/admin/:path*", "/practice/:path*"],
};

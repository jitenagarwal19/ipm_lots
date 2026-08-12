import { NextResponse, type NextRequest } from "next/server";

/**
 * Redirect signed-out visitors to /login.
 *
 * This is a convenience layer, not the security boundary. Middleware runs at the
 * edge with no database, so it can only see *whether* a session cookie exists,
 * not whether it is valid, unexpired, or still allowlisted. Enforcement lives in
 * the Express `requireAuth` middleware, which checks all of that on every
 * request and is what actually protects the data.
 *
 * Treating a cookie's mere presence as proof of identity here would be a hole;
 * treating it as "probably signed in, let the API confirm" is just good UX.
 */

const SESSION_COOKIE = "ipm_session";
const PUBLIC_PATHS = new Set(["/login"]);

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  // Come back to where they were headed once signed in. Only the path — never
  // an absolute URL, which would make this an open redirect.
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  /**
   * Everything except Next internals, static assets, and /api — API requests
   * must receive a clean 401 from Express, not an HTML redirect, or fetch()
   * callers get a parse error instead of an auth error.
   */
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|uploads).*)"],
};

import { NextResponse, type NextRequest } from "next/server";
import { TOKEN_COOKIE_NAME } from "@/lib/config";
import { ADMIN_TOKEN_COOKIE_NAME } from "@/lib/adminConfig";

// Routes that require a session. Everything else (the login flow, the
// public launcher, static assets) is left alone. This only checks for the
// token's presence - a forged or expired token still gets past it and
// gets caught by the 401 that request()/fetchMe surfaces, same as any
// other API auth failure. /buy and /sell use client-side useAuth checks
// instead (see src/hooks/useRequireAuth.ts) since they need isLoading
// state to avoid flashing a redirect before the session check resolves.
const PROTECTED_PATHS = ["/account"];

// Separate admin/support tool, separate cookie, separate redirect target -
// entirely distinct from customer auth above. /admin/login itself is
// excluded (that's where the redirect below sends an unauthenticated
// visitor, so it can never require a session itself). app/admin/layout.tsx
// does the equivalent check client-side too (with a role-aware dashboard
// once authenticated) - this middleware check just avoids serving any
// protected admin HTML/data to a request with no admin cookie at all.
const ADMIN_PROTECTED_PREFIX = "/admin";
const ADMIN_LOGIN_PATH = "/admin/login";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === ADMIN_LOGIN_PATH) return NextResponse.next();

  if (pathname === ADMIN_PROTECTED_PREFIX || pathname.startsWith(`${ADMIN_PROTECTED_PREFIX}/`)) {
    const adminToken = req.cookies.get(ADMIN_TOKEN_COOKIE_NAME)?.value;
    if (!adminToken) {
      return NextResponse.redirect(new URL(ADMIN_LOGIN_PATH, req.url));
    }
    return NextResponse.next();
  }

  const isProtected = PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  if (!isProtected) return NextResponse.next();

  const token = req.cookies.get(TOKEN_COOKIE_NAME)?.value;
  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/account/:path*", "/admin/:path*"],
};

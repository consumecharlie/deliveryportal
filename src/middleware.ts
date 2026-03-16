import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Auth middleware — protects all routes except:
 * - /auth/* (sign-in, sign-out, error pages)
 * - /api/auth/* (NextAuth API routes)
 * - /_next/* (Next.js internals)
 * - /favicon.ico, /robots.txt
 *
 * When Google OAuth credentials are not configured (GOOGLE_CLIENT_ID is empty),
 * the middleware is effectively disabled and all routes are accessible.
 * This allows development without OAuth set up.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip auth for these paths
  if (
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  ) {
    return NextResponse.next();
  }

  // If OAuth is not configured, allow all requests (dev mode)
  if (!process.env.GOOGLE_CLIENT_ID) {
    return NextResponse.next();
  }

  // Check for valid session token
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: "next-auth.session-token",
  });

  if (!token) {
    // Redirect to sign-in page for page requests
    if (!pathname.startsWith("/api/")) {
      const signInUrl = new URL("/auth/signin", req.url);
      signInUrl.searchParams.set("callbackUrl", req.url);
      return NextResponse.redirect(signInUrl);
    }

    // Return 401 for API requests
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  // Verify email domain
  const email = token.email as string | undefined;
  if (email && !email.endsWith("@consume-media.com")) {
    if (!pathname.startsWith("/api/")) {
      return NextResponse.redirect(new URL("/auth/error?error=AccessDenied", req.url));
    }
    return NextResponse.json(
      { error: "Access denied — @consume-media.com email required" },
      { status: 403 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (browser favicon)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

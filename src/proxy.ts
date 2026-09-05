import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

const PUBLIC_PATHS = new Set([
  "/login",
  "/signup",
  "/api/signup",
  "/forgot-password",
  "/reset-password",
  "/api/forgot-password",
  "/api/reset-password",
]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/share/") ||
    pathname.startsWith("/api/share/") ||
    pathname.startsWith("/auth/")
  ) {
    return NextResponse.next();
  }

  const session = await auth();
  if (session?.user) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") {
    loginUrl.searchParams.set("redirect", pathname);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|apple-icon.png).*)"],
};

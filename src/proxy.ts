import { NextRequest, NextResponse } from "next/server";

export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/inngest")) {
    return NextResponse.next();
  }

  const authCookie = req.cookies.get("slushie-auth");
  if (authCookie?.value === process.env.AUTH_PASSWORD) {
    return NextResponse.next();
  }

  if (req.nextUrl.pathname === "/api/auth" && req.method === "POST") {
    return NextResponse.next();
  }

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (req.nextUrl.pathname === "/login") {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

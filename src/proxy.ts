import { NextRequest, NextResponse } from "next/server";

export function proxy(req: NextRequest) {
  // Skip auth entirely — ngrok provides access control
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

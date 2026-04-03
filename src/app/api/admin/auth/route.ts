import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  if (password === process.env.AUTH_PASSWORD) {
    const res = NextResponse.json({ ok: true });
    const isSecure =
      req.headers.get("x-forwarded-proto") === "https" ||
      process.env.NODE_ENV === "production";
    res.cookies.set("slushie-admin-auth", password, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  }

  return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
}

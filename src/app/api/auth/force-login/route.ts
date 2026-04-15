import { NextRequest, NextResponse } from "next/server";
import { createToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = await createToken("cmnjdfewx000046s9hps10r30", "ryanrhaugland@gmail.com");
  const origin = req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const response = NextResponse.redirect(new URL("/", `${proto}://${origin}`));
  response.cookies.set("session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}

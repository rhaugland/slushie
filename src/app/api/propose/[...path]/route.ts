import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { cookies } from "next/headers";
import { createHash } from "crypto";

const SCOPER_API = process.env.SCOPER_API_URL ?? "http://localhost:3003";

// Scoper uses UUID ids; slushie uses CUIDs. Convert deterministically via UUID v5.
const UUID_NAMESPACE = Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex");
function cuidToUuid(cuid: string): string {
  const hash = createHash("sha1").update(UUID_NAMESPACE).update(cuid).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.toString("hex").slice(0, 32);
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}

async function proxyToScoper(req: NextRequest, params: { path: string[] }) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session");
  if (!sessionCookie) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await verifyToken(sessionCookie.value);
  if (!payload) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const scoperUserId = cuidToUuid(payload.userId);

  const path = params.path.join("/");
  const url = new URL(`/api/${path}`, SCOPER_API);
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));

  const headers = new Headers();
  const ct = req.headers.get("Content-Type");
  if (ct) headers.set("Content-Type", ct);
  headers.set("Cookie", `session=${scoperUserId}`);

  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await req.text();

  const res = await fetch(url.toString(), {
    method: req.method,
    headers,
    body,
  });

  const contentType = res.headers.get("Content-Type") ?? "";
  if (contentType.includes("json")) {
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  }

  const responseBody = await res.arrayBuffer();
  return new NextResponse(responseBody, {
    status: res.status,
    headers: {
      "Content-Type": contentType,
    },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyToScoper(req, await params);
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyToScoper(req, await params);
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyToScoper(req, await params);
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxyToScoper(req, await params);
}

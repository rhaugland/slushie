import { NextRequest, NextResponse } from "next/server";

// In-memory signaling store — maps roomCode to array of messages
// Each message: { from: "host"|"guest", type: string, data: any, ts: number }
const signalStore = new Map<string, { from: string; type: string; data: any; ts: number }[]>();

// Clean up old rooms after 1 hour
function cleanup() {
  const cutoff = Date.now() - 3600000;
  for (const [key, msgs] of signalStore.entries()) {
    if (msgs.length === 0 || msgs[msgs.length - 1].ts < cutoff) {
      signalStore.delete(key);
    }
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode } = await params;
  const { from, type, data } = await req.json();

  if (!from || !type) {
    return NextResponse.json({ error: "from and type required" }, { status: 400 });
  }

  if (!signalStore.has(roomCode)) {
    signalStore.set(roomCode, []);
  }

  signalStore.get(roomCode)!.push({ from, type, data, ts: Date.now() });

  // Periodic cleanup
  if (Math.random() < 0.01) cleanup();

  return NextResponse.json({ ok: true });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode } = await params;
  const since = parseInt(req.nextUrl.searchParams.get("since") || "0", 10);
  const role = req.nextUrl.searchParams.get("role") || "guest"; // host or guest

  const messages = signalStore.get(roomCode) || [];

  // Return messages from the OTHER party that arrived after `since`
  const filtered = messages.filter(
    (m) => m.from !== role && m.ts > since
  );

  return NextResponse.json({ messages: filtered });
}

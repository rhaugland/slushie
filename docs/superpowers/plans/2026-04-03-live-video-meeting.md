# Live Video Meeting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add peer-to-peer live video meetings with audio capture, chunked upload, and automatic transcription/summarization via the existing Notes pipeline.

**Architecture:** WebRTC peer-to-peer video between host (authenticated user) and guest (shareable link, no auth). Signaling via polling-based REST API (no WebSocket needed). Host captures audio via MediaRecorder with 30-second chunking, uploaded progressively. At meeting end, chunks are stitched server-side and fed into the existing `meeting/transcribe` → summarize → extract-suggestions pipeline.

**Tech Stack:** WebRTC (browser native), MediaRecorder API, Next.js API routes, Prisma (LiveRoom model), ffmpeg (audio stitching), Inngest

**Spec:** `docs/superpowers/specs/2026-04-03-notes-wishlist-design.md` (Live Video Meeting section)

---

## File Structure

### New Files
- `prisma/migrations/XXXXXX_live_room/migration.sql` — auto-generated
- `src/app/api/meetings/live/route.ts` — POST: create live meeting room
- `src/app/api/meetings/live/[roomCode]/route.ts` — GET: room info for guest
- `src/app/api/meetings/live/[roomCode]/signal/route.ts` — GET+POST: signaling channel
- `src/app/api/meetings/[id]/chunks/route.ts` — POST: upload audio chunk
- `src/app/api/meetings/[id]/end/route.ts` — POST: end meeting, stitch audio, trigger pipeline
- `src/app/meet/[roomCode]/page.tsx` — Guest join page (no auth, minimal UI)
- `src/components/live-meeting.tsx` — Host video call UI component
- `src/lib/webrtc-signal.ts` — Shared signaling helpers (poll, post)

### Modified Files
- `prisma/schema.prisma` — Add LiveRoom model, add relation to Meeting
- `src/components/pane-notes.tsx` — Add "Start Live Meeting" button + in-meeting view

---

### Task 1: Schema — Add LiveRoom Model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the LiveRoom model and Meeting relation**

Add the `LiveRoom` model after `WishlistItem` in `prisma/schema.prisma`:

```prisma
model LiveRoom {
  id        String   @id @default(cuid())
  meetingId String   @unique
  roomCode  String   @unique
  status    String   @default("waiting") // waiting | active | ended
  createdAt DateTime @default(now())
  meeting   Meeting  @relation(fields: [meetingId], references: [id], onDelete: Cascade)
}
```

Add this relation line inside the `Meeting` model (after the `wishlistItems` line):

```prisma
  liveRoom    LiveRoom?
```

- [ ] **Step 2: Run migration**

```bash
cd /Users/ryanhaugland/slushie-machine
npx prisma migrate dev --name live_room
```

- [ ] **Step 3: Commit**

```bash
git add prisma/
git commit -m "feat: add LiveRoom model for live video meetings"
```

---

### Task 2: Create Live Meeting API Route

**Files:**
- Create: `src/app/api/meetings/live/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/api/meetings/live/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientId, projectId } = await req.json();

  if (!clientId) {
    return NextResponse.json({ error: "clientId required" }, { status: 400 });
  }

  // Create meeting record
  const meeting = await prisma.meeting.create({
    data: {
      clientId,
      projectId: projectId || null,
      type: "live_video",
      status: "uploading",
    },
  });

  // Generate short room code (8 chars, URL-safe)
  const roomCode = crypto.randomBytes(4).toString("hex");

  // Create live room
  const liveRoom = await prisma.liveRoom.create({
    data: {
      meetingId: meeting.id,
      roomCode,
      status: "waiting",
    },
  });

  return NextResponse.json({
    meetingId: meeting.id,
    roomCode: liveRoom.roomCode,
    meetingLink: `/meet/${liveRoom.roomCode}`,
  }, { status: 201 });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/meetings/live/route.ts
git commit -m "feat: add POST /api/meetings/live to create live meeting rooms"
```

---

### Task 3: Room Info + Signaling API Routes

**Files:**
- Create: `src/app/api/meetings/live/[roomCode]/route.ts`
- Create: `src/app/api/meetings/live/[roomCode]/signal/route.ts`

- [ ] **Step 1: Create room info route**

Create `src/app/api/meetings/live/[roomCode]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomCode: string }> }
) {
  const { roomCode } = await params;

  const room = await prisma.liveRoom.findUnique({
    where: { roomCode },
    include: {
      meeting: {
        select: { id: true, status: true, clientId: true },
      },
    },
  });

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  return NextResponse.json({
    roomCode: room.roomCode,
    meetingId: room.meeting.id,
    status: room.status,
  });
}
```

- [ ] **Step 2: Create signaling route**

Signaling uses an in-memory store (simple for single-server deployment). Create `src/app/api/meetings/live/[roomCode]/signal/route.ts`:

```typescript
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
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/meetings/live/
git commit -m "feat: add room info and signaling API routes for live meetings"
```

---

### Task 4: Audio Chunk Upload + Meeting End Routes

**Files:**
- Create: `src/app/api/meetings/[id]/chunks/route.ts`
- Create: `src/app/api/meetings/[id]/end/route.ts`

- [ ] **Step 1: Create chunk upload route**

Create `src/app/api/meetings/[id]/chunks/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const formData = await req.formData();
  const chunk = formData.get("chunk") as File | null;
  const chunkIndex = formData.get("index") as string | null;

  if (!chunk || chunkIndex === null) {
    return NextResponse.json({ error: "chunk and index required" }, { status: 400 });
  }

  const chunkDir = path.join(process.cwd(), "public", "uploads", "chunks", id);
  await mkdir(chunkDir, { recursive: true });

  const filename = `${chunkIndex.padStart(4, "0")}.webm`;
  const buffer = Buffer.from(await chunk.arrayBuffer());
  await writeFile(path.join(chunkDir, filename), buffer);

  return NextResponse.json({ ok: true, chunk: filename });
}
```

- [ ] **Step 2: Create meeting end route**

Create `src/app/api/meetings/[id]/end/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Update live room status
  await prisma.liveRoom.updateMany({
    where: { meetingId: id },
    data: { status: "ended" },
  });

  // Stitch audio chunks into a single file
  const chunkDir = path.join(process.cwd(), "public", "uploads", "chunks", id);
  const outputDir = path.join(process.cwd(), "public", "uploads", "notes");
  await mkdir(outputDir, { recursive: true });

  let audioUrl: string | null = null;

  try {
    const files = await readdir(chunkDir);
    const sorted = files.filter((f) => f.endsWith(".webm")).sort();

    if (sorted.length > 0) {
      // Concatenate webm chunks into a single file
      // WebM containers can be simply concatenated for playback
      const buffers: Buffer[] = [];
      for (const file of sorted) {
        const buf = await readFile(path.join(chunkDir, file));
        buffers.push(buf);
      }
      const combined = Buffer.concat(buffers);
      const outputFile = `${id}.webm`;
      await writeFile(path.join(outputDir, outputFile), combined);
      audioUrl = `/uploads/notes/${outputFile}`;
    }
  } catch {
    // No chunks directory — meeting may have had no audio
  }

  // Update meeting with audio URL and trigger transcription pipeline
  await prisma.meeting.update({
    where: { id },
    data: {
      audioUrl,
      status: audioUrl ? "uploading" : "ready",
    },
  });

  // Trigger transcription if we have audio
  if (audioUrl) {
    const { inngest } = await import("@/inngest/client");
    await inngest.send({
      name: "meeting/transcribe",
      data: { meetingId: id },
    });
  }

  return NextResponse.json({ ok: true, audioUrl });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/meetings/
git commit -m "feat: add audio chunk upload and meeting end routes"
```

---

### Task 5: WebRTC Signaling Helper

**Files:**
- Create: `src/lib/webrtc-signal.ts`

- [ ] **Step 1: Create the signaling helper**

Create `src/lib/webrtc-signal.ts`:

```typescript
type SignalMessage = {
  from: string;
  type: string;
  data: any;
  ts: number;
};

export class SignalChannel {
  private roomCode: string;
  private role: "host" | "guest";
  private lastTs = 0;
  private polling = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private onMessage: (msg: SignalMessage) => void;

  constructor(
    roomCode: string,
    role: "host" | "guest",
    onMessage: (msg: SignalMessage) => void
  ) {
    this.roomCode = roomCode;
    this.role = role;
    this.onMessage = onMessage;
  }

  async send(type: string, data: any) {
    await fetch(`/api/meetings/live/${this.roomCode}/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.role, type, data }),
    });
  }

  startPolling(intervalMs = 500) {
    if (this.polling) return;
    this.polling = true;
    this.pollInterval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/meetings/live/${this.roomCode}/signal?role=${this.role}&since=${this.lastTs}`
        );
        if (!res.ok) return;
        const { messages } = await res.json();
        for (const msg of messages) {
          this.lastTs = Math.max(this.lastTs, msg.ts);
          this.onMessage(msg);
        }
      } catch {
        // Network error — will retry on next interval
      }
    }, intervalMs);
  }

  stopPolling() {
    this.polling = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/webrtc-signal.ts
git commit -m "feat: add WebRTC signaling channel helper"
```

---

### Task 6: Live Meeting Component (Host View)

**Files:**
- Create: `src/components/live-meeting.tsx`

- [ ] **Step 1: Create the live meeting component**

Create `src/components/live-meeting.tsx`:

```tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { SignalChannel } from "@/lib/webrtc-signal";

type Props = {
  meetingId: string;
  roomCode: string;
  onEnd: () => void;
};

export function LiveMeeting({ meetingId, roomCode, onEnd }: Props) {
  const [status, setStatus] = useState<"waiting" | "connecting" | "connected" | "ended">("waiting");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const signalRef = useRef<SignalChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunkIndexRef = useRef(0);

  const meetingLink = typeof window !== "undefined"
    ? `${window.location.origin}/meet/${roomCode}`
    : `/meet/${roomCode}`;

  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(meetingLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Upload a single audio chunk
  const uploadChunk = useCallback(async (blob: Blob) => {
    const formData = new FormData();
    formData.append("chunk", blob, `chunk.webm`);
    formData.append("index", String(chunkIndexRef.current));
    chunkIndexRef.current += 1;
    setChunkCount((c) => c + 1);

    await fetch(`/api/meetings/${meetingId}/chunks`, {
      method: "POST",
      body: formData,
    });
  }, [meetingId]);

  // Start audio recording with 30-second chunks
  const startRecording = useCallback((stream: MediaStream) => {
    const audioStream = new MediaStream(stream.getAudioTracks());
    const recorder = new MediaRecorder(audioStream, {
      mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm",
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        uploadChunk(e.data);
      }
    };

    recorder.start(30000); // 30-second chunks
    recorderRef.current = recorder;
  }, [uploadChunk]);

  // Initialize WebRTC as host
  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Get local media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Start recording audio
      startRecording(stream);

      // Set up peer connection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;

      // Add local tracks
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Handle remote tracks
      pc.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
          setStatus("connected");
        }
      };

      // Set up signaling
      const signal = new SignalChannel(roomCode, "host", async (msg) => {
        if (msg.type === "offer") {
          // Guest sent an offer (shouldn't happen in this flow, but handle it)
          await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          signal.send("answer", answer);
        } else if (msg.type === "answer") {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
        } else if (msg.type === "ice-candidate") {
          if (msg.data) {
            await pc.addIceCandidate(new RTCIceCandidate(msg.data));
          }
        } else if (msg.type === "join") {
          // Guest joined — create and send offer
          setStatus("connecting");
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          signal.send("offer", offer);
        }
      });

      signalRef.current = signal;

      // Send ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          signal.send("ice-candidate", event.candidate.toJSON());
        }
      };

      // Start polling for signals
      signal.startPolling(500);
    }

    init();

    return () => {
      cancelled = true;
      signalRef.current?.stopPolling();
      pcRef.current?.close();
      recorderRef.current?.stop();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [roomCode, startRecording]);

  async function handleEnd() {
    setStatus("ended");

    // Stop recording
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }

    // Stop signaling
    signalRef.current?.stopPolling();

    // Close peer connection
    pcRef.current?.close();

    // Stop local media
    localStreamRef.current?.getTracks().forEach((t) => t.stop());

    // Wait briefly for final chunk upload
    await new Promise((r) => setTimeout(r, 1000));

    // End meeting on server (stitch audio + trigger pipeline)
    await fetch(`/api/meetings/${meetingId}/end`, { method: "POST" });

    onEnd();
  }

  function toggleMute() {
    const audioTracks = localStreamRef.current?.getAudioTracks();
    if (audioTracks) {
      audioTracks.forEach((t) => { t.enabled = !t.enabled; });
      setMuted(!muted);
    }
  }

  function toggleCamera() {
    const videoTracks = localStreamRef.current?.getVideoTracks();
    if (videoTracks) {
      videoTracks.forEach((t) => { t.enabled = !t.enabled; });
      setCameraOff(!cameraOff);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white/80">Live Meeting</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className={`w-2 h-2 rounded-full ${
              status === "connected" ? "bg-green-400 animate-pulse" :
              status === "connecting" ? "bg-yellow-400 animate-pulse" :
              status === "ended" ? "bg-red-400" :
              "bg-white/20"
            }`} />
            <span className="text-xs text-white/40">
              {status === "waiting" ? "Waiting for guest..." :
               status === "connecting" ? "Connecting..." :
               status === "connected" ? "Connected" :
               "Ended"}
            </span>
          </div>
        </div>
        <div className="text-[0.55rem] text-white/20">{chunkCount} chunks uploaded</div>
      </div>

      {/* Share link */}
      {status === "waiting" && (
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
          <div className="text-[0.6rem] text-white/30 mb-1">Share this link with your guest:</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-blue-400 bg-white/[0.04] px-2 py-1.5 rounded truncate">
              {meetingLink}
            </code>
            <button
              onClick={copyLink}
              className="px-3 py-1.5 text-xs rounded-lg bg-white/[0.08] text-white/60 hover:text-white/80 transition-colors shrink-0"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {/* Video feeds */}
      <div className="grid grid-cols-2 gap-3">
        <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-2 left-2 text-[0.55rem] text-white/40 bg-black/50 px-1.5 py-0.5 rounded">
            You
          </div>
        </div>
        <div className="relative rounded-lg overflow-hidden bg-black/50 aspect-video flex items-center justify-center">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
          {status !== "connected" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs text-white/20">Waiting for guest...</span>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={toggleMute}
          className={`p-3 rounded-full transition-colors ${
            muted ? "bg-red-500/20 text-red-400" : "bg-white/[0.08] text-white/60 hover:text-white/80"
          }`}
          title={muted ? "Unmute" : "Mute"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {muted ? (
              <>
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </>
            ) : (
              <>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </>
            )}
          </svg>
        </button>

        <button
          onClick={toggleCamera}
          className={`p-3 rounded-full transition-colors ${
            cameraOff ? "bg-red-500/20 text-red-400" : "bg-white/[0.08] text-white/60 hover:text-white/80"
          }`}
          title={cameraOff ? "Turn on camera" : "Turn off camera"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {cameraOff ? (
              <>
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56" />
              </>
            ) : (
              <>
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </>
            )}
          </svg>
        </button>

        <button
          onClick={handleEnd}
          className="px-6 py-3 rounded-full bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
        >
          End Meeting
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/live-meeting.tsx
git commit -m "feat: add live meeting host component with WebRTC and audio chunking"
```

---

### Task 7: Guest Join Page

**Files:**
- Create: `src/app/meet/[roomCode]/page.tsx`

- [ ] **Step 1: Create the guest page**

Create `src/app/meet/[roomCode]/page.tsx`:

```tsx
"use client";

import { useState, useEffect, useRef, use } from "react";
import { SignalChannel } from "@/lib/webrtc-signal";

export default function MeetGuestPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = use(params);
  const [status, setStatus] = useState<"loading" | "ready" | "connecting" | "connected" | "ended" | "not-found">("loading");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const signalRef = useRef<SignalChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Check room exists
  useEffect(() => {
    fetch(`/api/meetings/live/${roomCode}`)
      .then((res) => {
        if (res.ok) setStatus("ready");
        else setStatus("not-found");
      })
      .catch(() => setStatus("not-found"));
  }, [roomCode]);

  async function handleJoin() {
    setStatus("connecting");

    // Get local media
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    // Set up peer connection
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pcRef.current = pc;

    // Add local tracks
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    // Handle remote tracks
    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        setStatus("connected");
      }
    };

    // Set up signaling
    const signal = new SignalChannel(roomCode, "guest", async (msg) => {
      if (msg.type === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signal.send("answer", answer);
      } else if (msg.type === "ice-candidate") {
        if (msg.data) {
          await pc.addIceCandidate(new RTCIceCandidate(msg.data));
        }
      }
    });

    signalRef.current = signal;

    // Send ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signal.send("ice-candidate", event.candidate.toJSON());
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "closed") {
        setStatus("ended");
      }
    };

    // Tell the host we've joined
    signal.send("join", {});

    // Start polling
    signal.startPolling(500);
  }

  function handleLeave() {
    setStatus("ended");
    signalRef.current?.stopPolling();
    pcRef.current?.close();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
  }

  function toggleMute() {
    const tracks = localStreamRef.current?.getAudioTracks();
    if (tracks) {
      tracks.forEach((t) => { t.enabled = !t.enabled; });
      setMuted(!muted);
    }
  }

  function toggleCamera() {
    const tracks = localStreamRef.current?.getVideoTracks();
    if (tracks) {
      tracks.forEach((t) => { t.enabled = !t.enabled; });
      setCameraOff(!cameraOff);
    }
  }

  if (status === "not-found") {
    return (
      <div className="min-h-screen bg-[#080d19] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-white/60 mb-2">Meeting not found</h1>
          <p className="text-sm text-white/30">This meeting link may have expired or is invalid.</p>
        </div>
      </div>
    );
  }

  if (status === "ended") {
    return (
      <div className="min-h-screen bg-[#080d19] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-white/60 mb-2">Meeting ended</h1>
          <p className="text-sm text-white/30">Thanks for joining. You can close this tab.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080d19] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-3xl space-y-4">
        {/* Header */}
        <div className="text-center mb-4">
          <h1 className="text-lg font-semibold text-white/70">Slushie Meeting</h1>
          {status === "ready" && (
            <p className="text-sm text-white/30 mt-1">Ready to join</p>
          )}
          {status === "connecting" && (
            <p className="text-sm text-yellow-400/60 mt-1">Connecting...</p>
          )}
          {status === "connected" && (
            <p className="text-sm text-green-400/60 mt-1">Connected</p>
          )}
        </div>

        {/* Join button (before joining) */}
        {status === "ready" && (
          <div className="flex justify-center">
            <button
              onClick={handleJoin}
              className="px-8 py-3 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
            >
              Join Meeting
            </button>
          </div>
        )}

        {/* Video feeds (after joining) */}
        {(status === "connecting" || status === "connected") && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
                <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                <div className="absolute bottom-2 left-2 text-[0.55rem] text-white/40 bg-black/50 px-1.5 py-0.5 rounded">You</div>
              </div>
              <div className="relative rounded-lg overflow-hidden bg-black/50 aspect-video flex items-center justify-center">
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                {status !== "connected" && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs text-white/20">Connecting to host...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={toggleMute}
                className={`p-3 rounded-full transition-colors ${
                  muted ? "bg-red-500/20 text-red-400" : "bg-white/[0.08] text-white/60 hover:text-white/80"
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>

              <button
                onClick={toggleCamera}
                className={`p-3 rounded-full transition-colors ${
                  cameraOff ? "bg-red-500/20 text-red-400" : "bg-white/[0.08] text-white/60 hover:text-white/80"
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </button>

              <button
                onClick={handleLeave}
                className="px-6 py-3 rounded-full bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
              >
                Leave
              </button>
            </div>
          </>
        )}

        {/* Branding */}
        <div className="text-center mt-8">
          <span className="text-[0.55rem] text-white/15">Powered by slushie.machine</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/meet/
git commit -m "feat: add guest join page for live video meetings"
```

---

### Task 8: Integrate Live Meeting into Notes Pane

**Files:**
- Modify: `src/components/pane-notes.tsx`

- [ ] **Step 1: Add live meeting state and button to pane-notes**

In `src/components/pane-notes.tsx`, make these changes:

**Add import at top:**
```typescript
import { LiveMeeting } from "./live-meeting";
```

**Add state after existing state declarations (after `const [creating, setCreating] = useState(false);`):**
```typescript
  const [liveMeeting, setLiveMeeting] = useState<{ meetingId: string; roomCode: string } | null>(null);
```

**Add the "Start Live Meeting" button.** Find the type selector buttons (the `flex gap-2` div with the three `audio_upload`, `text_note`, `handwritten` buttons). Change the array from:
```tsx
{(["audio_upload", "text_note", "handwritten"] as const).map((t) => (
```
to:
```tsx
{(["live_video", "audio_upload", "text_note", "handwritten"] as const).map((t) => (
```

And update the label mapping inside that same button. Change:
```tsx
{t === "audio_upload" ? "Upload Recording" : t === "text_note" ? "Text Note" : "Handwritten"}
```
to:
```tsx
{t === "live_video" ? "Live Meeting" : t === "audio_upload" ? "Upload Recording" : t === "text_note" ? "Text Note" : "Handwritten"}
```

**Add the "Start Live Meeting" handler.** Find the `handleCreateNote` function. At the very top, before the existing logic, add a branch for live_video:

```typescript
    if (newNoteType === "live_video") {
      try {
        const res = await fetch("/api/meetings/live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: selectedClientId,
            projectId: newNoteProjectId || null,
          }),
        });
        const data = await res.json();
        setLiveMeeting({ meetingId: data.meetingId, roomCode: data.roomCode });
        setShowNewNote(false);
        setNewNoteType(null);
      } finally {
        setCreating(false);
      }
      return;
    }
```

**Render the LiveMeeting component when active.** Find the return statement's opening `<div>`. Right after the client selector `</div>` (the select dropdown for clients) and BEFORE the `{showNewNote && (` block, add:

```tsx
      {/* Live meeting in progress */}
      {liveMeeting && (
        <div className="mb-6">
          <LiveMeeting
            meetingId={liveMeeting.meetingId}
            roomCode={liveMeeting.roomCode}
            onEnd={() => {
              setLiveMeeting(null);
              loadNotes();
            }}
          />
        </div>
      )}
```

**Also hide the "New Note" form and notes list while in a live meeting.** Wrap the `{showNewNote && (` block and everything after it (the notes list) with:

```tsx
      {!liveMeeting && (
        <>
          {/* ... existing showNewNote and notes list code ... */}
        </>
      )}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/pane-notes.tsx
git commit -m "feat: integrate live meeting into Notes pane"
```

---

### Task 9: Build, Test, Fix

**Files:**
- All files from tasks 1-8

- [ ] **Step 1: Build**

```bash
cd /Users/ryanhaugland/slushie-machine
rm -rf .next && npx next build
```

- [ ] **Step 2: Restart**

```bash
pm2 restart slushie-next slushie-inngest
```

- [ ] **Step 3: Smoke test**

1. Click Notes → select a client → click "+ New Note" → verify "Live Meeting" button appears
2. Click "Live Meeting" → verify a room is created and shareable link shown
3. Open the shareable link in an incognito tab → verify guest page loads with "Join Meeting" button
4. Click "Join Meeting" on guest side → verify video connects
5. End meeting on host side → verify it processes (transcription + summary + feature extraction)

- [ ] **Step 4: Fix any issues**

```bash
git add -A
git commit -m "fix: address build and integration issues from live meeting implementation"
```

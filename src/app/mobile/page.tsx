"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Project = { id: string; name: string; clientName: string; deployStatus: string };
type Meeting = {
  id: string;
  status: string;
  summary?: string;
  transcript?: string;
  suggestions?: { suggestedTitle: string }[];
};

/* ─── helpers ─── */
function StatusDot({ status }: { status: string }) {
  const color =
    status === "ready"
      ? "bg-green-400"
      : status === "building"
        ? "bg-yellow-400 animate-pulse"
        : "bg-white/20";
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

/* ─── main ─── */
function MobileInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedProject = searchParams.get("project");

  const [user, setUser] = useState<any>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(preselectedProject);
  const [mode, setMode] = useState<"pick" | "notes" | "record" | "video" | "status">("pick");
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);

  // Recording state
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const meetingIdRef = useRef<string | null>(null);
  const chunkIndexRef = useRef(0);

  // Video call state
  const [inCall, setInCall] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  // Build status
  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null);
  const [buildFeatures, setBuildFeatures] = useState<any[]>([]);

  // Client share
  const [shareInfo, setShareInfo] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  /* ─── auth + projects ─── */
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) {
          router.push("/login");
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setUser(data);
        const all: Project[] = [];
        for (const m of data.memberships || []) {
          for (const c of m.workspace?.clients || []) {
            for (const p of c.projects || []) {
              all.push({ id: p.id, name: p.name, clientName: c.name, deployStatus: p.deployStatus || "idle" });
            }
          }
        }
        setProjects(all);
      } catch {
        if (!cancelled) router.push("/login");
      }
    }
    load();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── poll active meeting status ─── */
  useEffect(() => {
    if (!activeMeeting || activeMeeting.status === "ready") return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/notes?projectId=${selectedProjectId}`, { cache: "no-store" });
      const notes = await res.json();
      const found = notes.find((n: any) => n.id === activeMeeting.id);
      if (found) setActiveMeeting(found);
    }, 3000);
    return () => clearInterval(interval);
  }, [activeMeeting, selectedProjectId]);

  /* ─── poll build features ─── */
  useEffect(() => {
    if (mode !== "status" || !selectedProjectId) return;
    const load = async () => {
      const res = await fetch(`/api/projects/${selectedProjectId}`, { cache: "no-store" });
      const data = await res.json();
      const all = [
        ...(data.features || []),
        ...(data.features || []).flatMap((f: any) => f.children || []),
      ];
      setBuildFeatures(all);
    };
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
  }, [mode, selectedProjectId]);

  /* ─── upload chunk ─── */
  const uploadChunk = useCallback(async (blob: Blob) => {
    if (!meetingIdRef.current) return;
    const fd = new FormData();
    fd.append("chunk", blob);
    fd.append("index", String(chunkIndexRef.current).padStart(4, "0"));
    chunkIndexRef.current++;
    await fetch(`/api/meetings/${meetingIdRef.current}/chunks`, { method: "POST", body: fd });
  }, []);

  /* ─── start recording ─── */
  async function startRecording() {
    // Create meeting first
    const meetRes = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: selectedProjectId,
        type: "audio_upload",
        source: "internal",
      }),
    });
    const meeting = await meetRes.json();
    meetingIdRef.current = meeting.id;
    chunkIndexRef.current = 0;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) uploadChunk(e.data);
    };
    recorder.start(30000);
    setRecording(true);
    setRecordingTime(0);
    timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
  }

  /* ─── stop recording ─── */
  async function stopRecording() {
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);

    // End meeting — triggers transcription pipeline
    if (meetingIdRef.current) {
      await fetch(`/api/meetings/${meetingIdRef.current}/end`, { method: "POST" });
      setActiveMeeting({ id: meetingIdRef.current, status: "uploading" });
      setMode("status");
    }
  }

  /* ─── start video call ─── */
  async function startVideoCall() {
    const res = await fetch("/api/meetings/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: selectedProjectId }),
    });
    const data = await res.json();
    meetingIdRef.current = data.meetingId;
    setRoomCode(data.roomCode);
    chunkIndexRef.current = 0;

    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    streamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;

    // Start audio recording in the background
    const audioStream = new MediaStream(stream.getAudioTracks());
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(audioStream, { mimeType });
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) uploadChunk(e.data);
    };
    recorder.start(30000);
    setInCall(true);
    setRecordingTime(0);
    timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
  }

  /* ─── end video call ─── */
  async function endVideoCall() {
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    setInCall(false);
    setRoomCode(null);

    if (meetingIdRef.current) {
      await fetch(`/api/meetings/${meetingIdRef.current}/end`, { method: "POST" });
      setActiveMeeting({ id: meetingIdRef.current, status: "uploading" });
      setMode("status");
    }
  }

  /* ─── save text note ─── */
  async function saveNote() {
    if (!noteText.trim()) return;
    setSaving(true);
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: selectedProjectId,
        type: "text_note",
        textContent: noteText.trim(),
        source: "internal",
      }),
    });
    const meeting = await res.json();
    setActiveMeeting({ id: meeting.id, status: "extracting" });
    setNoteText("");
    setSaving(false);
    setMode("status");
  }

  /* ─── generate client share ─── */
  async function generateShareLink() {
    if (!selectedProjectId) return;
    const res = await fetch(`/api/projects/${selectedProjectId}/client-access`, { method: "POST" });
    const data = await res.json();
    setShareInfo(data);
  }

  /* ─── format time ─── */
  function formatTime(secs: number) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f1729]">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-6 h-6 text-white/20 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-white/30">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0f1729]">
      {/* Header */}
      <header className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => router.push("/")} className="text-white/40 hover:text-white/70">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-medium bg-gradient-to-r from-red-400 to-blue-400 bg-clip-text text-transparent">
            slushie mobile
          </span>
        </div>
        {selectedProject && (
          <button
            onClick={() => { setSelectedProjectId(null); setMode("pick"); }}
            className="text-xs text-white/40 hover:text-white/60"
          >
            {selectedProject.name}
          </button>
        )}
      </header>

      <main className="flex-1 p-4 overflow-y-auto">
        {/* ─── PROJECT PICKER ─── */}
        {!selectedProjectId && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-white/60 mb-4">Select a project</h2>
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => { setSelectedProjectId(p.id); setMode("pick"); }}
                className="w-full flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors"
              >
                <div className="text-left">
                  <div className="text-sm font-medium text-white/80">{p.name}</div>
                  <div className="text-xs text-white/40">{p.clientName}</div>
                </div>
                <StatusDot status={p.deployStatus === "running" ? "ready" : "idle"} />
              </button>
            ))}
            {projects.length === 0 && (
              <p className="text-sm text-white/30 text-center py-8">No projects yet</p>
            )}
          </div>
        )}

        {/* ─── MODE PICKER ─── */}
        {selectedProjectId && mode === "pick" && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-white/60 mb-4">What would you like to do?</h2>

            <button
              onClick={() => setMode("notes")}
              className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-white/80">Type Notes</div>
                <div className="text-xs text-white/40">Write notes and let AI analyze them</div>
              </div>
            </button>

            <button
              onClick={() => setMode("record")}
              className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                </svg>
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-white/80">Record Audio</div>
                <div className="text-xs text-white/40">Record and transcribe with AI</div>
              </div>
            </button>

            <button
              onClick={() => setMode("video")}
              className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9.75a2.25 2.25 0 002.25-2.25V7.5a2.25 2.25 0 00-2.25-2.25H4.5A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-white/80">Video Chat</div>
                <div className="text-xs text-white/40">Meet with your client, AI listens live</div>
              </div>
            </button>

            {/* Quick status check */}
            <button
              onClick={() => setMode("status")}
              className="w-full flex items-center gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors mt-6"
            >
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-white/80">Build Status</div>
                <div className="text-xs text-white/40">Check builds, preview, and share</div>
              </div>
            </button>
          </div>
        )}

        {/* ─── TYPE NOTES ─── */}
        {mode === "notes" && (
          <div className="space-y-4">
            <button onClick={() => setMode("pick")} className="text-xs text-white/40 hover:text-white/60 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <h2 className="text-sm font-medium text-white/60">Type your notes</h2>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="What did the client say? What features do they want? Any requirements or feedback..."
              className="w-full h-48 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/[0.15] resize-none"
              autoFocus
            />
            <button
              onClick={saveNote}
              disabled={saving || !noteText.trim()}
              className="w-full py-3 text-sm rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {saving ? "Saving..." : "Save & Analyze"}
            </button>
          </div>
        )}

        {/* ─── RECORD AUDIO ─── */}
        {mode === "record" && (
          <div className="space-y-6">
            <button onClick={() => { if (recording) return; setMode("pick"); }} className="text-xs text-white/40 hover:text-white/60 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>

            <div className="flex flex-col items-center gap-6 py-8">
              {recording && (
                <div className="text-3xl font-light text-white/70 tabular-nums">
                  {formatTime(recordingTime)}
                </div>
              )}

              <button
                onClick={recording ? stopRecording : startRecording}
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                  recording
                    ? "bg-red-500 hover:bg-red-600 animate-pulse"
                    : "bg-white/[0.06] border-2 border-red-400 hover:bg-red-500/10"
                }`}
              >
                {recording ? (
                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                ) : (
                  <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                  </svg>
                )}
              </button>

              <p className="text-xs text-white/30">
                {recording ? "Tap to stop recording" : "Tap to start recording"}
              </p>
            </div>
          </div>
        )}

        {/* ─── VIDEO CHAT ─── */}
        {mode === "video" && (
          <div className="space-y-4">
            {!inCall ? (
              <>
                <button onClick={() => setMode("pick")} className="text-xs text-white/40 hover:text-white/60 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
                <div className="flex flex-col items-center gap-6 py-8">
                  <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                    <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9.75a2.25 2.25 0 002.25-2.25V7.5a2.25 2.25 0 00-2.25-2.25H4.5A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  </div>
                  <p className="text-sm text-white/50 text-center">Start a video call. Audio is recorded and analyzed by AI in real time.</p>
                  <button
                    onClick={startVideoCall}
                    className="px-8 py-3 text-sm rounded-xl bg-gradient-to-r from-green-500 to-green-600 text-white font-medium hover:opacity-90 transition-opacity"
                  >
                    Start Call
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
                  <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                  <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 rounded-lg px-2.5 py-1">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs text-white/80 tabular-nums">{formatTime(recordingTime)}</span>
                  </div>
                  {roomCode && (
                    <div className="absolute top-3 right-3 bg-black/60 rounded-lg px-2.5 py-1">
                      <span className="text-xs text-white/60">Room: {roomCode}</span>
                    </div>
                  )}
                </div>

                {roomCode && (
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                    <p className="text-xs text-white/40 mb-1">Invite link for client:</p>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/meet/${roomCode}`);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300 break-all"
                    >
                      {copied ? "Copied!" : `Copy meeting link`}
                    </button>
                  </div>
                )}

                <button
                  onClick={endVideoCall}
                  className="w-full py-3 text-sm rounded-xl bg-red-500 text-white font-medium hover:bg-red-600 transition-colors"
                >
                  End Call
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── BUILD STATUS ─── */}
        {mode === "status" && (
          <div className="space-y-4">
            <button onClick={() => setMode("pick")} className="text-xs text-white/40 hover:text-white/60 flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>

            {/* Active meeting processing */}
            {activeMeeting && activeMeeting.status !== "ready" && (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                    <svg className="w-4 h-4 text-yellow-400 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm text-white/70 font-medium">Processing</div>
                    <div className="text-xs text-white/40">
                      {activeMeeting.status === "uploading" && "Uploading audio..."}
                      {activeMeeting.status === "transcribing" && "Transcribing with AI..."}
                      {activeMeeting.status === "extracting" && "Analyzing and extracting features..."}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeMeeting && activeMeeting.status === "ready" && (
              <div className="bg-white/[0.03] border border-green-500/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="text-sm text-white/70 font-medium">Analysis Complete</div>
                </div>
                {activeMeeting.summary && (
                  <div className="text-xs text-white/50 leading-relaxed border-t border-white/[0.06] pt-3">
                    {activeMeeting.summary}
                  </div>
                )}
                {activeMeeting.suggestions && activeMeeting.suggestions.length > 0 && (
                  <div className="border-t border-white/[0.06] pt-3">
                    <p className="text-xs text-white/40 mb-2">Suggested features:</p>
                    {activeMeeting.suggestions.map((s, i) => (
                      <div key={i} className="text-xs text-white/60 py-1">
                        &bull; {s.suggestedTitle}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Feature build status */}
            <h3 className="text-xs uppercase tracking-wider text-white/40 mt-4">Features</h3>
            <div className="space-y-2">
              {buildFeatures.length === 0 && (
                <p className="text-xs text-white/30 py-4 text-center">No features yet</p>
              )}
              {buildFeatures.map((f: any) => (
                <div key={f.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <div className="flex items-center gap-2">
                    <StatusDot status={f.status === "done" ? "ready" : f.status === "building" ? "building" : "idle"} />
                    <span className="text-xs text-white/60">{f.title}</span>
                  </div>
                  <span className="text-[0.6rem] text-white/30 uppercase">{f.status}</span>
                </div>
              ))}
            </div>

            {/* Preview button */}
            {selectedProject?.deployStatus === "running" && (
              <a
                href={`/api/preview?projectId=${selectedProjectId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-3 text-sm text-center rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium hover:opacity-90 transition-opacity"
              >
                Open Preview
              </a>
            )}

            {/* Client share link */}
            <div className="border-t border-white/[0.06] pt-4 mt-4">
              <h3 className="text-xs uppercase tracking-wider text-white/40 mb-3">Client Share</h3>
              {!shareInfo ? (
                <button
                  onClick={generateShareLink}
                  className="w-full py-3 text-sm rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/60 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
                >
                  Generate Client Link
                </button>
              ) : (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-3">
                  <p className="text-xs text-white/40">Share these credentials with your client:</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/40">Portal</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/portal/login`);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        {copied ? "Copied!" : "Copy link"}
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/40">Email</span>
                      <span className="text-xs text-white/70 font-mono">{shareInfo.email}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/40">Password</span>
                      <span className="text-xs text-white/70 font-mono">{shareInfo.password}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function MobilePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#0f1729]">
        <span className="text-sm text-white/30">Loading...</span>
      </div>
    }>
      <MobileInner />
    </Suspense>
  );
}

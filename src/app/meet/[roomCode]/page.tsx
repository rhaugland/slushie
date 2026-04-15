"use client";

import { useState, useEffect, useRef, useCallback, use } from "react";
import { useSearchParams } from "next/navigation";
import { SignalChannel } from "@/lib/webrtc-signal";

export default function MeetPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = use(params);
  const searchParams = useSearchParams();
  const isHost = searchParams.get("host") === "1";
  const meetingId = searchParams.get("mid");

  const [status, setStatus] = useState<"loading" | "ready" | "waiting" | "connecting" | "connected" | "ended" | "not-found">(
    isHost ? "loading" : "loading"
  );
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [copied, setCopied] = useState(false);
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

  function copyLink() {
    navigator.clipboard.writeText(meetingLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Upload audio chunk (host only)
  const uploadChunk = useCallback(async (blob: Blob) => {
    if (!meetingId) return;
    const formData = new FormData();
    formData.append("chunk", blob, "chunk.webm");
    formData.append("index", String(chunkIndexRef.current));
    chunkIndexRef.current += 1;
    setChunkCount((c) => c + 1);
    await fetch(`/api/meetings/${meetingId}/chunks`, { method: "POST", body: formData });
  }, [meetingId]);

  // Start audio recording (host only)
  const startRecording = useCallback((stream: MediaStream) => {
    const audioStream = new MediaStream(stream.getAudioTracks());
    const recorder = new MediaRecorder(audioStream, {
      mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm",
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) uploadChunk(e.data);
    };
    recorder.start(30000);
    recorderRef.current = recorder;
  }, [uploadChunk]);

  // Check room exists (guest only)
  useEffect(() => {
    if (isHost) return;
    fetch(`/api/meetings/live/${roomCode}`)
      .then((res) => {
        if (res.ok) setStatus("ready");
        else setStatus("not-found");
      })
      .catch(() => setStatus("not-found"));
  }, [roomCode, isHost]);

  // Attach local stream to video element whenever ref becomes available
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  });

  // Auto-start for host
  useEffect(() => {
    if (!isHost) return;
    // Show the video UI immediately so refs are mounted
    setStatus("waiting");
    let cancelled = false;

    async function init() {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      startRecording(stream);

      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
          setStatus("connected");
        }
      };

      const signal = new SignalChannel(roomCode, "host", async (msg) => {
        if (msg.type === "offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          signal.send("answer", answer);
        } else if (msg.type === "answer") {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
        } else if (msg.type === "ice-candidate") {
          if (msg.data) await pc.addIceCandidate(new RTCIceCandidate(msg.data));
        } else if (msg.type === "join") {
          setStatus("connecting");
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          signal.send("offer", offer);
        }
      });
      signalRef.current = signal;

      pc.onicecandidate = (event) => {
        if (event.candidate) signal.send("ice-candidate", event.candidate.toJSON());
      };

      signal.startPolling(500);
      setStatus("waiting");
    }

    init();
    return () => {
      cancelled = true;
      signalRef.current?.stopPolling();
      pcRef.current?.close();
      recorderRef.current?.stop();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [roomCode, isHost, startRecording]);

  // Guest join
  async function handleJoin() {
    setStatus("connecting");
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;

    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pcRef.current = pc;
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        setStatus("connected");
      }
    };

    const signal = new SignalChannel(roomCode, "guest", async (msg) => {
      if (msg.type === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signal.send("answer", answer);
      } else if (msg.type === "ice-candidate") {
        if (msg.data) await pc.addIceCandidate(new RTCIceCandidate(msg.data));
      }
    });
    signalRef.current = signal;

    pc.onicecandidate = (event) => {
      if (event.candidate) signal.send("ice-candidate", event.candidate.toJSON());
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "closed") setStatus("ended");
    };

    signal.send("join", {});
    signal.startPolling(500);
  }

  async function handleEnd() {
    setStatus("ended");
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    signalRef.current?.stopPolling();
    pcRef.current?.close();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());

    if (isHost && meetingId) {
      await new Promise((r) => setTimeout(r, 1000));
      await fetch(`/api/meetings/${meetingId}/end`, { method: "POST" });
    }
  }

  function toggleMute() {
    const tracks = localStreamRef.current?.getAudioTracks();
    if (tracks) { tracks.forEach((t) => { t.enabled = !t.enabled; }); setMuted(!muted); }
  }

  function toggleCamera() {
    const tracks = localStreamRef.current?.getVideoTracks();
    if (tracks) { tracks.forEach((t) => { t.enabled = !t.enabled; }); setCameraOff(!cameraOff); }
  }

  if (status === "not-found") {
    return (
      <div className="h-screen bg-[#080d19] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-white/60 mb-2">Meeting not found</h1>
          <p className="text-sm text-white/30">This meeting link may have expired or is invalid.</p>
        </div>
      </div>
    );
  }

  if (status === "ended") {
    return (
      <div className="h-screen bg-[#080d19] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-white/60 mb-2">Meeting ended</h1>
          <p className="text-sm text-white/30">
            {isHost ? "Audio is being processed. You can close this tab." : "Thanks for joining. You can close this tab."}
          </p>
        </div>
      </div>
    );
  }

  // Pre-join screen for guest
  if (!isHost && status === "ready") {
    return (
      <div className="h-screen bg-[#080d19] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-white/70 mb-2">Slushie Meeting</h1>
          <p className="text-sm text-white/30 mb-6">Ready to join</p>
          <button
            onClick={handleJoin}
            className="px-8 py-3 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
          >
            Join Meeting
          </button>
          <div className="mt-8">
            <span className="text-[0.55rem] text-white/15">Powered by slushie.machine</span>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (status === "loading") {
    return (
      <div className="h-screen bg-[#080d19] flex items-center justify-center">
        <span className="text-sm text-white/30">Loading...</span>
      </div>
    );
  }

  // Main meeting view (host waiting/connecting/connected, guest connecting/connected)
  return (
    <div className="h-screen bg-[#080d19] flex flex-col">
      {/* Share link bar (host only, while waiting) */}
      {isHost && (status === "waiting" || status === "connecting") && (
        <div className="shrink-0 px-4 py-3 bg-[#0a1020] border-b border-white/[0.06]">
          <div className="flex items-center gap-3 max-w-2xl mx-auto">
            <span className="text-xs text-white/40 shrink-0">Share with your client:</span>
            <code className="flex-1 text-xs text-blue-400 bg-white/[0.04] px-3 py-1.5 rounded truncate">
              {meetingLink}
            </code>
            <button
              onClick={copyLink}
              className="px-4 py-1.5 text-xs rounded-lg bg-white/[0.08] text-white/60 hover:text-white/80 transition-colors shrink-0"
            >
              {copied ? "Copied!" : "Copy Link"}
            </button>
          </div>
        </div>
      )}

      {/* Video area — fills remaining space */}
      <div className="flex-1 flex items-center justify-center p-4 min-h-0">
        <div className="grid grid-cols-2 gap-4 w-full h-full max-h-[calc(100vh-140px)]">
          {/* Local video */}
          <div className="relative rounded-xl overflow-hidden bg-black">
            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            <div className="absolute bottom-3 left-3 text-xs text-white/50 bg-black/60 px-2 py-1 rounded-md">
              You {isHost && "(Host)"}
            </div>
          </div>
          {/* Remote video */}
          <div className="relative rounded-xl overflow-hidden bg-black/50">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            {status !== "connected" && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-white/10 border-t-white/40 rounded-full animate-spin mx-auto mb-3" />
                  <span className="text-sm text-white/30">
                    {isHost ? "Waiting for guest to join..." : "Connecting to host..."}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls bar */}
      <div className="shrink-0 flex items-center justify-center gap-4 py-4 bg-[#0a1020] border-t border-white/[0.06]">
        {/* Status */}
        <div className="flex items-center gap-2 mr-4">
          <span className={`w-2 h-2 rounded-full ${
            status === "connected" ? "bg-green-400 animate-pulse" :
            status === "connecting" ? "bg-yellow-400 animate-pulse" :
            "bg-white/20"
          }`} />
          <span className="text-xs text-white/40">
            {status === "waiting" ? "Waiting..." : status === "connecting" ? "Connecting..." : status === "connected" ? "Connected" : ""}
          </span>
          {isHost && chunkCount > 0 && (
            <span className="text-[0.55rem] text-white/20 ml-2">({chunkCount} chunks recorded)</span>
          )}
        </div>

        <button
          onClick={toggleMute}
          className={`p-3 rounded-full transition-colors ${
            muted ? "bg-red-500/20 text-red-400" : "bg-white/[0.08] text-white/60 hover:text-white/80"
          }`}
          title={muted ? "Unmute" : "Mute"}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          className="px-8 py-3 rounded-full bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
        >
          {isHost ? "End Meeting" : "Leave"}
        </button>
      </div>
    </div>
  );
}

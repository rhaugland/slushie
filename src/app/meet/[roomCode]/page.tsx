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

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

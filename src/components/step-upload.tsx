"use client";

import { useState, useCallback } from "react";

export function StepUpload({
  clientId,
  onUploadComplete,
}: {
  clientId: string;
  onUploadComplete: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);

      const file = e.dataTransfer.files[0];
      if (!file) return;

      setUploading(true);
      setProgress("Uploading audio file...");

      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      const { url } = await uploadRes.json();

      setProgress("Creating meeting record...");

      await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, audioUrl: url }),
      });

      setProgress("Transcription started!");
      onUploadComplete();
    },
    [clientId, onUploadComplete]
  );

  return (
    <div>
      <h3 className="text-base font-semibold text-[#f1f5f9] mb-1">Upload Meeting Recording</h3>
      <p className="text-xs text-white/40 mb-4">Drag and drop any audio file — mp3, wav, m4a, webm, ogg, flac</p>

      {uploading ? (
        <div className="flex items-center gap-3 py-8">
          <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-sm text-blue-300">{progress}</span>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl py-16 text-center transition-colors cursor-pointer ${
            dragging
              ? "border-blue-500 bg-blue-500/10"
              : "border-white/15 hover:border-white/25"
          }`}
        >
          <div className="text-3xl mb-2">{dragging ? "🎯" : "🎙️"}</div>
          <p className="text-sm text-white/50">
            {dragging ? "Drop it!" : "Drag & drop your audio file here"}
          </p>
        </div>
      )}
    </div>
  );
}

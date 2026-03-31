"use client";

import { useState } from "react";

export function TranscriptViewer({ transcript }: { transcript: string | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!transcript) return null;

  return (
    <div className="mt-4 border-t border-white/[0.06] pt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-white/30 hover:text-white/50 transition-colors"
      >
        {expanded ? "▼ Hide transcript" : "▶ View transcript"}
      </button>
      {expanded && (
        <div className="mt-2 p-3 bg-white/[0.02] rounded-lg max-h-64 overflow-y-auto">
          <p className="text-xs text-white/40 leading-relaxed whitespace-pre-wrap">
            {transcript}
          </p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";

type Suggestion = {
  id: string;
  suggestedTitle: string;
  suggestedDescription: string;
  suggestedPriority: string | null;
  suggestedParentTitle: string | null;
  status: string;
};

type Props = {
  meeting: {
    id: string;
    audioUrl: string;
    transcript: string | null;
    status: string;
    createdAt: string;
    suggestions: Suggestion[];
  };
  projectId: string;
  existingFeatures: { id: string; title: string }[];
  onUpdate: () => void;
};

export function PaneMeeting({ meeting, projectId, existingFeatures, onUpdate }: Props) {
  const [showTranscript, setShowTranscript] = useState(false);

  const pending = meeting.suggestions.filter((s) => s.status === "pending");
  const accepted = meeting.suggestions.filter((s) => s.status === "accepted");
  const dismissed = meeting.suggestions.filter((s) => s.status === "dismissed");

  async function handleAccept(suggestionId: string, parentId: string | null) {
    await fetch(`/api/suggestions/${suggestionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "accepted", parentId }),
    });
    onUpdate();
  }

  async function handleDismiss(suggestionId: string) {
    await fetch(`/api/suggestions/${suggestionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    });
    onUpdate();
  }

  const date = new Date(meeting.createdAt).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div>
      <h2 className="text-xl font-semibold text-[#f1f5f9] mb-1">Meeting</h2>
      <p className="text-xs text-white/40 mb-4">{date}</p>

      {meeting.status !== "ready" && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4">
          <div className="text-xs text-yellow-400 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            {meeting.status === "transcribing" && "Transcribing audio..."}
            {meeting.status === "extracting" && "Extracting feature suggestions..."}
            {meeting.status === "uploading" && "Processing upload..."}
          </div>
        </div>
      )}

      {meeting.audioUrl && (
        <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.08] mb-4">
          <audio controls className="w-full h-8" src={meeting.audioUrl}>
            <track kind="captions" />
          </audio>
        </div>
      )}

      {meeting.transcript && (
        <div className="mb-6">
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            className="text-xs text-white/30 hover:text-white/50 transition-colors mb-2"
          >
            {showTranscript ? "Hide transcript" : "Show transcript"}
          </button>
          {showTranscript && (
            <div className="bg-white/[0.03] rounded-lg p-4 border border-white/[0.08] max-h-60 overflow-y-auto">
              <p className="text-xs text-white/50 whitespace-pre-wrap leading-relaxed">
                {meeting.transcript}
              </p>
            </div>
          )}
        </div>
      )}

      {pending.length > 0 && (
        <div className="mb-6">
          <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-3">
            Feature suggestions ({pending.length})
          </div>
          <div className="space-y-3">
            {pending.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                existingFeatures={existingFeatures}
                onAccept={handleAccept}
                onDismiss={handleDismiss}
              />
            ))}
          </div>
        </div>
      )}

      {accepted.length > 0 && (
        <div className="mb-4">
          <div className="text-[0.6rem] uppercase tracking-widest text-green-400/50 mb-2">
            Accepted ({accepted.length})
          </div>
          {accepted.map((s) => (
            <div key={s.id} className="text-xs text-white/30 py-1">
              {s.suggestedTitle}
            </div>
          ))}
        </div>
      )}

      {dismissed.length > 0 && (
        <div>
          <div className="text-[0.6rem] uppercase tracking-widest text-white/20 mb-2">
            Dismissed ({dismissed.length})
          </div>
          {dismissed.map((s) => (
            <div key={s.id} className="text-xs text-white/20 py-1 line-through">
              {s.suggestedTitle}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  existingFeatures,
  onAccept,
  onDismiss,
}: {
  suggestion: Suggestion;
  existingFeatures: { id: string; title: string }[];
  onAccept: (id: string, parentId: string | null) => void;
  onDismiss: (id: string) => void;
}) {
  const [parentId, setParentId] = useState<string | null>(null);

  const priorityColor: Record<string, string> = {
    high: "text-red-400 bg-red-500/10",
    medium: "text-yellow-400 bg-yellow-500/10",
    low: "text-white/40 bg-white/[0.06]",
  };

  return (
    <div className="bg-white/[0.03] rounded-lg p-4 border border-white/[0.08]">
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-sm font-medium text-white/80">{suggestion.suggestedTitle}</h4>
        {suggestion.suggestedPriority && (
          <span className={`text-[0.55rem] px-1.5 py-0.5 rounded ${
            priorityColor[suggestion.suggestedPriority] || priorityColor.low
          }`}>
            {suggestion.suggestedPriority}
          </span>
        )}
      </div>
      <p className="text-xs text-white/40 mb-3">{suggestion.suggestedDescription}</p>

      {suggestion.suggestedParentTitle && (
        <p className="text-[0.6rem] text-blue-400/60 mb-2">
          Suggested parent: {suggestion.suggestedParentTitle}
        </p>
      )}

      {existingFeatures.length > 0 && (
        <select
          value={parentId || ""}
          onChange={(e) => setParentId(e.target.value || null)}
          className="w-full bg-white/[0.03] border border-white/10 rounded px-2 py-1 text-xs text-white/60 mb-3 focus:outline-none"
        >
          <option value="">Add as major feature</option>
          {existingFeatures.map((f) => (
            <option key={f.id} value={f.id}>
              Under: {f.title}
            </option>
          ))}
        </select>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onAccept(suggestion.id, parentId)}
          className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors"
        >
          Add to tree
        </button>
        <button
          onClick={() => onDismiss(suggestion.id)}
          className="px-3 py-1.5 text-xs rounded-md text-white/30 hover:text-white/50 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

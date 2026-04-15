"use client";

import { useState, useEffect, useCallback } from "react";
import { LiveMeeting } from "./live-meeting";

type Suggestion = {
  id: string;
  suggestedTitle: string;
  suggestedDescription: string;
  suggestedPriority: string | null;
  status: string;
};

type MeetingNote = {
  id: string;
  type: string;
  source: string;
  status: string;
  summary: string | null;
  transcript: string | null;
  textContent: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
  createdAt: string;
  createdByName: string | null;
  createdBy: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  suggestions: Suggestion[];
  wishlistItems: { id: string; status: string }[];
  clientId: string | null;
  projectId: string | null;
};

type WorkspaceMembership = {
  workspaceId: string;
  role: string;
  workspace: { id: string; name: string; slug: string; clients: any[] };
};

type Props = {
  workspaces: WorkspaceMembership[];
  projectId?: string | null;
};

const TYPE_ICONS: Record<string, string> = {
  audio_upload: "Mic",
  live_video: "Video",
  text_note: "Text",
  handwritten: "Image",
};

export function PaneNotes({ workspaces, projectId }: Props) {
  const allProjects = workspaces.flatMap((m) =>
    m.workspace.clients.flatMap((c: any) =>
      (c.projects || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        clientId: c.id,
        clientName: c.name,
      }))
    )
  );

  const [selectedProjectId, setSelectedProjectId] = useState<string>(allProjects[0]?.id || "");

  useEffect(() => {
    if (projectId) setSelectedProjectId(projectId);
  }, [projectId]);

  const [sourceFilter, setSourceFilter] = useState<"all" | "internal" | "client">("all");
  const [notes, setNotes] = useState<MeetingNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  const [showNewNote, setShowNewNote] = useState(false);
  const [newNoteType, setNewNoteType] = useState<string | null>(null);
  const [newNoteText, setNewNoteText] = useState("");
  const [newNoteFile, setNewNoteFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [liveMeeting, setLiveMeeting] = useState<{ meetingId: string; roomCode: string } | null>(null);
  const [generating, setGenerating] = useState(false);

  async function generateSamples() {
    if (!selectedProjectId || generating) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/demo/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProjectId, type: "notes" }),
      });
      if (res.ok) await loadNotes();
    } finally {
      setGenerating(false);
    }
  }

  const loadNotes = useCallback(async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/notes?projectId=${selectedProjectId}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setNotes(data);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  useEffect(() => {
    const anyProcessing = notes.some((n) =>
      ["uploading", "transcribing", "extracting"].includes(n.status)
    );
    if (!anyProcessing) return;
    const interval = setInterval(loadNotes, 3000);
    return () => clearInterval(interval);
  }, [notes, loadNotes]);

  async function handleCreateNote() {
    if (!newNoteType || !selectedProjectId) return;
    setCreating(true);

    if (newNoteType === "live_video") {
      try {
        const res = await fetch("/api/meetings/live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: selectedProjectId,
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

    try {
      let audioUrl: string | undefined;
      let imageUrl: string | undefined;

      if (newNoteFile && (newNoteType === "audio_upload" || newNoteType === "handwritten")) {
        const formData = new FormData();
        formData.append("file", newNoteFile);
        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        const uploadData = await uploadRes.json();
        if (newNoteType === "audio_upload") audioUrl = uploadData.url;
        if (newNoteType === "handwritten") imageUrl = uploadData.url;
      }

      await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          type: newNoteType,
          audioUrl,
          imageUrl,
          textContent: newNoteType === "text_note" ? newNoteText : undefined,
        }),
      });

      setShowNewNote(false);
      setNewNoteType(null);
      setNewNoteText("");
      setNewNoteFile(null);
      loadNotes();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-[#f1f5f9]">Notes</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={generateSamples}
            disabled={generating}
            className="px-3 py-1.5 text-xs rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 hover:text-purple-300 disabled:opacity-50 transition-colors"
          >
            {generating ? "Generating..." : "AI Samples"}
          </button>
          <button
            onClick={() => setShowNewNote(!showNewNote)}
            className="px-3 py-1.5 text-xs rounded-lg bg-white/[0.08] text-white/60 hover:text-white/80 hover:bg-white/[0.12] transition-colors"
          >
            + New Note
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <select
          value={selectedProjectId}
          onChange={(e) => { setSelectedProjectId(e.target.value); setExpandedNoteId(null); }}
          className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/20"
        >
          {allProjects.map((p) => (
            <option key={p.id} value={p.id} className="bg-[#0c1120]">
              {p.clientName} / {p.name}
            </option>
          ))}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as "all" | "internal" | "client")}
          className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/20"
        >
          <option value="all" className="bg-[#0c1120]">All Sources</option>
          <option value="internal" className="bg-[#0c1120]">Internal</option>
          <option value="client" className="bg-[#0c1120]">Client</option>
        </select>
      </div>

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

      {!liveMeeting && (
        <>
      {showNewNote && (
        <div className="mb-6 rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
          <div className="text-xs text-white/50 font-medium">Create a Note</div>

          <div className="flex gap-2">
            {(["live_video", "audio_upload", "text_note", "handwritten"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setNewNoteType(t); setNewNoteFile(null); setNewNoteText(""); }}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  newNoteType === t
                    ? "border-white/20 bg-white/[0.08] text-white/80"
                    : "border-white/[0.06] text-white/30 hover:text-white/50"
                }`}
              >
                {t === "live_video" ? "Live Meeting" : t === "audio_upload" ? "Upload Recording" : t === "text_note" ? "Text Note" : "Handwritten"}
              </button>
            ))}
          </div>

          {newNoteType === "text_note" && (
            <textarea
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              placeholder="Type your meeting notes here..."
              rows={6}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 resize-none"
            />
          )}

          {(newNoteType === "audio_upload" || newNoteType === "handwritten") && (
            <input
              type="file"
              accept={newNoteType === "audio_upload" ? "audio/*" : "image/*"}
              onChange={(e) => setNewNoteFile(e.target.files?.[0] || null)}
              className="text-xs text-white/40 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-white/[0.08] file:text-white/60 hover:file:bg-white/[0.12]"
            />
          )}

          <div className="flex gap-2">
            <button
              onClick={handleCreateNote}
              disabled={creating || !newNoteType || (newNoteType === "text_note" && !newNoteText.trim()) || ((newNoteType === "audio_upload" || newNoteType === "handwritten") && !newNoteFile)}
              className="px-4 py-2 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? "Creating..." : "Save & Process"}
            </button>
            <button
              onClick={() => { setShowNewNote(false); setNewNoteType(null); }}
              className="px-4 py-2 text-xs text-white/30 hover:text-white/50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading && notes.length === 0 ? (
        <p className="text-sm text-white/30">Loading...</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-white/30">No notes yet. Create one to get started.</p>
      ) : (
        <div className="space-y-2">
          {notes.filter((n) => sourceFilter === "all" || (n.source || "internal") === sourceFilter).map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              expanded={expandedNoteId === note.id}
              onToggle={() => setExpandedNoteId(expandedNoteId === note.id ? null : note.id)}
              onDelete={async () => {
                await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
                loadNotes();
              }}
              onReload={loadNotes}
            />
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
}

function NoteCard({ note, expanded, onToggle, onDelete, onReload }: {
  note: MeetingNote;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onReload: () => void;
}) {
  const isProcessing = ["uploading", "transcribing", "extracting"].includes(note.status);
  const featureCount = note.suggestions.filter((s) => s.status === "pending").length;

  async function handleAddToWishlist(suggestion: Suggestion) {
    if (!note.clientId) return;
    await fetch("/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: suggestion.suggestedTitle,
        description: suggestion.suggestedDescription,
        clientId: note.clientId,
        projectId: note.projectId,
        priority: suggestion.suggestedPriority,
      }),
    });
    await fetch(`/api/suggestions/${suggestion.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "accepted" }),
    });
    onReload();
  }

  async function handleDismissSuggestion(suggestionId: string) {
    await fetch(`/api/suggestions/${suggestionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    });
    onReload();
  }

  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.02]">
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center gap-3"
      >
        <span className="text-[0.6rem] text-white/30 uppercase shrink-0 w-10">
          {TYPE_ICONS[note.type] || "Note"}
        </span>
        {note.source === "client" && (
          <span className="text-[0.5rem] px-1.5 py-0.5 rounded-full font-medium text-orange-400 bg-orange-400/10 shrink-0">
            Client
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-white/60">
            {new Date(note.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            {note.project && (
              <span className="text-white/30 ml-2">{note.project.name}</span>
            )}
            {(note.createdByName || note.createdBy?.name) && (
              <span className="text-white/25 ml-2">by {note.createdByName || note.createdBy?.name}</span>
            )}
          </div>
          {isProcessing ? (
            <div className="flex items-center gap-1.5 text-[0.6rem] text-yellow-400/60 mt-0.5">
              <span className="w-2 h-2 border border-yellow-400/40 border-t-yellow-400 rounded-full animate-spin" />
              Processing...
            </div>
          ) : note.summary ? (
            <div className="text-[0.6rem] text-white/30 truncate mt-0.5">{note.summary.split("\n")[0]}</div>
          ) : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {featureCount > 0 && (
            <span className="text-[0.55rem] text-yellow-400/60 bg-yellow-400/10 px-1.5 py-0.5 rounded">
              {featureCount} suggestion{featureCount !== 1 ? "s" : ""}
            </span>
          )}
          <svg
            className={`text-white/20 transition-transform ${expanded ? "rotate-180" : ""}`}
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/[0.06] px-4 py-3 space-y-3">
          {note.summary && (
            <div>
              <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-1">Summary</div>
              <div className="text-xs text-white/60 whitespace-pre-wrap">{note.summary}</div>
            </div>
          )}

          {note.audioUrl && (
            <div>
              <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-1">Audio</div>
              <audio controls src={note.audioUrl} className="w-full h-8" />
            </div>
          )}

          {note.imageUrl && (
            <div>
              <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-1">Original Image</div>
              <img src={note.imageUrl} alt="Handwritten note" className="max-w-full rounded-lg border border-white/[0.08]" />
            </div>
          )}

          {note.transcript && (
            <details>
              <summary className="text-[0.6rem] uppercase tracking-widest text-white/30 cursor-pointer hover:text-white/50">
                Transcript
              </summary>
              <pre className="text-[0.6rem] text-white/30 whitespace-pre-wrap mt-1 max-h-48 overflow-y-auto">
                {note.transcript}
              </pre>
            </details>
          )}

          {note.textContent && !note.transcript && (
            <details>
              <summary className="text-[0.6rem] uppercase tracking-widest text-white/30 cursor-pointer hover:text-white/50">
                Original Text
              </summary>
              <pre className="text-[0.6rem] text-white/30 whitespace-pre-wrap mt-1 max-h-48 overflow-y-auto">
                {note.textContent}
              </pre>
            </details>
          )}

          {note.suggestions.length > 0 && (
            <div>
              <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-2">Suggested Features</div>
              <div className="space-y-2">
                {note.suggestions.map((s) => (
                  <div key={s.id} className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            s.status === "accepted" ? "bg-green-400" :
                            s.status === "dismissed" ? "bg-red-400/40" :
                            "bg-yellow-400"
                          }`} />
                          <span className="text-xs text-white/70 font-medium">{s.suggestedTitle}</span>
                          {s.suggestedPriority && (
                            <span className={`text-[0.55rem] px-1.5 py-0.5 rounded ${
                              s.suggestedPriority === "high" ? "text-red-400 bg-red-500/10" :
                              s.suggestedPriority === "medium" ? "text-yellow-400 bg-yellow-500/10" :
                              "text-white/40 bg-white/[0.06]"
                            }`}>
                              {s.suggestedPriority}
                            </span>
                          )}
                        </div>
                        {s.suggestedDescription && (
                          <p className="text-[0.65rem] text-white/35 mt-1 ml-3.5 line-clamp-2">{s.suggestedDescription}</p>
                        )}
                      </div>
                      {s.status === "pending" && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAddToWishlist(s); }}
                            className="px-2 py-1 text-[0.6rem] rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                          >
                            + Wishlist
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDismissSuggestion(s.id); }}
                            className="px-2 py-1 text-[0.6rem] rounded text-white/20 hover:text-white/40 hover:bg-white/[0.04] transition-colors"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                      {s.status === "accepted" && (
                        <span className="text-[0.55rem] text-green-400/60 shrink-0">Added</span>
                      )}
                      {s.status === "dismissed" && (
                        <span className="text-[0.55rem] text-white/20 shrink-0">Dismissed</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-[0.6rem] text-red-400/30 hover:text-red-400/60 transition-colors"
          >
            Delete note
          </button>
        </div>
      )}
    </div>
  );
}

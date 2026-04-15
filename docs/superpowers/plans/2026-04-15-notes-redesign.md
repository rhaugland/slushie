# Notes Pane Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite pane-notes.tsx to split the monolithic notes view into a tabbed interface with View Notes, Review Suggestions, and a Take Notes modal.

**Architecture:** Single component rewrite. The `PaneNotes` component gets a tab bar (View Notes | Review Suggestions) plus a "+ Take Notes" button. View Notes shows a clean read-only card list. Review Suggestions aggregates pending suggestions with accept/dismiss actions. Take Notes opens a modal with Write/Upload/Meet options. All existing API endpoints are reused as-is.

**Tech Stack:** React, Tailwind CSS, existing slushie API endpoints (`/api/notes`, `/api/meetings/live`, `/api/upload`, `/api/suggestions`)

---

## Context

- **Spec:** `docs/superpowers/specs/2026-04-15-notes-redesign.md`
- Current file: `src/components/pane-notes.tsx` (532 lines)
- All API endpoints, backend logic, Inngest pipelines, and database schema stay unchanged
- The `LiveMeeting` component at `src/components/live-meeting.tsx` is used as-is
- Meeting page at `src/app/meet/[roomCode]/page.tsx` is used as-is for the Meet flow

## Critical Files (read before implementing)

- `/Users/ryanhaugland/slushie/src/components/pane-notes.tsx` — Being rewritten
- `/Users/ryanhaugland/slushie/src/components/live-meeting.tsx` — Used for inline live meetings (imported but Meet flow navigates to /meet/ instead)
- `/Users/ryanhaugland/slushie/src/app/meet/[roomCode]/page.tsx` — Full-page meeting view

## File Structure

| Action | File | Purpose |
|--------|------|---------|
| Rewrite | `src/components/pane-notes.tsx` | Tabbed layout with View Notes, Review Suggestions, Take Notes modal |

---

### Task 1: Rewrite pane-notes.tsx

This is a complete rewrite of the file. The new component has:
- Tab bar with "View Notes" and "Review Suggestions" tabs + "+ Take Notes" button
- View Notes tab: clean read-only note cards with type badge, date, summary, expandable transcript, audio player
- Review Suggestions tab: aggregated pending suggestions with accept/dismiss
- Take Notes modal: three option cards (Write, Upload, Meet)

**Files:**
- Rewrite: `src/components/pane-notes.tsx`

- [ ] **Step 1: Read the current file to confirm state**

Read `src/components/pane-notes.tsx` to confirm it matches expectations.

- [ ] **Step 2: Rewrite the file**

Replace the entire contents of `src/components/pane-notes.tsx` with:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

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

type Tab = "view" | "suggestions";

const TYPE_LABELS: Record<string, string> = {
  audio_upload: "Uploaded",
  live_video: "Meeting",
  text_note: "Written",
  handwritten: "Handwritten",
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  text_note: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  ),
  audio_upload: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
  ),
  live_video: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  ),
  handwritten: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
};

export function PaneNotes({ workspaces, projectId: projectIdProp }: Props) {
  const router = useRouter();

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
    if (projectIdProp) setSelectedProjectId(projectIdProp);
  }, [projectIdProp]);

  const [tab, setTab] = useState<Tab>("view");
  const [notes, setNotes] = useState<MeetingNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  // Take Notes modal state
  const [showModal, setShowModal] = useState(false);
  const [modalStep, setModalStep] = useState<"pick" | "write" | "upload">("pick");
  const [newNoteText, setNewNoteText] = useState("");
  const [newNoteSource, setNewNoteSource] = useState<"internal" | "client">("internal");
  const [newNoteFile, setNewNoteFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);

  const loadNotes = useCallback(async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/notes?projectId=${selectedProjectId}`, { cache: "no-store" });
      if (res.ok) setNotes(await res.json());
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  // Poll while notes are processing
  useEffect(() => {
    const anyProcessing = notes.some((n) =>
      ["uploading", "transcribing", "extracting"].includes(n.status)
    );
    if (!anyProcessing) return;
    const interval = setInterval(loadNotes, 3000);
    return () => clearInterval(interval);
  }, [notes, loadNotes]);

  // Gather all pending suggestions across notes
  const pendingSuggestions = notes.flatMap((note) =>
    note.suggestions
      .filter((s) => s.status === "pending")
      .map((s) => ({ ...s, note }))
  );

  function openModal() {
    setShowModal(true);
    setModalStep("pick");
    setNewNoteText("");
    setNewNoteFile(null);
    setNewNoteSource("internal");
  }

  function closeModal() {
    setShowModal(false);
    setModalStep("pick");
    setNewNoteText("");
    setNewNoteFile(null);
  }

  async function handleWrite() {
    if (!newNoteText.trim() || !selectedProjectId) return;
    setCreating(true);
    try {
      await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          type: "text_note",
          textContent: newNoteText,
          source: newNoteSource,
        }),
      });
      closeModal();
      loadNotes();
    } finally {
      setCreating(false);
    }
  }

  async function handleUpload() {
    if (!newNoteFile || !selectedProjectId) return;
    setCreating(true);
    try {
      const formData = new FormData();
      formData.append("file", newNoteFile);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      const { url } = await uploadRes.json();

      const isAudio = newNoteFile.type.startsWith("audio/");
      await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          type: isAudio ? "audio_upload" : "handwritten",
          audioUrl: isAudio ? url : undefined,
          imageUrl: !isAudio ? url : undefined,
          source: newNoteSource,
        }),
      });
      closeModal();
      loadNotes();
    } finally {
      setCreating(false);
    }
  }

  async function handleMeet() {
    if (!selectedProjectId) return;
    setCreating(true);
    try {
      const res = await fetch("/api/meetings/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: selectedProjectId }),
      });
      const data = await res.json();
      closeModal();
      router.push(`/meet/${data.roomCode}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleAcceptSuggestion(suggestion: Suggestion & { note: MeetingNote }) {
    if (!suggestion.note.clientId) return;
    await fetch("/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: suggestion.suggestedTitle,
        description: suggestion.suggestedDescription,
        clientId: suggestion.note.clientId,
        projectId: suggestion.note.projectId,
        priority: suggestion.suggestedPriority,
      }),
    });
    await fetch(`/api/suggestions/${suggestion.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "accepted" }),
    });
    loadNotes();
  }

  async function handleDismissSuggestion(suggestionId: string) {
    await fetch(`/api/suggestions/${suggestionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    });
    loadNotes();
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-6">
        <button
          onClick={() => setTab("view")}
          className={`px-4 py-2 text-sm rounded-lg transition-colors ${
            tab === "view"
              ? "bg-white/[0.08] text-white/80"
              : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
          }`}
        >
          View Notes
        </button>
        <button
          onClick={() => setTab("suggestions")}
          className={`px-4 py-2 text-sm rounded-lg transition-colors flex items-center gap-2 ${
            tab === "suggestions"
              ? "bg-white/[0.08] text-white/80"
              : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
          }`}
        >
          Review Suggestions
          {pendingSuggestions.length > 0 && (
            <span className="text-[0.6rem] bg-yellow-400/20 text-yellow-400 px-1.5 py-0.5 rounded-full">
              {pendingSuggestions.length}
            </span>
          )}
        </button>
        <div className="flex-1" />
        <button
          onClick={openModal}
          className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white font-medium hover:opacity-90 transition-opacity"
        >
          + Take Notes
        </button>
      </div>

      {/* View Notes tab */}
      {tab === "view" && (
        <>
          {loading && notes.length === 0 ? (
            <p className="text-sm text-white/30">Loading...</p>
          ) : notes.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-white/30 mb-2">No notes yet.</p>
              <p className="text-xs text-white/20">Click &quot;+ Take Notes&quot; to capture your first note.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notes.map((note) => {
                const isProcessing = ["uploading", "transcribing", "extracting"].includes(note.status);
                const expanded = expandedNoteId === note.id;

                return (
                  <div key={note.id} className="rounded-lg border border-white/[0.08] bg-white/[0.02]">
                    <button
                      onClick={() => setExpandedNoteId(expanded ? null : note.id)}
                      className="w-full text-left px-4 py-3 flex items-center gap-3"
                    >
                      {/* Type badge */}
                      <span className={`flex items-center gap-1.5 text-[0.6rem] px-2 py-1 rounded-md shrink-0 ${
                        note.type === "live_video" ? "bg-blue-500/10 text-blue-400" :
                        note.type === "audio_upload" ? "bg-purple-500/10 text-purple-400" :
                        note.type === "handwritten" ? "bg-green-500/10 text-green-400" :
                        "bg-white/[0.06] text-white/40"
                      }`}>
                        {TYPE_ICONS[note.type]}
                        {TYPE_LABELS[note.type] || "Note"}
                      </span>

                      {/* Source badge */}
                      {note.source === "client" && (
                        <span className="text-[0.5rem] px-1.5 py-0.5 rounded-full font-medium text-orange-400 bg-orange-400/10 shrink-0">
                          Client
                        </span>
                      )}

                      {/* Note info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-white/60">
                          {new Date(note.createdAt).toLocaleDateString("en-US", {
                            month: "short", day: "numeric", year: "numeric",
                          })}
                          {(note.createdByName || note.createdBy?.name) && (
                            <span className="text-white/25 ml-2">
                              by {note.createdByName || note.createdBy?.name}
                            </span>
                          )}
                        </div>
                        {isProcessing ? (
                          <div className="flex items-center gap-1.5 text-[0.6rem] text-yellow-400/60 mt-0.5">
                            <span className="w-2 h-2 border border-yellow-400/40 border-t-yellow-400 rounded-full animate-spin" />
                            {note.status === "transcribing" ? "Transcribing..." : note.status === "extracting" ? "Extracting features..." : "Processing..."}
                          </div>
                        ) : note.summary ? (
                          <div className="text-[0.6rem] text-white/30 truncate mt-0.5">{note.summary.split("\n")[0]}</div>
                        ) : null}
                      </div>

                      {/* Expand arrow */}
                      <svg
                        className={`text-white/20 transition-transform shrink-0 ${expanded ? "rotate-180" : ""}`}
                        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
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
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            fetch(`/api/notes/${note.id}`, { method: "DELETE" }).then(loadNotes);
                          }}
                          className="text-[0.6rem] text-red-400/30 hover:text-red-400/60 transition-colors"
                        >
                          Delete note
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Review Suggestions tab */}
      {tab === "suggestions" && (
        <>
          {pendingSuggestions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-white/30 mb-1">All caught up</p>
              <p className="text-xs text-white/20">No pending suggestions to review.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pendingSuggestions.map((s) => (
                <div key={s.id} className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white/80 font-medium">{s.suggestedTitle}</span>
                        {s.suggestedPriority && (
                          <span className={`text-[0.6rem] px-1.5 py-0.5 rounded ${
                            s.suggestedPriority === "high" ? "text-red-400 bg-red-500/10" :
                            s.suggestedPriority === "medium" ? "text-yellow-400 bg-yellow-500/10" :
                            "text-white/40 bg-white/[0.06]"
                          }`}>
                            {s.suggestedPriority}
                          </span>
                        )}
                      </div>
                      {s.suggestedDescription && (
                        <p className="text-xs text-white/40 mt-1">{s.suggestedDescription}</p>
                      )}
                      <button
                        onClick={() => {
                          setTab("view");
                          setExpandedNoteId(s.note.id);
                        }}
                        className="text-[0.6rem] text-blue-400/60 hover:text-blue-400 mt-1.5 transition-colors"
                      >
                        From: {s.note.project?.name || "Unknown"} &mdash; {new Date(s.note.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </button>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleAcceptSuggestion(s)}
                        className="px-3 py-1.5 text-xs rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                      >
                        + Wishlist
                      </button>
                      <button
                        onClick={() => handleDismissSuggestion(s.id)}
                        className="px-3 py-1.5 text-xs rounded-lg text-white/20 hover:text-white/40 hover:bg-white/[0.04] transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Take Notes modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeModal}>
          <div className="bg-[#111827] border border-white/[0.1] rounded-xl shadow-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>

            {modalStep === "pick" && (
              <>
                <h3 className="text-sm font-medium text-white/80 mb-4">Take Notes</h3>
                <div className="grid grid-cols-3 gap-3">
                  {/* Write */}
                  <button
                    onClick={() => setModalStep("write")}
                    className="flex flex-col items-center gap-2 p-4 rounded-lg border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.15] transition-all"
                  >
                    <svg className="w-6 h-6 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <span className="text-xs text-white/60">Write</span>
                  </button>
                  {/* Upload */}
                  <button
                    onClick={() => setModalStep("upload")}
                    className="flex flex-col items-center gap-2 p-4 rounded-lg border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.15] transition-all"
                  >
                    <svg className="w-6 h-6 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span className="text-xs text-white/60">Upload</span>
                  </button>
                  {/* Meet */}
                  <button
                    onClick={handleMeet}
                    disabled={creating}
                    className="flex flex-col items-center gap-2 p-4 rounded-lg border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.15] transition-all disabled:opacity-50"
                  >
                    <svg className="w-6 h-6 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span className="text-xs text-white/60">{creating ? "Starting..." : "Meet"}</span>
                  </button>
                </div>
                <button onClick={closeModal} className="mt-4 text-xs text-white/30 hover:text-white/50 transition-colors">
                  Cancel
                </button>
              </>
            )}

            {modalStep === "write" && (
              <>
                <h3 className="text-sm font-medium text-white/80 mb-4">Write Notes</h3>
                <textarea
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  placeholder="What happened? What did the client say?"
                  rows={8}
                  autoFocus
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 resize-none mb-3"
                />
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xs text-white/30">Source:</span>
                  <button
                    onClick={() => setNewNoteSource("internal")}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                      newNoteSource === "internal" ? "bg-white/[0.1] text-white/70" : "text-white/30 hover:text-white/50"
                    }`}
                  >
                    Internal
                  </button>
                  <button
                    onClick={() => setNewNoteSource("client")}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                      newNoteSource === "client" ? "bg-orange-400/20 text-orange-400" : "text-white/30 hover:text-white/50"
                    }`}
                  >
                    Client
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleWrite}
                    disabled={creating || !newNoteText.trim()}
                    className="px-4 py-2 text-xs rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
                  >
                    {creating ? "Saving..." : "Save"}
                  </button>
                  <button onClick={() => setModalStep("pick")} className="px-4 py-2 text-xs text-white/30 hover:text-white/50 transition-colors">
                    Back
                  </button>
                </div>
              </>
            )}

            {modalStep === "upload" && (
              <>
                <h3 className="text-sm font-medium text-white/80 mb-4">Upload Notes</h3>
                <p className="text-xs text-white/30 mb-3">Upload an audio recording (.mp3, .wav, .webm, .m4a) or a photo of handwritten notes (.png, .jpg).</p>
                <input
                  type="file"
                  accept="audio/*,image/*"
                  onChange={(e) => setNewNoteFile(e.target.files?.[0] || null)}
                  className="text-xs text-white/40 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-white/[0.08] file:text-white/60 hover:file:bg-white/[0.12] mb-3"
                />
                {newNoteFile && (
                  <p className="text-xs text-white/40 mb-3">{newNoteFile.name}</p>
                )}
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xs text-white/30">Source:</span>
                  <button
                    onClick={() => setNewNoteSource("internal")}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                      newNoteSource === "internal" ? "bg-white/[0.1] text-white/70" : "text-white/30 hover:text-white/50"
                    }`}
                  >
                    Internal
                  </button>
                  <button
                    onClick={() => setNewNoteSource("client")}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                      newNoteSource === "client" ? "bg-orange-400/20 text-orange-400" : "text-white/30 hover:text-white/50"
                    }`}
                  >
                    Client
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleUpload}
                    disabled={creating || !newNoteFile}
                    className="px-4 py-2 text-xs rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
                  >
                    {creating ? "Uploading..." : "Upload"}
                  </button>
                  <button onClick={() => setModalStep("pick")} className="px-4 py-2 text-xs text-white/30 hover:text-white/50 transition-colors">
                    Back
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify build compiles**

Run: `npx next build 2>&1 | tail -10`
Expected: Build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/pane-notes.tsx
git commit -m "feat: rewrite Notes pane with tabbed layout and Take Notes modal"
```

---

### Task 2: Build and Verify

- [ ] **Step 1: Build the project**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 2: Restart production server**

```bash
lsof -ti:3000 | xargs kill -9
npx next start -p 3000 &
```

- [ ] **Step 3: Visual verification**

Open `http://localhost:3000` (or ngrok URL). Navigate to Notes via the dashboard. Verify:
1. Tab bar shows "View Notes" and "Review Suggestions" tabs + "+ Take Notes" button
2. View Notes tab shows clean note cards with type badges, dates, expandable transcripts
3. Review Suggestions tab shows pending suggestions with Wishlist/Dismiss buttons
4. Review Suggestions badge shows pending count
5. "+ Take Notes" opens modal with Write/Upload/Meet cards
6. Write flow: textarea + source toggle + save
7. Upload flow: file picker + source toggle + upload
8. Meet flow: clicking Meet navigates to /meet/{roomCode}
9. Back buttons in modal return to picker
10. Clicking source note link in Review Suggestions switches to View Notes and expands that note

- [ ] **Step 4: Commit cleanup if needed**

```bash
git add -A
git commit -m "chore: verify notes redesign build"
```

---

## Verification Checklist

1. **Tab bar renders** — View Notes, Review Suggestions (with badge), + Take Notes
2. **View Notes** — clean cards, type badges, expandable transcripts, no suggestion actions
3. **Review Suggestions** — aggregated pending suggestions, accept/dismiss, source note link
4. **Take Notes modal** — Write/Upload/Meet picker
5. **Write flow** — textarea, source toggle, save triggers API + AI pipeline
6. **Upload flow** — file picker, source toggle, upload triggers API + AI pipeline
7. **Meet flow** — immediate room creation, navigates to /meet/{roomCode}
8. **Polling** — notes in processing state auto-refresh every 3s
9. **Empty states** — "No notes yet" and "All caught up" messages
10. **ngrok** — works through production build

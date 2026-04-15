"use client";

import { useState, useEffect, useRef } from "react";

type Mode = "scratch" | "notes" | "upload" | "github";

type Props = {
  projectId: string;
  projectName: string;
  onComplete: () => void;
};

export function InitialBuild({ projectId, projectName, onComplete }: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Scratch
  const [prompt, setPrompt] = useState("");

  // Notes
  const [notes, setNotes] = useState<any[]>([]);
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [loadingNotes, setLoadingNotes] = useState(false);

  // Upload
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // GitHub
  const [githubUrl, setGithubUrl] = useState("");

  // Build result
  const [buildResult, setBuildResult] = useState<any>(null);

  // Load notes when notes mode is selected
  useEffect(() => {
    if (mode !== "notes") return;
    setLoadingNotes(true);
    fetch(`/api/projects/${projectId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        setNotes(data.meetings || []);
      })
      .catch(() => {})
      .finally(() => setLoadingNotes(false));
  }, [mode, projectId]);

  async function handleUpload(file: File) {
    setUploadingFile(true);
    setError("");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setUploadedFile(data.url);
    } catch {
      setError("Failed to upload file");
    } finally {
      setUploadingFile(false);
    }
  }

  async function handleBuild() {
    setLoading(true);
    setError("");

    const body: any = { mode };

    if (mode === "scratch") {
      body.prompt = prompt;
    } else if (mode === "notes") {
      body.noteIds = Array.from(selectedNotes);
    } else if (mode === "upload") {
      body.prompt = prompt || `Build based on uploaded codebase at ${uploadedFile}`;
    } else if (mode === "github") {
      body.githubUrl = githubUrl;
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/initial-build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Build failed");
      }
      const result = await res.json();
      setBuildResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Build failed");
    } finally {
      setLoading(false);
    }
  }

  function toggleNote(id: string) {
    setSelectedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function canBuild(): boolean {
    if (loading) return false;
    if (mode === "scratch") return !!prompt.trim();
    if (mode === "notes") return selectedNotes.size > 0;
    if (mode === "upload") return !!uploadedFile;
    if (mode === "github") return !!githubUrl.trim();
    return false;
  }

  // Success state — features are being built
  if (buildResult) {
    const totalMinors = buildResult.created?.reduce((s: number, c: any) => s + c.minors.length, 0) || 0;
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-lg text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-gradient-to-r from-red-500/20 to-blue-500/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-white/60 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-white/80 mb-2">Building {projectName}</h2>
          <p className="text-sm text-white/40 mb-6">
            Creating {buildResult.created?.length || 0} feature areas with {totalMinors} components. This may take a few minutes.
          </p>
          <div className="space-y-2 mb-8 text-left max-w-sm mx-auto">
            {buildResult.created?.map((major: any) => (
              <div key={major.majorId} className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
                <div className="text-sm text-white/60 font-medium">{major.majorTitle}</div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {major.minors.map((m: any) => (
                    <span key={m.id} className="text-[0.6rem] px-2 py-0.5 rounded-full bg-white/[0.06] text-white/35">
                      {m.title}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={onComplete}
            className="px-6 py-2.5 text-sm rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white font-medium hover:opacity-90 transition-opacity"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Mode selection
  if (!mode) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          <h1 className="text-2xl font-semibold text-white/85 mb-2 text-center">How do you want to build {projectName}?</h1>
          <p className="text-sm text-white/35 text-center mb-10">Choose how to kick off your project. You can always add more later.</p>

          <div className="grid grid-cols-2 gap-4">
            {/* From Scratch */}
            <button
              onClick={() => setMode("scratch")}
              className="group flex flex-col items-center gap-3 p-8 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.15] transition-all text-center"
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500/20 to-blue-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-white/50 group-hover:text-white/80 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-medium text-white/70 group-hover:text-white/90 transition-colors">From Scratch</div>
                <div className="text-xs text-white/30 mt-1">Describe what you want and AI builds it</div>
              </div>
            </button>

            {/* From Notes */}
            <button
              onClick={() => setMode("notes")}
              className="group flex flex-col items-center gap-3 p-8 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.15] transition-all text-center"
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500/20 to-blue-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-white/50 group-hover:text-white/80 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-medium text-white/70 group-hover:text-white/90 transition-colors">From Notes</div>
                <div className="text-xs text-white/30 mt-1">AI analyzes your meeting notes to build</div>
              </div>
            </button>

            {/* Drag & Drop */}
            <button
              onClick={() => setMode("upload")}
              className="group flex flex-col items-center gap-3 p-8 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.15] transition-all text-center"
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500/20 to-blue-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-white/50 group-hover:text-white/80 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-medium text-white/70 group-hover:text-white/90 transition-colors">Drag & Drop</div>
                <div className="text-xs text-white/30 mt-1">Upload your existing code as a zip</div>
              </div>
            </button>

            {/* From GitHub */}
            <button
              onClick={() => setMode("github")}
              className="group flex flex-col items-center gap-3 p-8 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.15] transition-all text-center"
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500/20 to-blue-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-white/50 group-hover:text-white/80 transition-colors" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-medium text-white/70 group-hover:text-white/90 transition-colors">From GitHub</div>
                <div className="text-xs text-white/30 mt-1">Import from a GitHub repository URL</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Mode-specific form
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Back button */}
        <button
          onClick={() => { setMode(null); setError(""); }}
          className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white/70 mb-6 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <h2 className="text-xl font-semibold text-white/85 mb-6">
          {mode === "scratch" && "Describe what you want to build"}
          {mode === "notes" && "Select notes to build from"}
          {mode === "upload" && "Upload your codebase"}
          {mode === "github" && "Import from GitHub"}
        </h2>

        {/* From Scratch */}
        {mode === "scratch" && (
          <div className="space-y-4">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. A project management dashboard with task boards, team member management, file sharing, and analytics..."
              rows={6}
              autoFocus
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-3 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors resize-none"
            />
            <p className="text-xs text-white/25">Be specific about the features you need. AI will break this down into buildable components.</p>
          </div>
        )}

        {/* From Notes */}
        {mode === "notes" && (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {loadingNotes ? (
              <div className="text-sm text-white/30 py-4">Loading notes...</div>
            ) : notes.length === 0 ? (
              <div className="text-sm text-white/30 py-4">No notes found. Add some notes first, or try building from scratch.</div>
            ) : (
              notes.map((note: any) => (
                <button
                  key={note.id}
                  onClick={() => toggleNote(note.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedNotes.has(note.id)
                      ? "bg-white/[0.06] border-white/[0.15]"
                      : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                      selectedNotes.has(note.id) ? "bg-blue-500 border-blue-500" : "border-white/20"
                    }`}>
                      {selectedNotes.has(note.id) && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white/60 truncate">
                        {note.summary || note.textContent?.substring(0, 80) || "Untitled note"}
                      </div>
                      <div className="text-xs text-white/20 mt-0.5">
                        {note.createdByName || "Unknown"} · {new Date(note.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {/* Drag & Drop Upload */}
        {mode === "upload" && (
          <div className="space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer.files[0];
                if (file) handleUpload(file);
              }}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                uploadedFile
                  ? "border-green-500/30 bg-green-500/[0.03]"
                  : "border-white/[0.1] hover:border-white/[0.2] hover:bg-white/[0.02]"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                }}
              />
              {uploadingFile ? (
                <div className="text-sm text-white/40">Uploading...</div>
              ) : uploadedFile ? (
                <div>
                  <svg className="w-8 h-8 mx-auto text-green-500/60 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm text-green-400/70">File uploaded</div>
                  <div className="text-xs text-white/20 mt-1">Click to replace</div>
                </div>
              ) : (
                <div>
                  <svg className="w-8 h-8 mx-auto text-white/20 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  <div className="text-sm text-white/40">Drop a .zip file here or click to browse</div>
                  <div className="text-xs text-white/20 mt-1">Your codebase as a zip archive</div>
                </div>
              )}
            </div>
            {uploadedFile && (
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Any additional context about this codebase? (optional)"
                rows={3}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-3 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors resize-none"
              />
            )}
          </div>
        )}

        {/* From GitHub */}
        {mode === "github" && (
          <div className="space-y-4">
            <input
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              autoFocus
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-3 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
            />
            <p className="text-xs text-white/25">Paste a GitHub repository URL. We'll connect it and analyze the code to create features.</p>
          </div>
        )}

        {error && <p className="text-xs text-red-400 mt-3">{error}</p>}

        <button
          onClick={handleBuild}
          disabled={!canBuild()}
          className="w-full mt-6 px-4 py-3 text-sm rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white font-medium hover:opacity-90 disabled:opacity-30 transition-opacity"
        >
          {loading ? "Building..." : "Start Building"}
        </button>
      </div>
    </div>
  );
}

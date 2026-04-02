"use client";

import { useState, useRef, DragEvent } from "react";
import { CodebaseMapper } from "./codebase-mapper";

type Props = {
  project: {
    id: string;
    name: string;
    clientName: string;
    clientFirm: string;
    deployUrl: string | null;
    deployStatus: string;
    features: any[];
    meetings: any[];
  };
  onUpdate: () => void;
};

export function PaneProject({ project, onUpdate }: Props) {
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dragTarget, setDragTarget] = useState<"meeting" | "codebase" | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [codebaseAnalysis, setCodebaseAnalysis] = useState<any>(null);
  const [codebaseFileUrl, setCodebaseFileUrl] = useState<string>("");
  const meetingInputRef = useRef<HTMLInputElement>(null);
  const codebaseInputRef = useRef<HTMLInputElement>(null);

  const liveFeatures = [
    ...project.features,
    ...project.features.flatMap((f: any) => f.children || []),
  ].filter((f) => f.status === "live");

  const totalFeatures = [
    ...project.features,
    ...project.features.flatMap((f: any) => f.children || []),
  ].length;

  async function uploadFile(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const { url } = await res.json();
    return url;
  }

  async function handleMeetingDrop(files: FileList) {
    setSubmitting(true);
    try {
      for (const file of Array.from(files)) {
        const url = await uploadFile(file);
        await fetch(`/api/projects/${project.id}/meetings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audioUrl: url }),
        });
      }
      onUpdate();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCodebaseDrop(files: FileList) {
    const file = files[0];
    if (!file) return;

    setAnalyzing(true);
    try {
      const url = await uploadFile(file);
      setCodebaseFileUrl(url);
      const res = await fetch(`/api/projects/${project.id}/analyze-codebase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl: url }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Analysis failed");
        return;
      }

      const analysis = await res.json();
      setCodebaseAnalysis(analysis);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleDescriptionSubmit() {
    if (!description.trim()) return;
    setSubmitting(true);
    try {
      // Add as a meeting with text description (no audio)
      await fetch(`/api/projects/${project.id}/meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl: "", description: description.trim() }),
      });
      setDescription("");
      onUpdate();
    } finally {
      setSubmitting(false);
    }
  }

  function onDragOver(e: DragEvent, target: "meeting" | "codebase") {
    e.preventDefault();
    e.stopPropagation();
    setDragTarget(target);
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragTarget(null);
  }

  function onDrop(e: DragEvent, handler: (files: FileList) => void) {
    e.preventDefault();
    e.stopPropagation();
    setDragTarget(null);
    if (e.dataTransfer.files.length > 0) {
      handler(e.dataTransfer.files);
    }
  }

  // Show codebase mapper if we have analysis results
  if (codebaseAnalysis) {
    return (
      <CodebaseMapper
        sections={codebaseAnalysis.sections}
        projectId={project.id}
        fileUrl={codebaseFileUrl}
        onComplete={() => {
          setCodebaseAnalysis(null);
          setCodebaseFileUrl("");
          onUpdate();
        }}
        onCancel={() => {
          setCodebaseAnalysis(null);
          setCodebaseFileUrl("");
        }}
      />
    );
  }

  // Show analyzing state
  if (analyzing) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin mb-4" />
        <p className="text-sm text-white/50">Analyzing codebase...</p>
        <p className="text-[0.65rem] text-white/25 mt-1">Reading files and identifying features</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-[#f1f5f9] mb-1">{project.name}</h2>
      <p className="text-xs text-white/40 mb-6">
        {project.clientName} · {project.clientFirm}
      </p>

      {project.deployUrl && (
        <a
          href={`/api/preview/?projectId=${project.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full px-4 py-3 mb-6 rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          <span>Open Preview</span>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      )}

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.08]">
          <div className="text-lg font-semibold text-white/80">{totalFeatures}</div>
          <div className="text-[0.6rem] text-white/30 uppercase tracking-wider">Features</div>
        </div>
        <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.08]">
          <div className="text-lg font-semibold text-green-400">{liveFeatures.length}</div>
          <div className="text-[0.6rem] text-white/30 uppercase tracking-wider">Live</div>
        </div>
        <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.08]">
          <div className={`text-lg font-semibold ${
            project.deployStatus === "running" ? "text-green-400" : "text-white/40"
          }`}>
            {project.deployStatus === "running" ? "Up" : project.deployStatus}
          </div>
          <div className="text-[0.6rem] text-white/30 uppercase tracking-wider">Server</div>
        </div>
      </div>

      {/* Input Methods */}
      <div className="border-t border-white/[0.06] pt-5">
        <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-3">
          Add Context
        </div>

        {/* Describe */}
        <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-4 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="17" y1="10" x2="3" y2="10" />
              <line x1="21" y1="6" x2="3" y2="6" />
              <line x1="21" y1="14" x2="3" y2="14" />
              <line x1="17" y1="18" x2="3" y2="18" />
            </svg>
            <span className="text-xs text-white/50 font-medium">Describe the project</span>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this project need to do? Describe the base functionality, target users, key requirements..."
            rows={3}
            className="w-full bg-transparent text-sm text-white/70 placeholder:text-white/20 focus:outline-none resize-none"
          />
          {description.trim() && (
            <div className="flex justify-end mt-2">
              <button
                onClick={handleDescriptionSubmit}
                disabled={submitting}
                className="px-3 py-1.5 text-xs rounded-md bg-gradient-to-r from-red-500 to-blue-500 text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {submitting ? "Sending..." : "Submit"}
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Meeting Notes / Audio */}
          <div
            onDragOver={(e) => onDragOver(e, "meeting")}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, handleMeetingDrop)}
            onClick={() => meetingInputRef.current?.click()}
            className={`rounded-lg p-4 border border-dashed cursor-pointer transition-all ${
              dragTarget === "meeting"
                ? "border-blue-500/50 bg-blue-500/10"
                : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
            }`}
          >
            <input
              ref={meetingInputRef}
              type="file"
              accept="audio/*,.txt,.md,.pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) handleMeetingDrop(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              <span className="text-xs text-white/50 font-medium">Meeting Notes</span>
            </div>
            <p className="text-[0.65rem] text-white/25 leading-relaxed">
              Drop audio recordings or meeting notes to extract feature suggestions
            </p>
          </div>

          {/* Codebase */}
          <div
            onDragOver={(e) => onDragOver(e, "codebase")}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, handleCodebaseDrop)}
            onClick={() => codebaseInputRef.current?.click()}
            className={`rounded-lg p-4 border border-dashed cursor-pointer transition-all ${
              dragTarget === "codebase"
                ? "border-blue-500/50 bg-blue-500/10"
                : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
            }`}
          >
            <input
              ref={codebaseInputRef}
              type="file"
              accept=".zip,.tar,.tar.gz,.tgz"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) handleCodebaseDrop(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              <span className="text-xs text-white/50 font-medium">Codebase</span>
            </div>
            <p className="text-[0.65rem] text-white/25 leading-relaxed">
              Drop a zip or archive of an existing codebase to analyze
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

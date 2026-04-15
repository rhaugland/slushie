"use client";

import { useState, useRef, useEffect } from "react";

type Props = {
  workspaceId: string | null;
  clientId: string | null;
  projectId: string | null;
  workspaceName: string;
  clientName: string;
  projectName: string;
  hasGithubToken?: boolean;
  githubTokenPreview?: string | null;
  onWorkspaceSettings: () => void;
  onClientSettings: () => void;
  onProjectSettings: () => void;
  onUserUpdated?: () => void;
};

export function SettingsPanel({
  workspaceId,
  clientId,
  projectId,
  workspaceName,
  clientName,
  projectName,
  hasGithubToken,
  githubTokenPreview,
  onWorkspaceSettings,
  onClientSettings,
  onProjectSettings,
  onUserUpdated,
}: Props) {
  const [open, setOpen] = useState(false);
  const [showGithub, setShowGithub] = useState(false);
  const [githubInput, setGithubInput] = useState("");
  const [githubSaving, setGithubSaving] = useState(false);
  const [githubError, setGithubError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-colors"
        title="Settings"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 right-0 w-56 bg-[#111827] border border-white/[0.1] rounded-lg shadow-xl z-50">
          {workspaceId && (
            <button
              onClick={() => { onWorkspaceSettings(); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 text-sm text-white/60 hover:bg-white/[0.04] hover:text-white/80 transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
              </svg>
              <span>Workspace: {workspaceName}</span>
            </button>
          )}
          {clientId && (
            <button
              onClick={() => { onClientSettings(); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 text-sm text-white/60 hover:bg-white/[0.04] hover:text-white/80 transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>Client: {clientName}</span>
            </button>
          )}
          {projectId && (
            <button
              onClick={() => { onProjectSettings(); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 text-sm text-white/60 hover:bg-white/[0.04] hover:text-white/80 transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span>Project: {projectName}</span>
            </button>
          )}

          {/* GitHub Token */}
          <div className="border-t border-white/[0.06]">
            <button
              onClick={() => setShowGithub(!showGithub)}
              className="w-full text-left px-3 py-2.5 text-sm text-white/60 hover:bg-white/[0.04] hover:text-white/80 transition-colors flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-white/30" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                <span>GitHub Token</span>
              </div>
              {hasGithubToken ? (
                <span className="text-[0.6rem] text-green-400">Connected</span>
              ) : (
                <span className="text-[0.6rem] text-white/20">Not set</span>
              )}
            </button>
            {showGithub && (
              <div className="px-3 pb-3 space-y-2">
                {hasGithubToken && (
                  <div className="text-[0.55rem] text-white/30 font-mono">{githubTokenPreview}</div>
                )}
                {githubError && <p className="text-[0.6rem] text-red-400">{githubError}</p>}
                <input
                  type="password"
                  value={githubInput}
                  onChange={(e) => setGithubInput(e.target.value)}
                  placeholder={hasGithubToken ? "Replace token..." : "ghp_... or github_pat_..."}
                  className="w-full px-2 py-1.5 text-xs border border-white/[0.08] rounded bg-white/[0.04] text-white/70 placeholder:text-white/15 focus:outline-none focus:border-white/20"
                />
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (!githubInput.trim()) return;
                      setGithubSaving(true);
                      setGithubError("");
                      try {
                        const res = await fetch("/api/auth/me", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ githubToken: githubInput.trim() }),
                        });
                        if (!res.ok) {
                          const err = await res.json();
                          setGithubError(err.error || "Failed to save");
                          return;
                        }
                        setGithubInput("");
                        setShowGithub(false);
                        onUserUpdated?.();
                      } catch (err: any) {
                        setGithubError(err.message);
                      } finally {
                        setGithubSaving(false);
                      }
                    }}
                    disabled={githubSaving || !githubInput.trim()}
                    className="flex-1 px-2 py-1.5 text-[0.6rem] rounded bg-white/[0.06] text-white/60 hover:bg-white/[0.1] transition disabled:opacity-50"
                  >
                    {githubSaving ? "Saving..." : "Save"}
                  </button>
                  {hasGithubToken && (
                    <button
                      onClick={async () => {
                        setGithubSaving(true);
                        await fetch("/api/auth/me", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ githubToken: "" }),
                        });
                        setGithubSaving(false);
                        setShowGithub(false);
                        onUserUpdated?.();
                      }}
                      disabled={githubSaving}
                      className="px-2 py-1.5 text-[0.6rem] rounded text-red-400/50 hover:text-red-400 transition disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

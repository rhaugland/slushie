"use client";

import { useState, useRef, useEffect } from "react";

type Props = {
  project: {
    id: string;
    name: string;
    clientId: string;
    workspaceId: string;
    deployUrl: string | null;
    deployStatus: string;
    githubRepo: string | null;
    githubBranch: string | null;
    features: any[];
    meetings: any[];
    client?: { id: string; name: string };
  };
  onUpdate: () => void;
  onOpenPreview?: () => void;
  isAdmin?: boolean;
};

const STATUS_DOT: Record<string, string> = {
  draft: "bg-white/20",
  building: "bg-yellow-400 animate-pulse",
  live: "bg-white/40",
  error: "bg-red-400",
};

export function PaneProject({ project, onUpdate, onOpenPreview }: Props) {
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState(project.name);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [codebaseAnalysis, setCodebaseAnalysis] = useState<any>(null);
  const [codebaseFileUrl, setCodebaseFileUrl] = useState("");
  const codebaseInputRef = useRef<HTMLInputElement>(null);
  const [showFlowGuide, setShowFlowGuide] = useState(() => {
    if (typeof window === "undefined") return true;
    return !localStorage.getItem("slushie-flow-guide-dismissed");
  });

  // GitHub state
  const [githubRepoInput, setGithubRepoInput] = useState(project.githubRepo || "");
  const [githubBranchInput, setGithubBranchInput] = useState(project.githubBranch || "dev");
  const [githubSaving, setGithubSaving] = useState(false);
  const [githubError, setGithubError] = useState("");
  const [githubStatus, setGithubStatus] = useState<any>(null);
  const [githubLoading, setGithubLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);

  useEffect(() => {
    if (!project.githubRepo) return;
    setGithubLoading(true);
    fetch(`/api/projects/${project.id}/github`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setGithubStatus(data); })
      .catch(() => {})
      .finally(() => setGithubLoading(false));
  }, [project.id, project.githubRepo]);

  async function handleConnectGithub() {
    if (!githubRepoInput.trim()) return;
    setGithubSaving(true);
    setGithubError("");
    try {
      const res = await fetch(`/api/projects/${project.id}/github`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubRepo: githubRepoInput.trim(), githubBranch: githubBranchInput.trim() || "dev" }),
      });
      if (!res.ok) {
        const err = await res.json();
        setGithubError(err.error || "Failed to connect");
        return;
      }
      onUpdate();
    } catch (err: any) {
      setGithubError(err.message);
    } finally {
      setGithubSaving(false);
    }
  }

  async function handleDisconnectGithub() {
    setGithubSaving(true);
    try {
      await fetch(`/api/projects/${project.id}/github`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubRepo: null, githubBranch: null }),
      });
      setGithubRepoInput("");
      setGithubStatus(null);
      onUpdate();
    } finally {
      setGithubSaving(false);
    }
  }

  async function handleSyncBranches() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/github/sync`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setSyncResult(data);
        if (data.created.length > 0) onUpdate();
      } else {
        const err = await res.json();
        setGithubError(err.error || "Sync failed");
      }
    } catch (err: any) {
      setGithubError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleRename(name: string) {
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    onUpdate();
  }

  async function handleCodebaseUpload(files: FileList) {
    const file = files[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      const { url } = await uploadRes.json();
      setCodebaseFileUrl(url);
      setUploading(false);
      setAnalyzing(true);
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
      setUploading(false);
      setAnalyzing(false);
    }
  }

  if (codebaseAnalysis) {
    const CodebaseMapper = require("./codebase-mapper").CodebaseMapper;
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

  const allFeatures = [
    ...project.features,
    ...project.features.flatMap((f: any) => f.children || []),
  ];
  const buildingCount = allFeatures.filter((f: any) => f.status === "building").length;
  const liveCount = allFeatures.filter((f: any) => f.status === "live").length;

  return (
    <div>
      {/* Project header */}
      <div className="flex items-center gap-3 mb-1">
        {renaming ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (renameName.trim() && renameName !== project.name) {
                await handleRename(renameName.trim());
              }
              setRenaming(false);
            }}
            className="flex-1"
          >
            <input
              autoFocus
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onBlur={() => setRenaming(false)}
              onKeyDown={(e) => { if (e.key === "Escape") setRenaming(false); }}
              className="w-full bg-transparent border border-white/10 rounded px-2 py-1 text-xl font-semibold text-[#f1f5f9] focus:outline-none focus:border-white/20"
            />
          </form>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-[#f1f5f9]">{project.name}</h1>
            <button
              onClick={() => { setRenameName(project.name); setRenaming(true); }}
              className="text-white/20 hover:text-white/50 transition-colors p-1"
              title="Rename"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
            </button>
          </>
        )}
      </div>
      <p className="text-xs text-white/40 mb-3">{project.client?.name || ""}</p>

      {/* Flow explainer */}
      {showFlowGuide && (
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-3 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6 text-[0.6rem] text-white/70">
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded bg-white/[0.1] flex items-center justify-center text-[0.5rem] text-white/60 font-medium">1</span>
                Build features here or push code to GitHub
              </span>
              <span className="text-white/20">→</span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded bg-white/[0.1] flex items-center justify-center text-[0.5rem] text-white/60 font-medium">2</span>
                Branches sync both ways automatically
              </span>
              <span className="text-white/20">→</span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded bg-white/[0.1] flex items-center justify-center text-[0.5rem] text-white/60 font-medium">3</span>
                Merge to main to update the client preview
              </span>
            </div>
            <button
              onClick={() => {
                setShowFlowGuide(false);
                localStorage.setItem("slushie-flow-guide-dismissed", "1");
              }}
              className="ml-4 text-white/20 hover:text-white/50 transition shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {showFlowGuide && !project.githubRepo && (
        <div className="text-[0.55rem] text-white/30 -mt-4 mb-6 pl-1">
          Set your GitHub token in settings (top right) to get started, then connect a repo below.
        </div>
      )}

      {/* Status cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
          <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-1">Features</div>
          <div className="text-2xl font-bold text-white">{allFeatures.length}</div>
          <div className="text-[0.55rem] text-white/20 mt-0.5">
            {project.features.length} major
          </div>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
          <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-1">Status</div>
          <div className="text-2xl font-bold text-white">{liveCount}</div>
          <div className="text-[0.55rem] text-white/20 mt-0.5">
            live{buildingCount > 0 ? ` / ${buildingCount} building` : ""}
          </div>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
          <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-1">Deploy</div>
          {project.deployStatus === "running" ? (
            <>
              <span className="text-sm font-medium text-green-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                Live
              </span>
              {onOpenPreview && (
                <button
                  onClick={onOpenPreview}
                  className="text-[0.55rem] text-blue-400 hover:text-blue-300 mt-1"
                >
                  Open Preview
                </button>
              )}
            </>
          ) : project.deployStatus === "starting" ? (
            <span className="text-sm text-yellow-400">Deploying...</span>
          ) : (
            <span className="text-sm text-white/30">Not deployed</span>
          )}
        </div>
      </div>

      {/* GitHub Integration */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden mb-6">
        <div className="flex items-center justify-between px-4 py-3 bg-white/[0.03] border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-white/40" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <h3 className="text-xs font-semibold text-white/80">GitHub</h3>
          </div>
          {project.githubRepo && (
            <button
              onClick={handleDisconnectGithub}
              disabled={githubSaving}
              className="text-[0.6rem] text-red-400/40 hover:text-red-400 transition"
            >
              Disconnect
            </button>
          )}
        </div>
        <div className="p-4">
          {githubError && <p className="text-xs text-red-400 mb-2">{githubError}</p>}

          {!project.githubRepo ? (
            <div className="space-y-3">
              <div>
                <label className="text-[0.55rem] uppercase tracking-widest text-white/30 block mb-1">Repository</label>
                <input
                  value={githubRepoInput}
                  onChange={(e) => setGithubRepoInput(e.target.value)}
                  placeholder="org/repo"
                  className="w-full px-3 py-1.5 text-xs border border-white/[0.08] rounded-lg bg-white/[0.04] text-white/70 placeholder:text-white/15 focus:outline-none focus:border-white/20"
                />
              </div>
              <div>
                <label className="text-[0.55rem] uppercase tracking-widest text-white/30 block mb-1">Default PR target branch</label>
                <input
                  value={githubBranchInput}
                  onChange={(e) => setGithubBranchInput(e.target.value)}
                  placeholder="dev"
                  className="w-full px-3 py-1.5 text-xs border border-white/[0.08] rounded-lg bg-white/[0.04] text-white/70 placeholder:text-white/15 focus:outline-none focus:border-white/20"
                />
              </div>
              <button
                onClick={handleConnectGithub}
                disabled={githubSaving || !githubRepoInput.trim()}
                className="w-full px-3 py-2 text-xs rounded-lg bg-white/[0.06] text-white/60 hover:bg-white/[0.1] hover:text-white/80 transition disabled:opacity-50"
              >
                {githubSaving ? "Connecting..." : "Connect Repository"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Connected repo info */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-white/80">{project.githubRepo}</div>
                  <div className="text-[0.55rem] text-white/30 mt-0.5">PR target: {project.githubBranch || "dev"}</div>
                </div>
                <span className="flex items-center gap-1.5 text-xs text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  Connected
                </span>
              </div>

              {/* Sync & Webhook */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSyncBranches}
                  disabled={syncing}
                  className="flex-1 px-3 py-2 text-xs rounded-lg bg-white/[0.06] text-white/60 hover:bg-white/[0.1] hover:text-white/80 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <svg className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {syncing ? "Syncing..." : "Sync Branches"}
                </button>
              </div>

              {syncResult && (
                <div className="text-[0.55rem] text-white/40 space-y-0.5">
                  {syncResult.created.length > 0 && (
                    <div className="text-green-400 space-y-0.5">
                      <div>Created {syncResult.created.length} feature{syncResult.created.length !== 1 ? "s" : ""}:</div>
                      {syncResult.created.map((f: any, i: number) => (
                        <div key={i} className="pl-2 text-green-400/80">
                          {f.title || f.branch || f}{" "}
                          <span className="text-white/30">
                            ({typeof f === "object" ? `${f.type}${f.parent ? ` → ${f.parent}` : ""}` : "branch"})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {syncResult.orphaned.length > 0 && (
                    <div className="text-yellow-400">Orphaned branches: {syncResult.orphaned.join(", ")}</div>
                  )}
                  {syncResult.created.length === 0 && <div>All branches in sync</div>}
                </div>
              )}

              {/* Webhook URL hint */}
              <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2">
                <div className="text-[0.55rem] text-white/30 mb-1">Webhook URL (add to GitHub repo settings)</div>
                <code className="text-[0.55rem] text-white/50 break-all select-all">
                  {typeof window !== "undefined" ? `${window.location.origin}/api/github/webhook` : "/api/github/webhook"}
                </code>
                <div className="text-[0.55rem] text-white/20 mt-1">Events: Branch creation, Pushes, Pull requests</div>
              </div>

              {/* Deployments */}
              {githubLoading ? (
                <div className="text-xs text-white/30">Loading GitHub status...</div>
              ) : githubStatus && (
                <>
                  {/* Environments */}
                  {Object.keys(githubStatus.environments || {}).length > 0 && (
                    <div>
                      <div className="text-[0.55rem] uppercase tracking-widest text-white/30 mb-2">Deployments</div>
                      <div className="space-y-1.5">
                        {Object.entries(githubStatus.environments).map(([env, dep]: [string, any]) => (
                          <div key={env} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                            <div className="flex items-center gap-2">
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                dep.status === "success" ? "bg-green-400" :
                                dep.status === "pending" || dep.status === "in_progress" ? "bg-yellow-400 animate-pulse" :
                                dep.status === "failure" || dep.status === "error" ? "bg-red-400" : "bg-white/20"
                              }`} />
                              <span className="text-xs text-white/70 capitalize">{env}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[0.55rem] text-white/30 font-mono">{dep.sha}</span>
                              <span className={`text-[0.55rem] font-medium ${
                                dep.status === "success" ? "text-green-400" :
                                dep.status === "failure" ? "text-red-400" : "text-yellow-400"
                              }`}>{dep.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Open PRs */}
                  {(githubStatus.prs || []).length > 0 && (
                    <div>
                      <div className="text-[0.55rem] uppercase tracking-widest text-white/30 mb-2">Open Pull Requests</div>
                      <div className="space-y-1.5">
                        {githubStatus.prs.map((pr: any) => (
                          <a
                            key={pr.number}
                            href={pr.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition group"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[0.6rem] text-white/30 font-mono">#{pr.number}</span>
                              <span className="text-xs text-white/70 truncate">{pr.title}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[0.55rem] text-white/20">{pr.head} → {pr.base}</span>
                              <svg className="w-3 h-3 text-white/20 group-hover:text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Branches */}
                  {(githubStatus.branches || []).length > 0 && (
                    <div>
                      <div className="text-[0.55rem] uppercase tracking-widest text-white/30 mb-2">Branches</div>
                      <div className="flex flex-wrap gap-1.5">
                        {githubStatus.branches.map((b: any) => (
                          <span key={b.name} className={`text-[0.6rem] px-2 py-0.5 rounded-full border ${
                            b.name === "production" ? "text-green-400 border-green-500/20 bg-green-500/10" :
                            b.name === "staging" ? "text-yellow-400 border-yellow-500/20 bg-yellow-500/10" :
                            b.name === "main" ? "text-blue-400 border-blue-500/20 bg-blue-500/10" :
                            b.name === "dev" ? "text-purple-400 border-purple-500/20 bg-purple-500/10" :
                            "text-white/40 border-white/[0.08] bg-white/[0.03]"
                          }`}>
                            {b.name}
                            <span className="ml-1 text-white/20 font-mono">{b.sha}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Feature overview */}
      {project.features.length > 0 && (
        <div className="mb-6">
          <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-3">Feature Overview</div>
          <div className="space-y-2">
            {project.features.map((f: any) => {
              const children = f.children || [];
              const childLive = children.filter((c: any) => c.status === "live").length;
              const childBuilding = children.filter((c: any) => c.status === "building").length;
              return (
                <div key={f.id} className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${STATUS_DOT[f.status] || STATUS_DOT.draft}`} />
                      <span className="text-sm text-white/80 font-medium">{f.title}</span>
                    </div>
                    {children.length > 0 && (
                      <span className="text-[0.6rem] text-white/30">
                        {childLive}/{children.length} live
                        {childBuilding > 0 && ` · ${childBuilding} building`}
                      </span>
                    )}
                  </div>
                  {f.description && (
                    <p className="text-xs text-white/30 mt-1 ml-4 line-clamp-1">{f.description}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Codebase upload — compact */}
      <div>
        <input
          ref={codebaseInputRef}
          type="file"
          accept=".zip,.tar,.tar.gz,.tgz"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handleCodebaseUpload(e.target.files);
            e.target.value = "";
          }}
        />
        {uploading || analyzing ? (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-white/[0.08] bg-white/[0.02]">
            <div className="w-4 h-4 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-xs text-white/40">
              {uploading ? "Uploading..." : "Analyzing codebase..."}
            </span>
          </div>
        ) : (
          <button
            onClick={() => codebaseInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-3 rounded-lg border border-dashed border-white/[0.08] bg-white/[0.02] text-white/40 hover:text-white/60 hover:border-white/[0.15] transition-colors text-xs w-full"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            {project.deployUrl ? "Upload new codebase" : "Upload codebase (.zip)"}
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";

type VariantData = {
  id: string;
  label: string;
  isMain: boolean;
  status: string;
  port: number | null;
  buildLogs: string | null;
  createdAt: string;
};

type Props = {
  feature: {
    id: string;
    title: string;
    description: string;
    enabled: boolean;
    status: string;
    parentId: string | null;
    route?: string | null;
    children?: any[];
    builds: { id: string; status: string; buildLogs: string | null; createdAt: string }[];
    variants?: VariantData[];
    githubBranch?: string | null;
    githubPrUrl?: string | null;
    githubPrNumber?: number | null;
  };
  projectId: string;
  githubRepo?: string | null;
  deployUrl: string | null;
  deployStatus: string;
  parentTitle: string | null;
  parentRoute: string | null;
  onUpdate: () => void;
  autoOpenAddFeature?: boolean;
  onAutoOpenAddFeatureConsumed?: () => void;
  onAddMajorFeature?: () => void;
};

function deriveRoute(title: string): string {
  return "/" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function previewUrl(projectId: string, route: string, isolate: boolean = false, variantId?: string): string {
  const cleanRoute = route.startsWith("/") ? route.slice(1) : route;
  let base = `/api/preview/${cleanRoute}?projectId=${projectId}`;
  if (variantId) base += `&variantId=${variantId}`;
  return isolate ? `${base}&isolate=true` : base;
}

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  draft: { text: "Ready to build", color: "text-white/40 bg-white/[0.06]" },
  building: { text: "Building...", color: "text-yellow-400 bg-yellow-500/10" },
  live: { text: "Live", color: "text-green-400 bg-green-500/10" },
  error: { text: "Error", color: "text-red-400 bg-red-500/10" },
};

export function PaneFeature({ feature, projectId, githubRepo, deployUrl, deployStatus, parentTitle, parentRoute, onUpdate, autoOpenAddFeature, onAutoOpenAddFeatureConsumed, onAddMajorFeature }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(feature.title);
  const [description, setDescription] = useState(feature.description);
  const [building, setBuilding] = useState(false);
  const [buildPrompt, setBuildPrompt] = useState("");
  const [addingFeature, setAddingFeature] = useState(false);
  const [newFeatureTitle, setNewFeatureTitle] = useState("");
  const [newFeaturePrompt, setNewFeaturePrompt] = useState("");
  const [addingLoading, setAddingLoading] = useState(false);
  const [pushingToClient, setPushingToClient] = useState(false);
  const [pushedToClient, setPushedToClient] = useState(false);
  const [pushingToGithub, setPushingToGithub] = useState(false);
  const [pushedToGithub, setPushedToGithub] = useState(false);
  const [githubPushError, setGithubPushError] = useState("");
  const [pullingFromGithub, setPullingFromGithub] = useState(false);
  const [activeVariant, setActiveVariant] = useState<string | null>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);

  const isMajor = !feature.parentId;
  const statusInfo = STATUS_LABEL[feature.status] || STATUS_LABEL.draft;
  const variants = (feature.variants || []) as VariantData[];
  const featurePreviewRoute = feature.route || parentRoute || deriveRoute(parentTitle || feature.title);
  const anyBuilding = feature.status === "building" || variants.some(v => v.status === "building");
  const anyChildBuilding = (feature.children || []).some((c: any) => c.status === "building");
  const latestBuild = (feature.builds || [])[0] || null;

  // Auto-open add feature form
  useEffect(() => {
    if (autoOpenAddFeature && isMajor) {
      setAddingFeature(true);
      onAutoOpenAddFeatureConsumed?.();
    }
  }, [autoOpenAddFeature, isMajor, onAutoOpenAddFeatureConsumed]);

  // Poll while building
  useEffect(() => {
    if (!anyBuilding && !anyChildBuilding) return;
    const interval = setInterval(() => onUpdate(), 5000);
    return () => clearInterval(interval);
  }, [anyBuilding, anyChildBuilding, onUpdate]);

  async function handleSave() {
    await fetch(`/api/features/${feature.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description }),
    });
    setEditing(false);
    onUpdate();
  }

  async function handleDelete() {
    if (!confirm(`Delete "${feature.title}"? This cannot be undone.`)) return;
    await fetch(`/api/features/${feature.id}`, { method: "DELETE" });
    onUpdate();
  }

  async function handleBuild() {
    setBuilding(true);
    await fetch(`/api/features/${feature.id}/build-og`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: buildPrompt }),
    });
    setBuildPrompt("");
    setBuilding(false);
    onUpdate();
  }

  async function handleBuildVariant() {
    setBuilding(true);
    await fetch(`/api/features/${feature.id}/build-variant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: buildPrompt }),
    });
    setBuildPrompt("");
    setBuilding(false);
    onUpdate();
  }

  async function handlePromote(variantId: string) {
    await fetch(`/api/variants/${variantId}/promote`, { method: "POST" });
    onUpdate();
  }

  async function handleRestoreOriginal() {
    await fetch(`/api/features/${feature.id}/restore-original`, { method: "POST" });
    onUpdate();
  }

  async function handleDeleteVariant(variantId: string) {
    await fetch(`/api/variants/${variantId}`, { method: "DELETE" });
    onUpdate();
  }

  async function handleUpdateVariant(variantId: string, prompt: string) {
    setBuilding(true);
    await fetch(`/api/variants/${variantId}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    setBuilding(false);
    onUpdate();
  }

  async function handlePushToGithub() {
    setPushingToGithub(true);
    setGithubPushError("");
    try {
      const res = await fetch(`/api/features/${feature.id}/push-to-github`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        setGithubPushError(err.error || "Push failed");
        return;
      }
      setPushedToGithub(true);
      setTimeout(() => setPushedToGithub(false), 3000);
      onUpdate();
    } catch (err: any) {
      setGithubPushError(err.message);
    } finally {
      setPushingToGithub(false);
    }
  }

  async function handlePullFromGithub() {
    if (!feature.githubBranch) return;
    setPullingFromGithub(true);
    setGithubPushError("");
    try {
      // Trigger a sync for this specific feature's branch
      const res = await fetch(`/api/projects/${projectId}/github/sync`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        setGithubPushError(err.error || "Pull failed");
        return;
      }
      onUpdate();
    } catch (err: any) {
      setGithubPushError(err.message);
    } finally {
      setPullingFromGithub(false);
    }
  }

  // Preview URL based on active variant selection
  const currentPreviewUrl = activeVariant
    ? previewUrl(projectId, featurePreviewRoute, true, activeVariant)
    : previewUrl(projectId, featurePreviewRoute, true);

  // ── Minor Feature ──
  if (!isMajor) {
    return (
      <div>
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl font-semibold text-[#f1f5f9]">{feature.title}</h2>
            <span className={`text-[0.6rem] px-2 py-0.5 rounded-full font-medium ${statusInfo.color}`}>
              {statusInfo.text}
            </span>
          </div>
          <p className="text-sm text-white/40">{feature.description}</p>
        </div>

        {/* Building indicator */}
        {feature.status === "building" && (
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3 mb-4 flex items-center gap-3">
            <span className="w-3 h-3 border-2 border-yellow-400/40 border-t-yellow-400 rounded-full animate-spin" />
            <span className="text-xs text-yellow-400/80">Building this feature...</span>
          </div>
        )}

        {/* Build log (collapsed, only on error) */}
        {latestBuild?.status === "failed" && latestBuild?.buildLogs && (
          <details className="mb-4">
            <summary className="text-[0.6rem] uppercase tracking-widest text-red-400/50 cursor-pointer hover:text-red-400/70 mb-1">
              Build Error
            </summary>
            <pre className="text-[0.6rem] whitespace-pre-wrap max-h-32 overflow-y-auto rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-red-400/60">
              {latestBuild.buildLogs.slice(-2000)}
            </pre>
          </details>
        )}

        {/* Build action */}
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 mb-4">
          <textarea
            value={buildPrompt}
            onChange={(e) => setBuildPrompt(e.target.value)}
            placeholder="Describe what to build or change..."
            rows={3}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 resize-none mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={handleBuild}
              disabled={building || anyBuilding}
              className="px-4 py-2 text-xs rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {building || anyBuilding ? "Building..." : "Rebuild"}
            </button>
            <button
              onClick={handleBuildVariant}
              disabled={building || anyBuilding}
              className="px-4 py-2 text-xs rounded-lg bg-white/[0.06] text-white/50 hover:text-white/70 hover:bg-white/[0.1] disabled:opacity-40 transition-colors"
            >
              Create Variant
            </button>
          </div>
        </div>

        {/* GitHub push */}
        {githubRepo && feature.status === "live" && (
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-white/40" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                <span className="text-[0.6rem] uppercase tracking-widest text-white/30">GitHub</span>
              </div>
              {feature.githubPrUrl && (
                <a
                  href={feature.githubPrUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[0.6rem] text-blue-400/60 hover:text-blue-400 transition"
                >
                  PR #{feature.githubPrNumber}
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
            </div>
            {githubPushError && <p className="text-xs text-red-400 mb-2">{githubPushError}</p>}
            {feature.githubBranch && (
              <div className="text-[0.55rem] text-white/30 mb-2">
                Branch: <span className="text-white/50 font-mono">{feature.githubBranch}</span>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handlePushToGithub}
                disabled={pushingToGithub}
                className="flex-1 px-4 py-2 text-xs rounded-lg bg-white/[0.06] text-white/60 hover:bg-white/[0.1] hover:text-white/80 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                {pushingToGithub ? "Pushing..." : pushedToGithub ? "Pushed!" : feature.githubPrUrl ? "Push" : "Push & PR"}
              </button>
              {feature.githubBranch && (
                <button
                  onClick={handlePullFromGithub}
                  disabled={pullingFromGithub}
                  className="flex-1 px-4 py-2 text-xs rounded-lg bg-white/[0.06] text-white/60 hover:bg-white/[0.1] hover:text-white/80 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  {pullingFromGithub ? "Pulling..." : "Pull"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Preview */}
        {deployUrl && featurePreviewRoute && feature.enabled && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[0.6rem] uppercase tracking-widest text-white/30">Preview</span>
                {/* Variant switcher */}
                {variants.length > 0 && (
                  <select
                    value={activeVariant || ""}
                    onChange={(e) => setActiveVariant(e.target.value || null)}
                    className="text-[0.6rem] bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 text-white/60 focus:outline-none"
                  >
                    <option value="" className="bg-[#0c1120]">Original</option>
                    {variants.filter(v => v.status === "live" || v.port).map(v => (
                      <option key={v.id} value={v.id} className="bg-[#0c1120]">
                        {v.label}{v.isMain ? " ★" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <a
                href={currentPreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[0.6rem] text-blue-400 hover:text-blue-300"
              >
                Open in new tab
              </a>
            </div>
            <div className={`rounded-lg border overflow-hidden bg-white ${feature.status === "building" ? "border-yellow-500/30" : "border-white/[0.08]"}`}>
              <iframe
                ref={previewRef}
                src={currentPreviewUrl}
                className="w-full border-0"
                style={{ height: "400px" }}
                title={`Preview of ${feature.title}`}
              />
            </div>
          </div>
        )}

        {/* Variants management (compact) */}
        {variants.length > 0 && (
          <div className="mb-4">
            <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-2">Variants</div>
            <div className="space-y-1.5">
              {variants.map(v => (
                <div key={v.id} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${v.isMain ? "border-yellow-500/30 bg-yellow-500/5" : "border-white/[0.08] bg-white/[0.02]"}`}>
                  <div className="flex items-center gap-2">
                    {v.isMain && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" className="text-yellow-400">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    )}
                    <span className="text-xs text-white/60">{v.label}</span>
                    {v.status === "building" && (
                      <span className="w-2 h-2 border border-yellow-400/40 border-t-yellow-400 rounded-full animate-spin" />
                    )}
                    <span className={`text-[0.55rem] px-1.5 py-0.5 rounded-full ${STATUS_LABEL[v.status]?.color || "text-white/30 bg-white/[0.06]"}`}>
                      {v.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {v.status === "live" && !v.isMain && (
                      <button
                        onClick={() => handlePromote(v.id)}
                        className="text-[0.6rem] px-2 py-1 rounded text-yellow-400/60 hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                      >
                        Promote
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteVariant(v.id)}
                      className="text-[0.6rem] px-2 py-1 rounded text-red-400/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              {variants.some(v => v.isMain) && (
                <button
                  onClick={handleRestoreOriginal}
                  className="text-[0.6rem] text-white/20 hover:text-white/40 transition-colors px-2 py-1"
                >
                  Restore original as live
                </button>
              )}
            </div>
          </div>
        )}

        {/* Delete */}
        <div className="border-t border-white/[0.06] pt-4 mt-6">
          <button
            onClick={handleDelete}
            className="text-xs text-red-400/30 hover:text-red-400 transition-colors"
          >
            Delete feature
          </button>
        </div>
      </div>
    );
  }

  // ── Major Feature ──
  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          {editing ? (
            <div className="space-y-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-transparent border border-white/10 rounded px-2 py-1 text-lg text-white font-semibold focus:outline-none focus:border-white/20"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full bg-transparent border border-white/10 rounded px-2 py-1 text-sm text-white/60 focus:outline-none focus:border-white/20 resize-none"
              />
              <div className="flex gap-2">
                <button onClick={handleSave} className="text-xs text-blue-400 hover:text-blue-300">Save</button>
                <button onClick={() => setEditing(false)} className="text-xs text-white/30 hover:text-white/50">Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-semibold text-[#f1f5f9]">{feature.title}</h2>
                <button
                  onClick={() => { setTitle(feature.title); setDescription(feature.description); setEditing(true); }}
                  className="text-white/20 hover:text-white/50 transition-colors p-1"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    <path d="m15 5 4 4" />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-white/40">{feature.description}</p>
            </>
          )}
        </div>
      </div>

      {/* Build progress */}
      {feature.status === "building" && (
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3 mb-4 flex items-center gap-3">
          <span className="w-3 h-3 border-2 border-yellow-400/40 border-t-yellow-400 rounded-full animate-spin" />
          <span className="text-xs text-yellow-400/80">Building...</span>
        </div>
      )}

      {/* Minor features list */}
      {feature.children && feature.children.length > 0 && (
        <div className="mb-6">
          <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-2">Features</div>
          <div className="space-y-1.5">
            {feature.children.map((child: any) => (
              <div
                key={child.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg border bg-white/[0.02] border-white/[0.06]"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    child.status === "live" ? "bg-white/40" :
                    child.status === "building" ? "bg-yellow-400 animate-pulse" :
                    child.status === "error" ? "bg-red-400" :
                    "bg-white/20"
                  }`} />
                  <span className={`text-xs truncate ${child.enabled ? "text-white/70" : "text-white/30 line-through"}`}>
                    {child.title}
                  </span>
                </div>
                <button
                  onClick={async () => {
                    await fetch(`/api/features/${child.id}/toggle`, { method: "POST" });
                    onUpdate();
                  }}
                  className={`w-7 h-4 rounded-full transition-colors relative shrink-0 ${
                    child.enabled ? "bg-blue-500" : "bg-white/10"
                  }`}
                >
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                    child.enabled ? "left-3.5" : "left-0.5"
                  }`} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add feature */}
      <div className="mb-6">
        {addingFeature ? (
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
            <input
              value={newFeatureTitle}
              onChange={(e) => setNewFeatureTitle(e.target.value)}
              placeholder="Feature name"
              autoFocus
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/20"
            />
            <textarea
              value={newFeaturePrompt}
              onChange={(e) => setNewFeaturePrompt(e.target.value)}
              placeholder="Describe what this feature should do..."
              rows={3}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (!newFeatureTitle.trim() || !newFeaturePrompt.trim() || addingLoading) return;
                  setAddingLoading(true);
                  try {
                    const createRes = await fetch(`/api/projects/${projectId}/features`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ title: newFeatureTitle.trim(), description: newFeaturePrompt.trim(), parentId: feature.id }),
                    });
                    if (!createRes.ok) return;
                    const newFeature = await createRes.json();
                    await fetch(`/api/features/${newFeature.id}/build-og`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ prompt: newFeaturePrompt.trim() }),
                    });
                    setNewFeatureTitle("");
                    setNewFeaturePrompt("");
                    setAddingFeature(false);
                    onUpdate();
                  } finally {
                    setAddingLoading(false);
                  }
                }}
                disabled={addingLoading || !newFeatureTitle.trim() || !newFeaturePrompt.trim()}
                className="px-4 py-2 text-xs rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {addingLoading ? "Creating..." : "Build Feature"}
              </button>
              <button
                onClick={() => { setAddingFeature(false); setNewFeatureTitle(""); setNewFeaturePrompt(""); }}
                className="px-4 py-2 text-xs text-white/30 hover:text-white/50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => setAddingFeature(true)}
              className="text-[0.6rem] text-white/20 hover:text-white/40 transition-colors"
            >
              + Add minor feature
            </button>
            {onAddMajorFeature && (
              <button
                onClick={onAddMajorFeature}
                className="text-[0.6rem] text-red-400/40 hover:text-red-400/70 transition-colors"
              >
                + Add major feature
              </button>
            )}
          </div>
        )}
      </div>

      {/* Preview */}
      {deployUrl && (() => {
        const majorRoute = feature.route || deriveRoute(feature.title);
        return (
          <div className="border-t border-white/[0.06] pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[0.6rem] uppercase tracking-widest text-white/30">Preview</span>
              <div className="flex items-center gap-3">
                {deployStatus === "running" && (
                  <button
                    onClick={async () => {
                      setPushingToClient(true);
                      try {
                        const res = await fetch(`/api/projects/${projectId}/push-client`, { method: "POST" });
                        if (res.ok) {
                          setPushedToClient(true);
                          setTimeout(() => setPushedToClient(false), 3000);
                        }
                      } finally {
                        setPushingToClient(false);
                      }
                    }}
                    disabled={pushingToClient}
                    className={`text-[0.6rem] px-2.5 py-1 rounded-md transition-colors ${
                      pushedToClient
                        ? "bg-green-500/10 text-green-400"
                        : "bg-white/[0.08] text-white/50 hover:text-white/80"
                    }`}
                  >
                    {pushingToClient ? "Pushing..." : pushedToClient ? "Pushed!" : "Push to Client"}
                  </button>
                )}
                <a
                  href={previewUrl(projectId, majorRoute)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[0.6rem] text-blue-400 hover:text-blue-300"
                >
                  Open in new tab
                </a>
              </div>
            </div>
            <div className="rounded-lg border border-white/[0.08] overflow-hidden bg-white">
              <iframe
                src={previewUrl(projectId, majorRoute)}
                className="w-full border-0"
                style={{ height: "450px" }}
                title={`Preview of ${feature.title}`}
              />
            </div>
          </div>
        );
      })()}

      {/* Delete */}
      <div className="border-t border-white/[0.06] pt-4 mt-6">
        <button
          onClick={handleDelete}
          className="text-xs text-red-400/30 hover:text-red-400 transition-colors"
        >
          Delete feature & all sub-features
        </button>
      </div>
    </div>
  );
}

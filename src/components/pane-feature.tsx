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

function BuildCountdown() {
  const [remaining, setRemaining] = useState("10:00");
  const mountTime = useRef(Date.now());

  useEffect(() => {
    const buildEnd = mountTime.current + 10 * 60 * 1000;

    function tick() {
      const left = Math.max(0, buildEnd - Date.now());
      const mins = Math.floor(left / 60000);
      const secs = Math.floor((left % 60000) / 1000);
      setRemaining(`${mins}:${secs.toString().padStart(2, "0")}`);
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="text-[0.55rem] text-yellow-400/80 font-mono">
      Building {remaining}
    </span>
  );
}

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
  };
  projectId: string;
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
  // Proxy through our API to avoid mixed-content / localhost blocking
  const cleanRoute = route.startsWith("/") ? route.slice(1) : route;
  let base = `/api/preview/${cleanRoute}?projectId=${projectId}`;
  if (variantId) base += `&variantId=${variantId}`;
  return isolate ? `${base}&isolate=true` : base;
}

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  draft: { text: "Ready to build", color: "text-white/40 bg-white/[0.06]" },
  building: { text: "Building...", color: "text-yellow-400 bg-yellow-500/10" },
  live: { text: "Live", color: "text-white/50 bg-white/[0.06]" },
  error: { text: "Error", color: "text-red-400 bg-red-500/10" },
};

export function PaneFeature({ feature, projectId, deployUrl, deployStatus, parentTitle, parentRoute, onUpdate, autoOpenAddFeature, onAutoOpenAddFeatureConsumed, onAddMajorFeature }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(feature.title);
  const [description, setDescription] = useState(feature.description);
  const [building, setBuilding] = useState(false);
  const [addingFeature, setAddingFeature] = useState(false);
  const [newFeatureTitle, setNewFeatureTitle] = useState("");
  const [newFeaturePrompt, setNewFeaturePrompt] = useState("");
  const [pushingToClient, setPushingToClient] = useState(false);
  const [pushedToClient, setPushedToClient] = useState(false);
  const [addingLoading, setAddingLoading] = useState(false);

  // Auto-open add feature form when triggered from sidebar
  useEffect(() => {
    if (autoOpenAddFeature && !feature.parentId) {
      setAddingFeature(true);
      onAutoOpenAddFeatureConsumed?.();
    }
  }, [autoOpenAddFeature, feature.parentId, onAutoOpenAddFeatureConsumed]);

  const isMajor = !feature.parentId;
  const statusInfo = STATUS_LABEL[feature.status] || STATUS_LABEL.draft;
  const latestBuild = (feature.builds || [])[0] || null;

  let buildProgress: { step: number; total: number; message: string } | null = null;
  if (latestBuild?.buildLogs) {
    try {
      buildProgress = JSON.parse(latestBuild.buildLogs);
    } catch { /* ignore */ }
  }

  async function handleSave() {
    await fetch(`/api/features/${feature.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description }),
    });
    setEditing(false);
    onUpdate();
  }

  async function handleBuild() {
    setBuilding(true);
    await fetch(`/api/features/${feature.id}/build`, { method: "POST" });
    setBuilding(false);
    onUpdate();
  }

  async function handleDelete() {
    if (!confirm(`Delete "${feature.title}"? This cannot be undone.`)) return;
    await fetch(`/api/features/${feature.id}`, { method: "DELETE" });
    onUpdate();
  }

  const [buildMode, setBuildMode] = useState<"og" | "variant">("og");
  const [buildPrompt, setBuildPrompt] = useState("");
  const [buildExpanded, setBuildExpanded] = useState(false);
  const variants = (feature.variants || []) as VariantData[];
  const featurePreviewRoute = feature.route || parentRoute || deriveRoute(parentTitle || feature.title);
  const previewRef = useRef<HTMLIFrameElement>(null);

  // Auto-refresh while building — only refresh main preview for OG builds,
  // always poll for status updates
  const ogBuilding = feature.status === "building";
  const anyBuilding = ogBuilding || variants.some(v => v.status === "building");
  useEffect(() => {
    if (!anyBuilding) return;
    const interval = setInterval(() => {
      // Only refresh the main preview iframe for OG builds — variant builds
      // check out their branch which would flip the main preview
      if (ogBuilding && previewRef.current) {
        previewRef.current.src = previewRef.current.src;
      }
      onUpdate();
    }, 5000);
    return () => clearInterval(interval);
  }, [anyBuilding, ogBuilding, onUpdate]);

  async function handleBuildOg() {
    setBuilding(true);
    await fetch(`/api/features/${feature.id}/build-og`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: buildPrompt }),
    });
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
    setBuilding(false);
    onUpdate();
  }

  const [expandedVariant, setExpandedVariant] = useState<string | null>(null);
  const [editingVariant, setEditingVariant] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [updatingVariant, setUpdatingVariant] = useState<string | null>(null);
  const [updatePrompt, setUpdatePrompt] = useState("");
  const variantPreviewRef = useRef<HTMLIFrameElement>(null);

  const anyPromoted = variants.some(v => v.isMain);

  function bustIframe(ref: React.RefObject<HTMLIFrameElement | null>) {
    if (!ref.current) return;
    const url = new URL(ref.current.src, window.location.origin);
    url.searchParams.set("_t", Date.now().toString());
    ref.current.src = url.toString();
  }

  async function handleRestoreOriginal() {
    await fetch(`/api/features/${feature.id}/restore-original`, { method: "POST" });
    onUpdate();
    // Give the dev server time to recompile after restore
    setTimeout(() => bustIframe(previewRef), 3000);
  }

  async function handlePromote(variantId: string) {
    await fetch(`/api/variants/${variantId}/promote`, { method: "POST" });
    onUpdate();
    // Give the dev server time to recompile after merge
    setTimeout(() => bustIframe(previewRef), 3000);
  }

  async function handleDeleteVariant(variantId: string) {
    if (expandedVariant === variantId) setExpandedVariant(null);
    await fetch(`/api/variants/${variantId}`, { method: "DELETE" });
    onUpdate();
  }

  async function handleRenameVariant(variantId: string) {
    if (!editingLabel.trim()) return;
    await fetch(`/api/variants/${variantId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: editingLabel.trim() }),
    });
    setEditingVariant(null);
    onUpdate();
  }

  function handleToggleVariantPreview(variantId: string) {
    if (expandedVariant === variantId) {
      setExpandedVariant(null);
    } else {
      setExpandedVariant(variantId);
    }
  }

  async function handleUpdateVariant(variantId: string) {
    if (!updatePrompt.trim()) return;
    setBuilding(true);
    await fetch(`/api/variants/${variantId}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: updatePrompt.trim() }),
    });
    setUpdatePrompt("");
    setUpdatingVariant(null);
    setBuilding(false);
    onUpdate();
  }

  // Minor feature pane
  if (!isMajor) {
    return (
      <div>
        {/* Header with status */}
        <div className="mb-4">
          <div className="flex items-start justify-between">
            <h2 className="text-xl font-semibold text-[#f1f5f9] mb-1">{feature.title}</h2>
          </div>
          <p className="text-sm text-white/40 mb-1">{feature.description}</p>
        </div>

        {/* Build progress bar when building */}
        {feature.status === "building" && (
          <div className="bg-white/[0.03] rounded-lg border border-yellow-500/20 p-4 mb-4">
            <div className="flex items-center gap-3 mb-2">
              <span className="w-2.5 h-2.5 border-2 border-yellow-400/40 border-t-yellow-400 rounded-full animate-spin" />
              <span className="text-xs text-yellow-400/80">Claude Code is building this feature...</span>
            </div>
            <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-yellow-500/60 to-yellow-400/80 animate-pulse" style={{ width: "100%" }} />
            </div>
          </div>
        )}

        {/* Build log from latest build */}
        {latestBuild?.buildLogs && feature.status !== "building" && (
          <details className="mb-4">
            <summary className="text-[0.6rem] uppercase tracking-widest text-white/30 cursor-pointer hover:text-white/50 mb-2">
              Build Log {latestBuild.status === "failed" ? "(failed)" : ""}
            </summary>
            <pre className={`text-[0.6rem] whitespace-pre-wrap max-h-48 overflow-y-auto rounded-lg border p-3 ${
              latestBuild.status === "failed"
                ? "text-red-400/60 border-red-500/20 bg-red-500/5"
                : "text-white/30 border-white/[0.06] bg-white/[0.02]"
            }`}>
              {latestBuild.buildLogs.slice(-3000)}
            </pre>
          </details>
        )}

        {/* Build mode toggle + action */}
        <div className="bg-white/[0.03] rounded-lg border border-white/[0.08] p-4 mb-4">
          <div className="flex gap-1 mb-3">
            <button
              onClick={() => setBuildMode("og")}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                buildMode === "og"
                  ? "bg-white/[0.1] text-white"
                  : "text-white/30 hover:text-white/50"
              }`}
            >
              Build on OG
            </button>
            <button
              onClick={() => setBuildMode("variant")}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                buildMode === "variant"
                  ? "bg-white/[0.1] text-white"
                  : "text-white/30 hover:text-white/50"
              }`}
            >
              Build Variant
            </button>
          </div>

          <p className="text-[0.65rem] text-white/30 mb-2">
            {buildMode === "og"
              ? "Rebuild the original in-place. Describe what to change or improve."
              : "Create a new variant for comparison. Describe the alternative approach."}
          </p>

          <textarea
            value={buildPrompt}
            onChange={(e) => setBuildPrompt(e.target.value)}
            placeholder={buildMode === "og"
              ? "e.g. Make the form wider, add a forgot password link below the submit button..."
              : "e.g. Use a split-screen layout with an illustration on the left side..."}
            rows={3}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 resize-none mb-3"
          />

          <button
            onClick={buildMode === "og" ? handleBuildOg : handleBuildVariant}
            disabled={building || anyBuilding}
            className="px-4 py-2 text-xs rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {building || anyBuilding
              ? "Building..."
              : buildMode === "og"
                ? "Rebuild Original"
                : "Create Variant"}
          </button>
        </div>

        {/* Live Version Preview — hidden when feature is disabled */}
        {deployUrl && featurePreviewRoute && feature.enabled && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[0.6rem] uppercase tracking-widest text-white/30">
                  Live Version{anyPromoted ? ` (${variants.find(v => v.isMain)?.label || "Variant"})` : ""}
                </span>
                {feature.status === "building" && (
                  <span className="flex items-center gap-1.5 text-[0.55rem] text-yellow-400/60">
                    <span className="w-2 h-2 border border-yellow-400/40 border-t-yellow-400 rounded-full animate-spin" />
                    Building...
                  </span>
                )}
              </div>
              <a
                href={previewUrl(projectId, featurePreviewRoute, true)}
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
                src={previewUrl(projectId, featurePreviewRoute, true)}
                className="w-full border-0"
                style={{ height: "400px" }}
                title={`Preview of ${feature.title}`}
              />
            </div>
          </div>
        )}

        {/* Variants list */}
        <div className="space-y-2">
          {/* Original card — starred when no variant is promoted */}
          <div className={`rounded-lg border ${!anyPromoted ? "border-yellow-500/30" : "border-white/[0.08]"}`}>
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRestoreOriginal}
                  disabled={!anyPromoted}
                  className={`transition-colors ${
                    !anyPromoted
                      ? "text-yellow-400"
                      : "text-white/20 hover:text-yellow-400"
                  }`}
                  title={!anyPromoted ? "Live version" : "Restore original as live"}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill={!anyPromoted ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </button>
                <span className="text-xs text-white/60">Original</span>
              </div>
            </div>
          </div>

          {/* Variant cards */}
          {variants.map((variant) => {
            const isExpanded = expandedVariant === variant.id;
            const isEditing = editingVariant === variant.id;
            return (
              <div key={variant.id} className={`rounded-lg border ${variant.isMain ? "border-yellow-500/30" : "border-white/[0.08]"}`}>
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePromote(variant.id)}
                      disabled={variant.status !== "live"}
                      className={`transition-colors ${
                        variant.isMain
                          ? "text-yellow-400"
                          : variant.status === "live"
                            ? "text-white/20 hover:text-yellow-400"
                            : "text-white/10 cursor-not-allowed"
                      }`}
                      title={variant.isMain ? "Live version" : "Promote to live"}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill={variant.isMain ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </button>
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editingLabel}
                        onChange={(e) => setEditingLabel(e.target.value)}
                        onBlur={() => handleRenameVariant(variant.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameVariant(variant.id);
                          if (e.key === "Escape") setEditingVariant(null);
                        }}
                        className="text-xs text-white bg-transparent border border-white/20 rounded px-1.5 py-0.5 w-32 focus:outline-none focus:border-white/40"
                      />
                    ) : (
                      <>
                        <span className="text-xs text-white/60">{variant.label}</span>
                        <button
                          onClick={() => {
                            setEditingVariant(variant.id);
                            setEditingLabel(variant.label);
                          }}
                          className="text-white/20 hover:text-white/50 transition-colors"
                          title="Rename"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                            <path d="m15 5 4 4" />
                          </svg>
                        </button>
                      </>
                    )}
                    {variant.status === "building" && (
                      <BuildCountdown />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {variant.status !== "draft" && (
                      <>
                        <button
                          onClick={() => handleToggleVariantPreview(variant.id)}
                          className={`text-[0.6rem] px-2 py-1 rounded transition-colors ${
                            expandedVariant === variant.id
                              ? "bg-blue-500/20 text-blue-400"
                              : "text-blue-400/60 hover:text-blue-400 hover:bg-blue-500/10"
                          }`}
                        >
                          {expandedVariant === variant.id ? "Hide" : "Preview"}
                        </button>
                        <button
                          onClick={() => {
                            if (updatingVariant === variant.id) {
                              setUpdatingVariant(null);
                              setUpdatePrompt("");
                            } else {
                              setUpdatingVariant(variant.id);
                            }
                          }}
                          className={`text-[0.6rem] px-2 py-1 rounded transition-colors ${
                            updatingVariant === variant.id
                              ? "bg-purple-500/20 text-purple-400"
                              : "text-purple-400/60 hover:text-purple-400 hover:bg-purple-500/10"
                          }`}
                        >
                          Update
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDeleteVariant(variant.id)}
                      className="text-[0.6rem] text-red-400/30 hover:text-red-400 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Variant preview — uses its own dev server, does not touch main */}
                {expandedVariant === variant.id && variant.port && deployUrl && featurePreviewRoute && (
                  <div className="border-t border-white/[0.06] p-2">
                    <div className="rounded-lg border border-blue-500/30 overflow-hidden bg-white">
                      <iframe
                        src={previewUrl(projectId, featurePreviewRoute, true, variant.id)}
                        className="w-full border-0"
                        style={{ height: "350px" }}
                        title={`Preview of ${variant.label}`}
                      />
                    </div>
                  </div>
                )}
                {expandedVariant === variant.id && !variant.port && (
                  <div className="border-t border-white/[0.06] px-3 py-2">
                    <p className="text-xs text-white/30">No preview server available. Rebuild this variant to enable preview.</p>
                  </div>
                )}

                {/* Update variant input */}
                {updatingVariant === variant.id && (
                  <div className="border-t border-white/[0.06] px-3 py-2 space-y-2">
                    <textarea
                      value={updatePrompt}
                      onChange={(e) => setUpdatePrompt(e.target.value)}
                      placeholder="What would you like to change?"
                      rows={3}
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 resize-none"
                    />
                    <button
                      onClick={() => handleUpdateVariant(variant.id)}
                      disabled={building || !updatePrompt.trim()}
                      className="px-4 py-2 text-xs rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {building ? "Building..." : "Build"}
                    </button>
                  </div>
                )}

                {variant.status === "error" && variant.buildLogs && (
                  <div className="px-3 py-2 border-t border-white/[0.06]">
                    <pre className="text-[0.6rem] text-red-400/60 whitespace-pre-wrap max-h-32 overflow-y-auto">
                      {variant.buildLogs.slice(-500)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Delete feature */}
        <div className="border-t border-white/[0.06] pt-4 mt-6">
          <button
            onClick={handleDelete}
            className="px-4 py-2 text-xs rounded-lg text-red-400/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            Delete feature
          </button>
        </div>
      </div>
    );
  }

  // Poll for updates while any child feature is building
  const anyChildBuilding = (feature.children || []).some((c: any) => c.status === "building");
  useEffect(() => {
    if (!anyChildBuilding) return;
    const interval = setInterval(() => onUpdate(), 5000);
    return () => clearInterval(interval);
  }, [anyChildBuilding, onUpdate]);

  // Major feature pane
  return (
    <div>
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
              <h2 className="text-xl font-semibold text-[#f1f5f9] mb-1">{feature.title}</h2>
              <p className="text-sm text-white/40 mb-3">{feature.description}</p>
            </>
          )}
        </div>
      </div>

      {feature.status === "building" && buildProgress && (
        <div className="bg-white/[0.03] rounded-lg p-4 border border-white/[0.08] mb-4">
          <div className="flex justify-between text-[0.65rem] text-white/40 mb-1.5">
            <span>{buildProgress.message}</span>
            <span>{Math.round((buildProgress.step / buildProgress.total) * 100)}%</span>
          </div>
          <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-red-500 to-blue-500 transition-all duration-700"
              style={{ width: `${Math.round((buildProgress.step / buildProgress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Minor features list with toggle and add */}
      {feature.children && feature.children.length > 0 && (
        <div className="mb-6">
          <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-2">
            Features
          </div>
          <div className="space-y-1.5">
            {feature.children.map((child: any) => (
              <div
                key={child.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg border bg-white/[0.03] border-white/[0.06] group"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-white/70">{child.title}</div>
                  {child.description && (
                    <div className="text-[0.6rem] text-white/30 truncate">{child.description}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {child.status === "building" && (
                    <span className="flex items-center gap-1 text-[0.55rem] text-yellow-400/60">
                      <span className="w-1.5 h-1.5 border border-yellow-400/40 border-t-yellow-400 rounded-full animate-spin" />
                    </span>
                  )}
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    child.status === "live" ? "bg-white/40" :
                    child.status === "building" ? "bg-yellow-400" :
                    child.status === "error" ? "bg-red-400" :
                    "bg-white/20"
                  }`} />
                  <button
                    onClick={async () => {
                      await fetch(`/api/features/${child.id}/toggle`, { method: "POST" });
                      onUpdate();
                    }}
                    className={`w-7 h-4 rounded-full transition-colors relative ${
                      child.enabled ? "bg-blue-500" : "bg-white/10"
                    }`}
                  >
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                      child.enabled ? "left-3.5" : "left-0.5"
                    }`} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add minor feature */}
      <div className="mb-6">
        {addingFeature ? (
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
            <p className="text-[0.6rem] uppercase tracking-widest text-white/30">New Feature</p>
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
              placeholder="Describe what this feature should do. Claude Code will build it for you..."
              rows={4}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (!newFeatureTitle.trim() || !newFeaturePrompt.trim() || addingLoading) return;
                  setAddingLoading(true);
                  try {
                    // Create the feature
                    const createRes = await fetch(`/api/projects/${projectId}/features`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        title: newFeatureTitle.trim(),
                        description: newFeaturePrompt.trim(),
                        parentId: feature.id,
                      }),
                    });
                    if (!createRes.ok) return;
                    const newFeature = await createRes.json();

                    // Trigger Claude Code build
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
                className="px-4 py-2 text-xs rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {addingLoading ? "Creating..." : "Build Feature"}
              </button>
              <button
                onClick={() => { setAddingFeature(false); setNewFeatureTitle(""); setNewFeaturePrompt(""); }}
                className="px-4 py-2 text-xs rounded-lg text-white/30 hover:text-white/50 transition-colors"
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

      {deployUrl && (() => {
        const majorRoute = feature.route || deriveRoute(feature.title);
        const disabledChildRoutes = (feature.children || [])
          .filter((c: any) => !c.enabled && c.route)
          .map((c: any) => c.route);
        const previewDisabled = disabledChildRoutes.includes(majorRoute);
        if (previewDisabled) return null;
        return (
          <div className="mt-6 border-t border-white/[0.06] pt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[0.6rem] uppercase tracking-widest text-white/30">
                Preview — {feature.title}
              </div>
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
                        : "bg-white/[0.08] text-white/50 hover:text-white/80 hover:bg-white/[0.12]"
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
                style={{ height: "500px" }}
                title={`Preview of ${feature.title}`}
              />
            </div>
          </div>
        );
      })()}

      {/* Delete major feature */}
      <div className="border-t border-white/[0.06] pt-4 mt-6">
        <button
          onClick={handleDelete}
          className="px-4 py-2 text-xs rounded-lg text-red-400/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          Delete feature & all sub-features
        </button>
      </div>
    </div>
  );
}

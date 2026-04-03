"use client";

import { useState, useEffect, useCallback } from "react";
import { MoveToProductionModal } from "./move-to-production-modal";

type FeedbackItemData = {
  id: string;
  text: string;
  title: string | null;
  description: string | null;
  priority: string | null;
  featureType: string | null;
  status: string;
  wishlistItemId: string | null;
  projectId: string;
  createdAt: string;
  project: { id: string; name: string };
};

type WorkspaceMembership = {
  workspaceId: string;
  role: string;
  workspace: { id: string; name: string; slug: string; clients: any[] };
};

type Props = {
  workspaces: WorkspaceMembership[];
  onUpdate: () => void;
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-400 bg-red-500/10",
  medium: "text-yellow-400 bg-yellow-500/10",
  low: "text-white/40 bg-white/[0.06]",
};

export function PaneFeedback({ workspaces, onUpdate }: Props) {
  const allProjects = workspaces.flatMap((m) =>
    m.workspace.clients.flatMap((c: any) =>
      (c.projects || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        clientId: c.id,
        clientName: c.name,
        features: p.features || [],
      }))
    )
  );

  const [selectedProjectId, setSelectedProjectId] = useState<string>(allProjects[0]?.id || "");
  const [items, setItems] = useState<FeedbackItemData[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [embedCode, setEmbedCode] = useState<string | null>(null);
  const [showEmbed, setShowEmbed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [movingItem, setMovingItem] = useState<FeedbackItemData | null>(null);

  const selectedProject = allProjects.find((p) => p.id === selectedProjectId);

  const loadItems = useCallback(async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/feedback?projectId=${selectedProjectId}`, { cache: "no-store" });
      if (res.ok) {
        setItems(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    loadItems();
    setEmbedCode(null);
    setShowEmbed(false);
  }, [loadItems]);

  // Poll while any items are pending
  useEffect(() => {
    const anyPending = items.some((i) => i.status === "pending");
    if (!anyPending) return;
    const interval = setInterval(loadItems, 3000);
    return () => clearInterval(interval);
  }, [items, loadItems]);

  async function loadEmbedCode() {
    if (!selectedProjectId) return;
    const res = await fetch(`/api/projects/${selectedProjectId}/embed-key`);
    if (res.ok) {
      const data = await res.json();
      setEmbedCode(data.embedCode);
      setShowEmbed(true);
    }
  }

  function copyEmbed() {
    if (embedCode) {
      navigator.clipboard.writeText(embedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleDismiss(id: string) {
    await fetch(`/api/feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    });
    loadItems();
  }

  async function handleRestore(id: string) {
    await fetch(`/api/feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "reviewed" }),
    });
    loadItems();
  }

  const reviewed = items.filter((i) => i.status === "reviewed");
  const pending = items.filter((i) => i.status === "pending");
  const dismissed = items.filter((i) => i.status === "dismissed");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-[#f1f5f9]">Feedback</h1>
        <button
          onClick={() => showEmbed ? setShowEmbed(false) : loadEmbedCode()}
          className="px-3 py-1.5 text-xs rounded-lg bg-white/[0.08] text-white/60 hover:text-white/80 hover:bg-white/[0.12] transition-colors"
        >
          {showEmbed ? "Hide Embed" : "Get Embed Code"}
        </button>
      </div>

      {/* Project selector */}
      <div className="mb-4">
        <select
          value={selectedProjectId}
          onChange={(e) => { setSelectedProjectId(e.target.value); setExpandedId(null); }}
          className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/20"
        >
          {allProjects.map((p) => (
            <option key={p.id} value={p.id} className="bg-[#0c1120]">
              {p.clientName} / {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Embed code section */}
      {showEmbed && embedCode && (
        <div className="mb-6 rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 space-y-2">
          <div className="text-[0.6rem] uppercase tracking-widest text-white/30">Embed Code</div>
          <div className="text-xs text-white/40 mb-1">Add this script tag to your app's HTML:</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-blue-400 bg-white/[0.04] px-3 py-2 rounded-lg break-all">
              {embedCode}
            </code>
            <button
              onClick={copyEmbed}
              className="px-3 py-1.5 text-xs rounded-lg bg-white/[0.08] text-white/60 hover:text-white/80 transition-colors shrink-0"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {loading && items.length === 0 ? (
        <p className="text-sm text-white/30">Loading...</p>
      ) : allProjects.length === 0 ? (
        <p className="text-sm text-white/30">No projects yet. Create a project first.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-white/30">No feedback yet. Embed the widget to start collecting.</p>
      ) : (
        <div className="space-y-4">
          {/* Pending (processing) */}
          {pending.length > 0 && (
            <div>
              <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-2">Processing</div>
              <div className="space-y-2">
                {pending.map((item) => (
                  <div key={item.id} className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                    <div className="text-xs text-white/40 truncate">{item.text}</div>
                    <div className="flex items-center gap-1.5 text-[0.6rem] text-yellow-400/60 mt-1">
                      <span className="w-2 h-2 border border-yellow-400/40 border-t-yellow-400 rounded-full animate-spin" />
                      Analyzing...
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reviewed (ready for action) */}
          {reviewed.length > 0 && (
            <div>
              <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-2">
                Ready for Review ({reviewed.length})
              </div>
              <div className="space-y-2">
                {reviewed.map((item) => (
                  <div key={item.id} className="rounded-lg border border-white/[0.08] bg-white/[0.02]">
                    <button
                      onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                      className="w-full text-left px-4 py-3 flex items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-white/70 font-medium">{item.title}</div>
                        <div className="text-[0.6rem] text-white/30 mt-0.5">
                          {new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          {item.featureType && (
                            <span className="ml-2 text-white/20">{item.featureType}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.priority && (
                          <span className={`text-[0.55rem] px-1.5 py-0.5 rounded ${PRIORITY_COLORS[item.priority] || ""}`}>
                            {item.priority}
                          </span>
                        )}
                        <svg
                          className={`text-white/20 transition-transform ${expandedId === item.id ? "rotate-180" : ""}`}
                          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </button>

                    {expandedId === item.id && (
                      <div className="border-t border-white/[0.06] px-4 py-3 space-y-3">
                        <div>
                          <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-1">Original Feedback</div>
                          <div className="text-xs text-white/50 whitespace-pre-wrap">{item.text}</div>
                        </div>
                        {item.description && (
                          <div>
                            <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-1">AI Analysis</div>
                            <div className="text-xs text-white/60">{item.description}</div>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => setMovingItem(item)}
                            className="px-3 py-1.5 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                          >
                            Move to Production
                          </button>
                          <button
                            onClick={() => handleDismiss(item.id)}
                            className="px-3 py-1.5 text-xs text-white/30 hover:text-white/50 transition-colors"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dismissed */}
          {dismissed.length > 0 && (
            <div>
              <button
                onClick={() => setExpandedId(expandedId === "dismissed" ? null : "dismissed")}
                className="text-[0.6rem] uppercase tracking-widest text-white/20 hover:text-white/30 transition-colors"
              >
                Dismissed ({dismissed.length}) {expandedId === "dismissed" ? "▲" : "▼"}
              </button>
              {expandedId === "dismissed" && (
                <div className="space-y-2 mt-2">
                  {dismissed.map((item) => (
                    <div key={item.id} className="rounded-lg border border-white/[0.06] bg-white/[0.01] px-4 py-3 flex items-center justify-between">
                      <div>
                        <div className="text-xs text-white/30">{item.title}</div>
                        <div className="text-[0.6rem] text-white/15">{item.text.slice(0, 80)}{item.text.length > 80 ? "..." : ""}</div>
                      </div>
                      <button
                        onClick={() => handleRestore(item.id)}
                        className="text-[0.6rem] text-white/20 hover:text-white/40 transition-colors shrink-0"
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Move to Production Modal */}
      {movingItem && selectedProject && (
        <MoveToProductionModal
          item={{
            id: movingItem.wishlistItemId || movingItem.id,
            title: movingItem.title || "",
            description: movingItem.description || "",
            priority: movingItem.priority,
          }}
          projects={allProjects}
          onClose={() => { setMovingItem(null); loadItems(); onUpdate(); }}
        />
      )}
    </div>
  );
}

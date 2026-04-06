"use client";

import { useState, useEffect, useCallback } from "react";
import { MoveToProductionModal } from "./move-to-production-modal";

type WishlistItemData = {
  id: string;
  title: string;
  description: string;
  priority: string | null;
  source: string;
  status: string;
  projectId: string | null;
  clientId: string;
  createdAt: string;
  featureId: string | null;
  featureType: string | null;
  suggestedParent: string | null;
  client: { id: string; name: string };
  project: { id: string; name: string } | null;
  meeting: { id: string; type: string; createdAt: string } | null;
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

const PRIORITIES = ["high", "medium", "low"];

export function PaneWishlist({ workspaces, onUpdate }: Props) {
  const allClients = workspaces.flatMap((m) =>
    m.workspace.clients.map((c: any) => ({
      id: c.id,
      name: c.name,
      projects: (c.projects || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        features: p.features || [],
      })),
    }))
  );

  const allProjects = allClients.flatMap((c) => c.projects);

  const [items, setItems] = useState<WishlistItemData[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterClientId, setFilterClientId] = useState("");
  const [filterProjectId, setFilterProjectId] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterStatus, setFilterStatus] = useState("pending");
  const [movingItem, setMovingItem] = useState<WishlistItemData | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFeatureType, setEditFeatureType] = useState<string>("");
  const [editSuggestedParent, setEditSuggestedParent] = useState<string>("");
  const [showParentSuggestions, setShowParentSuggestions] = useState(false);
  const [filterSource, setFilterSource] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addClientId, setAddClientId] = useState(allClients[0]?.id || "");
  const [addProjectId, setAddProjectId] = useState("");
  const [addPriority, setAddPriority] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function generateSamples() {
    const projectId = filterProjectId || allProjects[0]?.id;
    if (!projectId || generating) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/demo/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, type: "wishlist" }),
      });
      if (res.ok) await loadItems();
    } finally {
      setGenerating(false);
    }
  }

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterClientId) params.set("clientId", filterClientId);
      if (filterProjectId) params.set("projectId", filterProjectId);
      if (filterPriority) params.set("priority", filterPriority);
      params.set("status", filterStatus);
      const res = await fetch(`/api/wishlist?${params}`, { cache: "no-store" });
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, [filterClientId, filterProjectId, filterPriority, filterStatus]);

  useEffect(() => { loadItems(); }, [loadItems]);

  async function handleDismiss(id: string) {
    await fetch(`/api/wishlist/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    });
    loadItems();
  }

  async function handleRestore(id: string) {
    await fetch(`/api/wishlist/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "pending" }),
    });
    loadItems();
  }

  async function handleAdd() {
    if (!addTitle.trim() || !addDesc.trim() || !addClientId) return;
    setAddLoading(true);
    try {
      await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: addTitle.trim(),
          description: addDesc.trim(),
          clientId: addClientId,
          projectId: addProjectId || null,
          priority: addPriority || null,
        }),
      });
      setShowAdd(false);
      setAddTitle("");
      setAddDesc("");
      setAddPriority("");
      loadItems();
    } finally {
      setAddLoading(false);
    }
  }

  async function patchItem(id: string, data: Record<string, unknown>) {
    await fetch(`/api/wishlist/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    loadItems();
  }

  function cyclePriority(item: WishlistItemData) {
    const current = item.priority || "low";
    const idx = PRIORITIES.indexOf(current);
    const next = PRIORITIES[(idx + 1) % PRIORITIES.length];
    patchItem(item.id, { priority: next });
  }

  function cycleFeatureType(item: WishlistItemData) {
    if (item.featureType === "major") {
      startEdit(item, "minor");
    } else {
      patchItem(item.id, { featureType: "major", suggestedParent: null });
    }
  }

  function startEdit(item: WishlistItemData, defaultType?: string) {
    setEditingId(item.id);
    setEditFeatureType(defaultType || item.featureType || "major");
    setEditSuggestedParent(item.suggestedParent || "");
    setShowParentSuggestions(false);
  }

  function getMajorFeaturesForItem(item: WishlistItemData) {
    if (!item.projectId) return [];
    const project = allProjects.find((p: any) => p.id === item.projectId);
    return (project?.features || []).map((f: any) => f.title as string);
  }

  async function saveEdit(id: string) {
    await patchItem(id, {
      featureType: editFeatureType,
      suggestedParent: editFeatureType === "minor" ? editSuggestedParent || null : null,
    });
    setEditingId(null);
  }

  const filteredProjects = filterClientId
    ? allProjects.filter((p: any) => {
        const client = allClients.find((c) => c.id === filterClientId);
        return client?.projects.some((cp: any) => cp.id === p.id);
      })
    : allProjects;

  const sourceFiltered = filterSource ? items.filter((i) => i.source === filterSource) : items;
  const pendingItems = sourceFiltered.filter((i) => i.status === "pending");
  const dismissedItems = sourceFiltered.filter((i) => i.status === "dismissed");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-[#f1f5f9]">Wishlist</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={generateSamples}
            disabled={generating}
            className="px-3 py-1.5 text-xs rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 hover:text-purple-300 disabled:opacity-50 transition-colors"
          >
            {generating ? "Generating..." : "AI Samples"}
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="px-3 py-1.5 text-xs rounded-lg bg-white/[0.08] text-white/60 hover:text-white/80 hover:bg-white/[0.12] transition-colors"
          >
            + Add Item
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <select
          value={filterClientId}
          onChange={(e) => { setFilterClientId(e.target.value); setFilterProjectId(""); }}
          className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white/60 focus:outline-none focus:border-white/20"
        >
          <option value="" className="bg-[#0c1120]">All clients</option>
          {allClients.map((c) => (
            <option key={c.id} value={c.id} className="bg-[#0c1120]">{c.name}</option>
          ))}
        </select>
        <select
          value={filterProjectId}
          onChange={(e) => setFilterProjectId(e.target.value)}
          className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white/60 focus:outline-none focus:border-white/20"
        >
          <option value="" className="bg-[#0c1120]">All projects</option>
          {filteredProjects.map((p: any) => (
            <option key={p.id} value={p.id} className="bg-[#0c1120]">{p.name}</option>
          ))}
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white/60 focus:outline-none focus:border-white/20"
        >
          <option value="" className="bg-[#0c1120]">All priorities</option>
          <option value="high" className="bg-[#0c1120]">High</option>
          <option value="medium" className="bg-[#0c1120]">Medium</option>
          <option value="low" className="bg-[#0c1120]">Low</option>
        </select>
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white/60 focus:outline-none focus:border-white/20"
        >
          <option value="" className="bg-[#0c1120]">All sources</option>
          <option value="meeting" className="bg-[#0c1120]">Notes</option>
          <option value="feedback" className="bg-[#0c1120]">Feedback</option>
          <option value="client" className="bg-[#0c1120]">Client</option>
          <option value="manual" className="bg-[#0c1120]">Manual</option>
        </select>
      </div>

      {showAdd && (
        <div className="mb-6 rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
          <input
            value={addTitle}
            onChange={(e) => setAddTitle(e.target.value)}
            placeholder="Feature title"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20"
          />
          <textarea
            value={addDesc}
            onChange={(e) => setAddDesc(e.target.value)}
            placeholder="Describe the feature..."
            rows={3}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 resize-none"
          />
          <div className="flex gap-2">
            <select
              value={addClientId}
              onChange={(e) => setAddClientId(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white/60 focus:outline-none"
            >
              {allClients.map((c) => (
                <option key={c.id} value={c.id} className="bg-[#0c1120]">{c.name}</option>
              ))}
            </select>
            <select
              value={addPriority}
              onChange={(e) => setAddPriority(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-white/60 focus:outline-none"
            >
              <option value="" className="bg-[#0c1120]">Priority</option>
              <option value="high" className="bg-[#0c1120]">High</option>
              <option value="medium" className="bg-[#0c1120]">Medium</option>
              <option value="low" className="bg-[#0c1120]">Low</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={addLoading || !addTitle.trim() || !addDesc.trim()}
              className="px-4 py-2 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-40 transition-colors"
            >
              {addLoading ? "Adding..." : "Add to Wishlist"}
            </button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-xs text-white/30 hover:text-white/50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading && items.length === 0 ? (
        <p className="text-sm text-white/30">Loading...</p>
      ) : pendingItems.length === 0 ? (
        <p className="text-sm text-white/30">No pending items. Features extracted from notes will appear here.</p>
      ) : (
        <div className="space-y-2">
          {pendingItems.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-sm text-white/70 font-medium">{item.title}</span>
                    <button
                      onClick={() => cyclePriority(item)}
                      className={`text-[0.55rem] px-1.5 py-0.5 rounded cursor-pointer hover:opacity-80 transition-opacity ${PRIORITY_COLORS[item.priority || "low"]}`}
                      title="Click to change priority"
                    >
                      {item.priority || "low"}
                    </button>
                    <span className={`text-[0.55rem] px-1.5 py-0.5 rounded ${
                      item.source === "feedback" ? "text-purple-400 bg-purple-500/10" :
                      item.source === "client" ? "text-orange-400 bg-orange-400/10" :
                      "text-blue-400 bg-blue-500/10"
                    }`}>
                      {item.source === "feedback" ? "Feedback" : item.source === "client" ? "Client" : "Note"}
                    </span>
                    {item.featureType && editingId !== item.id && (
                      <button
                        onClick={() => cycleFeatureType(item)}
                        className={`text-[0.55rem] px-1.5 py-0.5 rounded cursor-pointer hover:opacity-80 transition-opacity ${
                          item.featureType === "major" ? "text-emerald-400 bg-emerald-500/10" : "text-sky-400 bg-sky-500/10"
                        }`}
                        title="Click to change type"
                      >
                        {item.featureType}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-white/40 line-clamp-2 mb-1">{item.description}</p>
                  {item.featureType === "minor" && item.suggestedParent && editingId !== item.id && (
                    <p className="text-[0.6rem] text-sky-400/60 mb-1">
                      ↳ under &quot;{item.suggestedParent}&quot;
                    </p>
                  )}
                  {editingId === item.id && (
                    <div className="flex items-center gap-2 mb-1.5 mt-1">
                      <select
                        value={editFeatureType}
                        onChange={(e) => setEditFeatureType(e.target.value)}
                        className="bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 text-[0.6rem] text-white/60 focus:outline-none"
                      >
                        <option value="major" className="bg-[#0c1120]">Major</option>
                        <option value="minor" className="bg-[#0c1120]">Minor</option>
                      </select>
                      {editFeatureType === "minor" && (
                        <div className="relative flex-1">
                          <input
                            value={editSuggestedParent}
                            onChange={(e) => { setEditSuggestedParent(e.target.value); setShowParentSuggestions(true); }}
                            onFocus={() => setShowParentSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowParentSuggestions(false), 150)}
                            placeholder="Parent feature name"
                            className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 text-[0.6rem] text-white/60 placeholder:text-white/20 focus:outline-none"
                          />
                          {showParentSuggestions && (() => {
                            const suggestions = getMajorFeaturesForItem(item).filter(
                              (t) => t.toLowerCase().includes(editSuggestedParent.toLowerCase())
                            );
                            return suggestions.length > 0 ? (
                              <div className="absolute top-full left-0 right-0 mt-0.5 bg-[#0c1120] border border-white/[0.12] rounded shadow-lg z-10 max-h-32 overflow-y-auto">
                                {suggestions.map((title) => (
                                  <button
                                    key={title}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => { setEditSuggestedParent(title); setShowParentSuggestions(false); }}
                                    className="w-full text-left px-2 py-1.5 text-[0.6rem] text-white/60 hover:bg-white/[0.08] hover:text-white/80 transition-colors"
                                  >
                                    {title}
                                  </button>
                                ))}
                              </div>
                            ) : null;
                          })()}
                        </div>
                      )}
                      <button
                        onClick={() => saveEdit(item.id)}
                        className="px-2 py-1 text-[0.55rem] rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-2 py-1 text-[0.55rem] text-white/20 hover:text-white/40"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-[0.55rem] text-white/20">
                    <span>{item.client.name}</span>
                    {item.project && <><span>/</span><span>{item.project.name}</span></>}
                    {item.source === "meeting" && item.meeting && (
                      <>
                        <span>&middot;</span>
                        <span>
                          {new Date(item.meeting.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => setMovingItem(item)}
                    className="px-3 py-1.5 text-[0.6rem] rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                  >
                    Move to Production
                  </button>
                  <button
                    onClick={() => handleDismiss(item.id)}
                    className="px-2 py-1.5 text-[0.6rem] rounded-lg text-white/20 hover:text-white/40 hover:bg-white/[0.04] transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {dismissedItems.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowDismissed(!showDismissed)}
            className="text-[0.6rem] uppercase tracking-widest text-white/20 hover:text-white/40 transition-colors mb-2"
          >
            {showDismissed ? "Hide" : "Show"} dismissed ({dismissedItems.length})
          </button>
          {showDismissed && (
            <div className="space-y-1.5 opacity-50">
              {dismissedItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-4 py-2 rounded-lg border border-white/[0.04]">
                  <span className="text-xs text-white/30 line-through">{item.title}</span>
                  <button
                    onClick={() => handleRestore(item.id)}
                    className="text-[0.55rem] text-white/20 hover:text-white/40"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {movingItem && (
        <MoveToProductionModal
          key={movingItem.id}
          item={movingItem}
          projects={allProjects}
          allWishlistItems={items}
          onClose={() => setMovingItem(null)}
          onMoved={() => {
            setMovingItem(null);
            loadItems();
            onUpdate();
          }}
        />
      )}
    </div>
  );
}

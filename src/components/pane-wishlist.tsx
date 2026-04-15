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
  projectId?: string | null;
};

type Tab = "push" | "deck" | "backlog";

export function PaneWishlist({ workspaces, onUpdate, projectId: projectIdProp }: Props) {
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

  const [selectedProjectId, setSelectedProjectId] = useState<string>(allProjects[0]?.id || "");
  useEffect(() => {
    if (projectIdProp) setSelectedProjectId(projectIdProp);
  }, [projectIdProp]);

  const selectedClient = allClients.find((c) => c.projects.some((p: any) => p.id === selectedProjectId));

  const [tab, setTab] = useState<Tab>("backlog");
  const [items, setItems] = useState<WishlistItemData[]>([]);
  const [loading, setLoading] = useState(false);
  const [movingItem, setMovingItem] = useState<WishlistItemData | null>(null);

  // Add item state
  const [showAdd, setShowAdd] = useState(false);
  const [addTitle, setAddTitle] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const loadItems = useCallback(async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/wishlist?projectId=${selectedProjectId}&status=pending`, { cache: "no-store" });
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => { loadItems(); }, [loadItems]);

  async function setPriority(id: string, priority: string) {
    await fetch(`/api/wishlist/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority }),
    });
    loadItems();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/wishlist/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    });
    loadItems();
  }

  async function handleAdd() {
    if (!addTitle.trim() || !addDesc.trim() || !selectedClient) return;
    setAddLoading(true);
    try {
      await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: addTitle.trim(),
          description: addDesc.trim(),
          clientId: selectedClient.id,
          projectId: selectedProjectId || null,
          priority: "low",
        }),
      });
      setShowAdd(false);
      setAddTitle("");
      setAddDesc("");
      loadItems();
    } finally {
      setAddLoading(false);
    }
  }

  const pushItems = items.filter((i) => i.priority === "high");
  const deckItems = items.filter((i) => i.priority === "medium");
  const backlogItems = items.filter((i) => !i.priority || i.priority === "low");

  const currentItems = tab === "push" ? pushItems : tab === "deck" ? deckItems : backlogItems;

  // Move targets for each tab
  const moveTargets: Record<Tab, { label: string; priority: string; tab: Tab }[]> = {
    push: [
      { label: "Move to On Deck", priority: "medium", tab: "deck" },
      { label: "Move to Backlog", priority: "low", tab: "backlog" },
    ],
    deck: [
      { label: "Move to Push", priority: "high", tab: "push" },
      { label: "Move to Backlog", priority: "low", tab: "backlog" },
    ],
    backlog: [
      { label: "Move to Push", priority: "high", tab: "push" },
      { label: "Move to On Deck", priority: "medium", tab: "deck" },
    ],
  };

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-6">
        <button
          onClick={() => setTab("push")}
          className={`px-4 py-2 text-sm rounded-lg transition-colors flex items-center gap-2 ${
            tab === "push"
              ? "bg-white/[0.08] text-white/80"
              : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-red-400" />
          Push to Production
          {pushItems.length > 0 && (
            <span className="text-[0.6rem] bg-red-400/20 text-red-400 px-1.5 py-0.5 rounded-full">
              {pushItems.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("deck")}
          className={`px-4 py-2 text-sm rounded-lg transition-colors flex items-center gap-2 ${
            tab === "deck"
              ? "bg-white/[0.08] text-white/80"
              : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-yellow-400" />
          On Deck
          {deckItems.length > 0 && (
            <span className="text-[0.6rem] bg-yellow-400/20 text-yellow-400 px-1.5 py-0.5 rounded-full">
              {deckItems.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("backlog")}
          className={`px-4 py-2 text-sm rounded-lg transition-colors flex items-center gap-2 ${
            tab === "backlog"
              ? "bg-white/[0.08] text-white/80"
              : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-white/20" />
          Backlog
          {backlogItems.length > 0 && (
            <span className="text-[0.6rem] bg-white/10 text-white/40 px-1.5 py-0.5 rounded-full">
              {backlogItems.length}
            </span>
          )}
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white font-medium hover:opacity-90 transition-opacity"
        >
          + Add Item
        </button>
      </div>

      {/* Add item form */}
      {showAdd && (
        <div className="mb-6 rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
          <input
            value={addTitle}
            onChange={(e) => setAddTitle(e.target.value)}
            placeholder="Feature title"
            autoFocus
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20"
          />
          <textarea
            value={addDesc}
            onChange={(e) => setAddDesc(e.target.value)}
            placeholder="Describe the feature..."
            rows={2}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={addLoading || !addTitle.trim() || !addDesc.trim()}
              className="px-4 py-2 text-xs rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {addLoading ? "Adding..." : "Add to Backlog"}
            </button>
            <button onClick={() => { setShowAdd(false); setAddTitle(""); setAddDesc(""); }} className="px-4 py-2 text-xs text-white/30 hover:text-white/50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tab content */}
      {loading && items.length === 0 ? (
        <p className="text-sm text-white/30">Loading...</p>
      ) : currentItems.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-white/30 mb-2">
            {tab === "push" ? "No items ready to push." :
             tab === "deck" ? "Nothing on deck." :
             "Backlog is empty."}
          </p>
          <p className="text-xs text-white/20">
            {tab === "push" ? "Move items here from On Deck or Backlog when they're ready to build." :
             tab === "deck" ? "Move items here to queue them for upcoming work." :
             "Features from Notes and Feedback will appear here, or add items manually."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {currentItems.map((item) => (
            <div key={item.id} className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white/70 font-medium">{item.title}</div>
                  <p className="text-xs text-white/35 mt-0.5 line-clamp-2">{item.description}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {tab === "push" && (
                    <button
                      onClick={() => setMovingItem(item)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white font-medium hover:opacity-90 transition-opacity"
                    >
                      Build
                    </button>
                  )}
                  {moveTargets[tab].map((target) => (
                    <button
                      key={target.tab}
                      onClick={() => setPriority(item.id, target.priority)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-white/[0.06] text-white/40 hover:text-white/60 hover:bg-white/[0.1] transition-colors"
                    >
                      {target.label}
                    </button>
                  ))}
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="p-1.5 text-white/15 hover:text-red-400/60 transition-colors rounded"
                    title="Delete"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Move to Production Modal */}
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

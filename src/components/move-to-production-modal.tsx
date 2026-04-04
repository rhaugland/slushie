"use client";

import { useState, useEffect } from "react";

type WishlistItem = {
  id: string;
  title: string;
  description: string;
  projectId: string | null;
  featureType: string | null;
  suggestedParent: string | null;
};

type Props = {
  item: WishlistItem;
  projects: { id: string; name: string; features: { id: string; title: string; parentId: string | null }[] }[];
  allWishlistItems?: WishlistItem[];
  onClose: () => void;
  onMoved: () => void;
};

export function MoveToProductionModal({ item, projects, allWishlistItems = [], onClose, onMoved }: Props) {
  const isMajor = item.featureType === "major";
  const isMinor = item.featureType === "minor";

  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [featureType, setFeatureType] = useState<"major" | "minor">(isMinor ? "minor" : "major");
  const [projectId, setProjectId] = useState(item.projectId || projects[0]?.id || "");
  const [parentFeatureId, setParentFeatureId] = useState("");
  const [moving, setMoving] = useState(false);

  // For major features: minor items that will come along
  const relatedMinors = isMajor
    ? allWishlistItems.filter(
        (w) =>
          w.id !== item.id &&
          w.featureType === "minor" &&
          w.suggestedParent === item.title &&
          w.projectId === item.projectId
      )
    : [];
  const [selectedMinorIds, setSelectedMinorIds] = useState<Set<string>>(
    new Set(relatedMinors.map((m) => m.id))
  );

  const selectedProject = projects.find((p) => p.id === projectId);
  const majorFeatures = selectedProject?.features.filter((f) => !f.parentId) || [];

  // For minor: auto-select parent feature matching suggestedParent
  useEffect(() => {
    if (featureType === "minor" && item.suggestedParent) {
      const match = majorFeatures.find(
        (f) => f.title.toLowerCase() === item.suggestedParent?.toLowerCase()
      );
      if (match) {
        setParentFeatureId(match.id);
        return;
      }
    }
    setParentFeatureId(majorFeatures[0]?.id || "");
  }, [projectId, featureType]);

  function toggleMinor(id: string) {
    setSelectedMinorIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleMove() {
    if (!projectId || !title.trim()) return;
    setMoving(true);
    try {
      const res = await fetch(`/api/wishlist/${item.id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          featureType,
          projectId,
          parentFeatureId: featureType === "minor" ? parentFeatureId : undefined,
          autoBuild: true,
          includeMinorIds: featureType === "major" ? Array.from(selectedMinorIds) : undefined,
        }),
      });
      if (res.ok) {
        onMoved();
      }
    } finally {
      setMoving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[#0c1120] border border-white/[0.08] rounded-xl p-6 w-full max-w-md space-y-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-white/80">Move to Production</h3>

        <div>
          <label className="block text-[0.6rem] uppercase tracking-widest text-white/30 mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/20"
          />
        </div>

        <div>
          <label className="block text-[0.6rem] uppercase tracking-widest text-white/30 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/20 resize-none"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setFeatureType("major")}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              featureType === "major"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-white/[0.06] text-white/30 hover:text-white/50"
            }`}
          >
            Major Feature
          </button>
          <button
            onClick={() => setFeatureType("minor")}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              featureType === "minor"
                ? "border-sky-500/40 bg-sky-500/10 text-sky-400"
                : "border-white/[0.06] text-white/30 hover:text-white/50"
            }`}
          >
            Minor Feature
          </button>
        </div>

        <div>
          <label className="block text-[0.6rem] uppercase tracking-widest text-white/30 mb-1">Project</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/60 focus:outline-none focus:border-white/20"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id} className="bg-[#0c1120]">{p.name}</option>
            ))}
          </select>
        </div>

        {featureType === "minor" && majorFeatures.length > 0 && (
          <div>
            <label className="block text-[0.6rem] uppercase tracking-widest text-white/30 mb-1">Under Major Feature</label>
            <select
              value={parentFeatureId}
              onChange={(e) => setParentFeatureId(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/60 focus:outline-none focus:border-white/20"
            >
              {majorFeatures.map((f) => (
                <option key={f.id} value={f.id} className="bg-[#0c1120]">{f.title}</option>
              ))}
            </select>
          </div>
        )}

        {featureType === "major" && relatedMinors.length > 0 && (
          <div>
            <label className="block text-[0.6rem] uppercase tracking-widest text-white/30 mb-2">
              Minor features to include ({selectedMinorIds.size}/{relatedMinors.length})
            </label>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {relatedMinors.map((minor) => (
                <label
                  key={minor.id}
                  className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                    selectedMinorIds.has(minor.id)
                      ? "border-sky-500/30 bg-sky-500/[0.06]"
                      : "border-white/[0.06] bg-white/[0.02] opacity-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedMinorIds.has(minor.id)}
                    onChange={() => toggleMinor(minor.id)}
                    className="mt-0.5 rounded border-white/20"
                  />
                  <div className="min-w-0">
                    <p className="text-xs text-white/70 font-medium">{minor.title}</p>
                    <p className="text-[0.6rem] text-white/30 line-clamp-1">{minor.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2.5">
          <p className="text-[0.6rem] text-white/30">
            {featureType === "minor"
              ? "This will create a sub-feature and begin building immediately."
              : selectedMinorIds.size > 0
              ? `This will create the major feature with ${selectedMinorIds.size} sub-feature${selectedMinorIds.size > 1 ? "s" : ""} and begin building all of them.`
              : "This will create the major feature and begin building immediately."}
          </p>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleMove}
            disabled={moving || !title.trim() || !projectId}
            className="flex-1 py-2.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {moving ? "Building..." : "Move & Build"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-xs text-white/30 hover:text-white/50 border border-white/[0.08] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

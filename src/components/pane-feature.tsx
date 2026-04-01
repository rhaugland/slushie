"use client";

import { useState } from "react";

type Props = {
  feature: {
    id: string;
    title: string;
    description: string;
    enabled: boolean;
    status: string;
    children?: any[];
    builds: { id: string; status: string; buildLogs: string | null; createdAt: string }[];
  };
  projectId: string;
  onUpdate: () => void;
};

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  draft: { text: "Ready to build", color: "text-white/40 bg-white/[0.06]" },
  building: { text: "Building...", color: "text-yellow-400 bg-yellow-500/10" },
  live: { text: "Live", color: "text-green-400 bg-green-500/10" },
  error: { text: "Error", color: "text-red-400 bg-red-500/10" },
};

export function PaneFeature({ feature, projectId, onUpdate }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(feature.title);
  const [description, setDescription] = useState(feature.description);
  const [building, setBuilding] = useState(false);

  const statusInfo = STATUS_LABEL[feature.status] || STATUS_LABEL.draft;
  const latestBuild = feature.builds[0] || null;

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
    await fetch(`/api/features/${feature.id}`, { method: "DELETE" });
    onUpdate();
  }

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
        <span className={`text-[0.6rem] px-2 py-1 rounded-md ${statusInfo.color}`}>
          {statusInfo.text}
        </span>
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

      <div className="flex gap-2 mb-6">
        {(feature.status === "draft" || feature.status === "error") && (
          <button
            onClick={handleBuild}
            disabled={building}
            className="px-4 py-2 text-xs rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {building ? "Starting..." : "Build"}
          </button>
        )}
        {feature.status === "live" && (
          <button
            onClick={handleBuild}
            disabled={building}
            className="px-4 py-2 text-xs rounded-lg bg-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.1] transition-colors"
          >
            Rebuild
          </button>
        )}
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="px-4 py-2 text-xs rounded-lg bg-white/[0.06] text-white/40 hover:text-white/60 transition-colors"
          >
            Edit
          </button>
        )}
        <button
          onClick={handleDelete}
          className="px-4 py-2 text-xs rounded-lg text-red-400/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          Delete
        </button>
      </div>

      {feature.children && feature.children.length > 0 && (
        <div className="border-t border-white/[0.06] pt-4">
          <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-2">
            Sub-features
          </div>
          <div className="space-y-2">
            {feature.children.map((child: any) => (
              <div
                key={child.id}
                className="flex items-center justify-between px-3 py-2 rounded-md bg-white/[0.03] border border-white/[0.08]"
              >
                <div>
                  <div className="text-xs text-white/70">{child.title}</div>
                  <div className="text-[0.6rem] text-white/30">{child.status}</div>
                </div>
                <div className={`w-1.5 h-1.5 rounded-full ${
                  child.status === "live" ? "bg-green-400" :
                  child.status === "building" ? "bg-yellow-400 animate-pulse" :
                  "bg-white/20"
                }`} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";

type ObjectiveCardProps = {
  id: string;
  title: string;
  description: string;
  priority: string | null;
  status: string;
  onUpdate: () => void;
  onSelect: (id: string) => void;
};

export function ObjectiveCard({
  id,
  title,
  description,
  priority,
  status,
  onUpdate,
  onSelect,
}: ObjectiveCardProps) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(title);
  const [editDesc, setEditDesc] = useState(description);

  async function handleSave() {
    await fetch(`/api/objectives/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle, description: editDesc }),
    });
    setEditing(false);
    onUpdate();
  }

  async function handleDelete() {
    await fetch(`/api/objectives/${id}`, { method: "DELETE" });
    onUpdate();
  }

  const priorityColor = {
    high: "text-red-400 bg-red-500/10 border-red-500/20",
    medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    low: "text-green-400 bg-green-500/10 border-green-500/20",
  }[priority || "medium"];

  const isActionable = status === "draft";

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-lg p-4 mb-3">
      {editing ? (
        <div className="space-y-2">
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full px-2 py-1.5 text-sm bg-white/[0.05] border border-white/10 rounded text-white focus:outline-none focus:border-blue-500"
          />
          <textarea
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            rows={3}
            className="w-full px-2 py-1.5 text-sm bg-white/[0.05] border border-white/10 rounded text-white focus:outline-none focus:border-blue-500 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="text-xs px-3 py-1 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
            >
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-xs px-3 py-1 rounded bg-white/[0.05] text-white/40"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between mb-2">
            <h4 className="text-sm font-semibold text-[#f1f5f9]">{title}</h4>
            {priority && (
              <span className={`text-[0.6rem] px-2 py-0.5 rounded border ${priorityColor}`}>
                {priority}
              </span>
            )}
          </div>
          <p className="text-xs text-white/50 leading-relaxed mb-3">{description}</p>
          {isActionable && (
            <div className="flex gap-2">
              <button
                onClick={() => onSelect(id)}
                className="text-xs px-3 py-1.5 rounded bg-gradient-to-r from-red-500 to-blue-500 text-white font-medium hover:opacity-90"
              >
                Select & Architect
              </button>
              <button
                onClick={() => setEditing(true)}
                className="text-xs px-3 py-1 rounded bg-white/[0.05] text-white/40 hover:text-white/60"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="text-xs px-3 py-1 rounded bg-white/[0.05] text-red-400/50 hover:text-red-400"
              >
                Delete
              </button>
            </div>
          )}
          {!isActionable && (
            <span className="text-[0.65rem] text-blue-300 capitalize">{status}</span>
          )}
        </>
      )}
    </div>
  );
}

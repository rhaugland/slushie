"use client";

import { useState } from "react";

type Props = {
  workspaces: { id: string; name: string; slug: string }[];
  onCreated: () => void;
  onCancel: () => void;
};

export function CreateProjectForm({ workspaces, onCreated, onCancel }: Props) {
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id || "");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !clientName.trim() || !workspaceId) return;
    setLoading(true);
    await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, clientName, workspaceId }),
    });
    setLoading(false);
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 p-3 rounded-lg bg-white/[0.03] border border-white/[0.08] space-y-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Project name"
        className="w-full bg-transparent border border-white/10 rounded px-2 py-1 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/20"
      />
      <input
        value={clientName}
        onChange={(e) => setClientName(e.target.value)}
        placeholder="Client name"
        className="w-full bg-transparent border border-white/10 rounded px-2 py-1 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/20"
      />
      <select
        value={workspaceId}
        onChange={(e) => setWorkspaceId(e.target.value)}
        className="w-full bg-transparent border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-white/20"
      >
        {workspaces.map((ws) => (
          <option key={ws.id} value={ws.id} className="bg-[#0c1120] text-white">
            {ws.name}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 text-xs py-1.5 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {loading ? "Creating..." : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs py-1.5 px-3 rounded text-white/30 hover:text-white/50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

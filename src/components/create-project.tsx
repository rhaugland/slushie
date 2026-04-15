"use client";

import { useState } from "react";

type Props = {
  workspaces: {
    workspaceId: string;
    role: string;
    workspace: {
      id: string;
      name: string;
      slug: string;
      clients: { id: string; name: string; projects: { id: string; name: string }[] }[];
    };
  }[];
  onCreated: (projectId: string) => void;
};

export function CreateProject({ workspaces, onCreated }: Props) {
  const allClients = workspaces.flatMap((m) =>
    m.workspace.clients.map((c) => ({ id: c.id, name: c.name, workspaceName: m.workspace.name }))
  );

  const [name, setName] = useState("");
  const [clientId, setClientId] = useState(allClients[0]?.id || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !clientId || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), clientId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create project");
      }
      const project = await res.json();
      onCreated(project.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create project");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold text-[#f1f5f9] mb-2">New Project</h1>
        <p className="text-sm text-white/40 mb-8">
          Create a project to start tracking notes, feedback, and features.
        </p>

        <form onSubmit={handleCreate} className="space-y-5">
          <div>
            <label className="text-[0.6rem] uppercase tracking-widest text-white/30 block mb-2">
              Project Name
            </label>
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              placeholder="e.g. Website Redesign"
              autoFocus
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-3 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
            />
          </div>

          <div>
            <label className="text-[0.6rem] uppercase tracking-widest text-white/30 block mb-2">
              Client
            </label>
            {allClients.length === 0 ? (
              <p className="text-sm text-white/30">No clients available. Contact your workspace admin.</p>
            ) : allClients.length === 1 ? (
              <div className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-3 text-sm text-white/60">
                {allClients[0].name}
              </div>
            ) : (
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-3 text-sm text-white/80 focus:outline-none focus:border-white/20 transition-colors"
              >
                {allClients.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#0c1120]">
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading || !name.trim() || !clientId}
            className="w-full px-4 py-3 text-sm rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {loading ? "Creating..." : "Create Project"}
          </button>
        </form>
      </div>
    </div>
  );
}

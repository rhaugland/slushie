"use client";

import { useState } from "react";

type Props = {
  workspaceId: string;
  onCreated: () => void;
  onCancel: () => void;
};

export function CreateClientForm({ workspaceId, onCreated, onCancel }: Props) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), workspaceId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create client");
      }
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create client");
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.08] space-y-2"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Client name"
        className="w-full bg-transparent border border-white/10 rounded px-2 py-1 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/20"
        autoFocus
      />
      {error && <p className="text-[0.6rem] text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="flex-1 text-xs py-1 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {loading ? "Creating..." : "Add client"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs py-1 px-2 rounded text-white/30 hover:text-white/50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";

type Props = {
  onCreated: () => void;
  onCancel: () => void;
};

export function CreateProjectForm({ onCreated, onCancel }: Props) {
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [firm, setFirm] = useState<"w3" | "isotropic">("w3");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !clientName.trim()) return;
    setLoading(true);
    await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, clientName, clientFirm: firm }),
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
      <div className="flex gap-2">
        {(["w3", "isotropic"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFirm(f)}
            className={`flex-1 text-[0.6rem] py-1 rounded border transition-colors ${
              firm === f
                ? f === "w3"
                  ? "border-red-500/30 bg-red-500/10 text-red-400"
                  : "border-blue-500/30 bg-blue-500/10 text-blue-400"
                : "border-white/10 text-white/30"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
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

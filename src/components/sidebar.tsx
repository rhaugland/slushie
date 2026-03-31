"use client";

import { useState } from "react";

type Client = {
  id: string;
  name: string;
  firm: string;
  meetings: { objectives: { builds: { deployUrl: string | null }[] }[] }[];
};

export function Sidebar({
  clients,
  selectedId,
  onSelect,
  onClientCreated,
}: {
  clients: Client[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClientCreated: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [firm, setFirm] = useState<"w3" | "isotropic">("w3");

  const w3Clients = clients.filter((c) => c.firm === "w3");
  const isotropicClients = clients.filter((c) => c.firm === "isotropic");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), firm }),
    });
    setName("");
    setShowForm(false);
    onClientCreated();
  }

  function countDeployed(client: Client) {
    return client.meetings.flatMap((m) => m.objectives).flatMap((o) => o.builds).filter((b) => b.deployUrl).length;
  }

  function renderGroup(label: string, color: string, group: Client[]) {
    if (group.length === 0 && !showForm) return null;
    return (
      <div className="mb-4">
        <div
          className="text-[0.6rem] uppercase tracking-widest font-semibold mb-2"
          style={{ color }}
        >
          {label}
        </div>
        {group.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs mb-0.5 border-l-2 transition-colors ${
              selectedId === c.id
                ? "bg-blue-500/15 text-blue-300 border-blue-500"
                : "text-white/50 border-transparent hover:text-white/70 hover:bg-white/[0.03]"
            }`}
          >
            {c.name}
            {countDeployed(c) > 0 && (
              <span className="ml-1 text-[0.6rem] text-green-400">
                {countDeployed(c)} live
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <aside className="w-[220px] border-r border-white/[0.08] bg-gradient-to-b from-[#1a1040] to-[#0f1729] p-4 flex flex-col">
      <div className="text-center mb-6 pb-4 border-b border-white/[0.08]">
        <h1 className="text-xl font-extrabold bg-gradient-to-r from-[#ef4444] to-[#3b82f6] bg-clip-text text-transparent">
          slushie.machine
        </h1>
        <p className="text-[0.65rem] text-white/40 mt-0.5">v0.1</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {renderGroup("w3", "#ef4444", w3Clients)}
        {renderGroup("isotropic", "#3b82f6", isotropicClients)}
        {clients.length === 0 && !showForm && (
          <p className="text-xs text-white/30">No clients yet</p>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-white/[0.08]">
        {showForm ? (
          <form onSubmit={handleCreate} className="space-y-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Client name"
              className="w-full px-2 py-1.5 text-xs bg-white/[0.05] border border-white/10 rounded-md text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500"
              autoFocus
            />
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setFirm("w3")}
                className={`flex-1 text-[0.65rem] py-1 rounded ${
                  firm === "w3"
                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                    : "bg-white/[0.03] text-white/40 border border-white/10"
                }`}
              >
                w3
              </button>
              <button
                type="button"
                onClick={() => setFirm("isotropic")}
                className={`flex-1 text-[0.65rem] py-1 rounded ${
                  firm === "isotropic"
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    : "bg-white/[0.03] text-white/40 border border-white/10"
                }`}
              >
                isotropic
              </button>
            </div>
            <div className="flex gap-1">
              <button
                type="submit"
                className="flex-1 text-[0.65rem] py-1 rounded bg-gradient-to-r from-red-500 to-blue-500 text-white font-medium"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 text-[0.65rem] py-1 rounded bg-white/[0.05] text-white/40"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="w-full px-2.5 py-1.5 text-xs text-white/30 border border-dashed border-white/15 rounded-md hover:text-white/50 hover:border-white/25 transition-colors"
          >
            + New Client
          </button>
        )}
      </div>
    </aside>
  );
}

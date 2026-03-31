"use client";

import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/sidebar";

type Build = { id: string; deployUrl: string | null; deployStatus: string };
type Objective = { id: string; title: string; description: string; priority: string | null; status: string; builds: Build[] };
type Meeting = { id: string; status: string; createdAt: string; objectives: Objective[] };
type Client = {
  id: string;
  name: string;
  firm: string;
  meetings: Meeting[];
};

export default function Home() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    const res = await fetch("/api/clients");
    const data = await res.json();
    setClients(data);
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const selected = clients.find((c) => c.id === selectedId) || null;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        clients={clients}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onClientCreated={loadClients}
      />
      <main className="flex-1 p-6">
        {selected ? (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-bold text-[#f1f5f9]">{selected.name}</h2>
              <p className="text-xs text-white/40">
                {selected.firm} · {selected.meetings.flatMap((m) => m.objectives).length} objectives
              </p>
            </div>
            <p className="text-sm text-white/50">Upload a meeting recording to get started.</p>
          </div>
        ) : (
          <p className="text-white/50">Select or create a client to get started.</p>
        )}
      </main>
    </div>
  );
}

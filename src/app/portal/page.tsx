"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface PortalProject {
  id: string;
  name: string;
  clientName: string;
  deployUrl: string | null;
}

export default function PortalPage() {
  const [projects, setProjects] = useState<PortalProject[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/portal/projects");
      if (res.status === 401) {
        router.push("/portal/login");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (data.projects.length === 1) {
          router.push(`/portal/${data.projects[0].id}`);
          return;
        }
        setProjects(data.projects);
      }
      setLoading(false);
    }
    load();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/40 text-sm">Loading...</p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold text-white/60 mb-2">No projects yet</h1>
          <p className="text-sm text-white/30">Your team hasn&apos;t added you to any projects yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="border-b border-white/[0.06] px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">
          <span className="bg-gradient-to-r from-red-500 to-blue-500 bg-clip-text text-transparent">
            slushie.machine
          </span>
        </h1>
        <button
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            router.push("/portal/login");
          }}
          className="text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          Sign out
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <h2 className="text-sm font-medium text-white/50 mb-4">Your Projects</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => router.push(`/portal/${p.id}`)}
              className="text-left bg-white/[0.03] border border-white/[0.06] rounded-lg p-4 hover:border-white/[0.12] transition-colors"
            >
              <p className="text-sm font-medium text-white">{p.name}</p>
              <p className="text-xs text-white/30 mt-1">{p.clientName}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

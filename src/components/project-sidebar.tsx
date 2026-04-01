"use client";

import { useState } from "react";
import { CreateProjectForm } from "./create-project-form";

type Project = {
  id: string;
  name: string;
  clientName: string;
  clientFirm: string;
  deployUrl: string | null;
  deployStatus: string;
  features: { id: string; status: string }[];
};

type Props = {
  projects: Project[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onProjectCreated: () => void;
};

export function ProjectSidebar({ projects, selectedId, onSelect, onProjectCreated }: Props) {
  const [showForm, setShowForm] = useState(false);

  const w3 = projects.filter((p) => p.clientFirm === "w3");
  const iso = projects.filter((p) => p.clientFirm === "isotropic");

  function ProjectItem({ project }: { project: Project }) {
    const liveCount = project.features.filter((f) => f.status === "live").length;
    const isSelected = project.id === selectedId;

    return (
      <button
        onClick={() => onSelect(project.id)}
        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
          isSelected
            ? "bg-blue-500/15 text-blue-300 border border-blue-500/20"
            : "text-white/60 hover:text-white hover:bg-white/[0.05]"
        }`}
      >
        <div className="flex justify-between items-center">
          <span className="truncate">{project.name}</span>
          {liveCount > 0 && (
            <span className="text-[0.6rem] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
              {liveCount} live
            </span>
          )}
        </div>
        <div className="text-[0.6rem] text-white/30 mt-0.5">{project.clientName}</div>
      </button>
    );
  }

  return (
    <aside className="w-64 border-r border-white/[0.06] bg-[#0a0f1a] p-4 min-h-screen flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-sm font-bold tracking-tight">
          <span className="bg-gradient-to-r from-red-500 to-blue-500 bg-clip-text text-transparent">
            slushie.machine
          </span>
        </h1>
      </div>

      <button
        onClick={() => setShowForm(!showForm)}
        className="w-full mb-4 px-3 py-2 text-xs rounded-lg border border-dashed border-white/10 text-white/40 hover:text-white/60 hover:border-white/20 transition-colors"
      >
        + New project
      </button>

      {showForm && (
        <CreateProjectForm
          onCreated={() => {
            setShowForm(false);
            onProjectCreated();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="flex-1 overflow-y-auto space-y-4">
        {w3.length > 0 && (
          <div>
            <div className="text-[0.6rem] uppercase tracking-widest text-red-400/60 mb-2">w3</div>
            <div className="space-y-1">
              {w3.map((p) => <ProjectItem key={p.id} project={p} />)}
            </div>
          </div>
        )}
        {iso.length > 0 && (
          <div>
            <div className="text-[0.6rem] uppercase tracking-widest text-blue-400/60 mb-2">isotropic</div>
            <div className="space-y-1">
              {iso.map((p) => <ProjectItem key={p.id} project={p} />)}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

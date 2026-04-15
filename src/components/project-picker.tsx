"use client";

import { useState, useRef, useEffect } from "react";

type WorkspaceMembership = {
  workspaceId: string;
  role: string;
  workspace: {
    id: string;
    name: string;
    slug: string;
    clients: {
      id: string;
      name: string;
      projects: { id: string; name: string }[];
    }[];
  };
};

type Props = {
  workspaces: WorkspaceMembership[];
  selectedProjectId: string | null;
  onSelect: (projectId: string) => void;
  onCreateProject?: () => void;
};

export function ProjectPicker({ workspaces, selectedProjectId, onSelect, onCreateProject }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  let selectedLabel = "Select a project";
  for (const m of workspaces) {
    for (const c of m.workspace.clients) {
      for (const p of c.projects) {
        if (p.id === selectedProjectId) {
          selectedLabel = `${m.workspace.name} > ${c.name} > ${p.name}`;
        }
      }
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.15] transition-colors text-sm min-w-[200px] max-w-[400px]"
      >
        <span className="truncate text-white/70">{selectedLabel}</span>
        <svg className="w-3.5 h-3.5 text-white/30 shrink-0 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 w-80 bg-[#111827] border border-white/[0.1] rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto">
          {workspaces.map((m) => (
            <div key={m.workspaceId}>
              <div className="px-3 py-1.5 text-[0.6rem] uppercase tracking-widest text-white/30 font-medium">
                {m.workspace.name}
              </div>
              {m.workspace.clients.map((c) => (
                <div key={c.id}>
                  <div className="px-3 py-1 text-xs text-white/40 pl-5">
                    {c.name}
                  </div>
                  {c.projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { onSelect(p.id); setOpen(false); }}
                      className={`w-full text-left px-3 py-1.5 text-sm pl-8 transition-colors ${
                        p.id === selectedProjectId
                          ? "bg-white/[0.08] text-white"
                          : "text-white/60 hover:bg-white/[0.04] hover:text-white/80"
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))}
          {onCreateProject && (
            <>
              <div className="border-t border-white/[0.06] my-1" />
              <button
                onClick={() => { onCreateProject(); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-blue-400 hover:bg-white/[0.04] transition-colors"
              >
                + New Project
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

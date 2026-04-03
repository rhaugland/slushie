"use client";

import { useState } from "react";
import { CreateProjectForm } from "./create-project-form";

type Project = {
  id: string;
  name: string;
  clientName: string;
  workspaceId: string;
  deployUrl: string | null;
  deployStatus: string;
  features: { id: string; status: string }[];
};

type WorkspaceMembership = {
  workspaceId: string;
  role: string;
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
};

function ProjectItem({
  project,
  isSelected,
  onSelect,
  onDelete,
}: {
  project: Project;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const liveCount = project.features.filter((f) => f.status === "live").length;
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (confirmDelete) {
    return (
      <div className="px-3 py-2 rounded-lg text-sm bg-red-500/10 border border-red-500/20">
        <p className="text-[0.65rem] text-red-400 mb-2">Delete {project.name}?</p>
        <div className="flex gap-2">
          <button
            onClick={onDelete}
            className="text-[0.6rem] px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="text-[0.6rem] px-2 py-1 rounded bg-white/[0.06] text-white/40 hover:text-white/60 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onSelect}
      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer group ${
        isSelected
          ? "bg-blue-500/15 text-blue-300 border border-blue-500/20"
          : "text-white/60 hover:text-white hover:bg-white/[0.05] border border-transparent"
      }`}
    >
      <div className="flex justify-between items-center">
        <span className="truncate">{project.name}</span>
        <div className="flex items-center gap-1.5">
          {liveCount > 0 && (
            <span className="text-[0.6rem] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
              {liveCount} live
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDelete(true);
            }}
            className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 transition-all p-0.5"
            title="Delete project"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>
      <div className="text-[0.6rem] text-white/30 mt-0.5">{project.clientName}</div>
    </div>
  );
}

type Props = {
  projects: Project[];
  workspaces: WorkspaceMembership[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onProjectCreated: () => void;
  onDeleteProject: (id: string) => void;
  onCollapse: () => void;
  onWorkspaceSettings: (workspaceId: string) => void;
  onLogout: () => void;
};

export function ProjectSidebar({
  projects,
  workspaces,
  selectedId,
  onSelect,
  onProjectCreated,
  onDeleteProject,
  onCollapse,
  onWorkspaceSettings,
  onLogout,
}: Props) {
  const [showForm, setShowForm] = useState(false);

  return (
    <aside className="w-64 border-r border-white/[0.06] bg-[#0a0f1a] p-4 min-h-screen flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-sm font-bold tracking-tight">
          <span className="bg-gradient-to-r from-red-500 to-blue-500 bg-clip-text text-transparent">
            slushie.machine
          </span>
        </h1>
        <button
          onClick={onCollapse}
          className="text-white/20 hover:text-white/40 transition-colors p-1"
          title="Collapse sidebar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      <button
        onClick={() => setShowForm(!showForm)}
        className="w-full mb-4 px-3 py-2 text-xs rounded-lg border border-dashed border-white/10 text-white/40 hover:text-white/60 hover:border-white/20 transition-colors"
      >
        + New project
      </button>

      {showForm && (
        <CreateProjectForm
          workspaces={workspaces.map((m) => m.workspace)}
          onCreated={() => {
            setShowForm(false);
            onProjectCreated();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="flex-1 overflow-y-auto space-y-4">
        {workspaces.map((membership) => {
          const wsProjects = projects.filter((p) => p.workspaceId === membership.workspace.id);
          return (
            <div key={membership.workspace.id}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[0.6rem] uppercase tracking-widest text-white/40">
                  {membership.workspace.name}
                </div>
                <button
                  onClick={() => onWorkspaceSettings(membership.workspace.id)}
                  className="text-white/20 hover:text-white/40 transition-colors p-0.5"
                  title="Workspace settings"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>
              </div>
              <div className="space-y-1">
                {wsProjects.map((p) => (
                  <ProjectItem
                    key={p.id}
                    project={p}
                    isSelected={p.id === selectedId}
                    onSelect={() => onSelect(p.id)}
                    onDelete={() => onDeleteProject(p.id)}
                  />
                ))}
                {wsProjects.length === 0 && (
                  <p className="text-[0.6rem] text-white/15 px-3 py-1">No projects yet</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={onLogout}
        className="mt-4 w-full px-3 py-2 text-xs rounded-lg text-white/30 hover:text-white/50 hover:bg-white/[0.04] transition-colors"
      >
        Log out
      </button>
    </aside>
  );
}

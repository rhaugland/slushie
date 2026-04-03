"use client";

import { useState } from "react";
import { CreateProjectForm } from "./create-project-form";
import { CreateClientForm } from "./create-client-form";
import { EditableText } from "./editable-text";

type ProjectSummary = {
  id: string;
  name: string;
  clientId: string;
  workspaceId: string;
  deployUrl: string | null;
  deployStatus: string;
  features: { id: string; status: string }[];
};

type ClientData = {
  id: string;
  name: string;
  projects: ProjectSummary[];
};

type WorkspaceMembership = {
  workspaceId: string;
  role: string;
  workspace: {
    id: string;
    name: string;
    slug: string;
    clients: ClientData[];
  };
};

type Props = {
  workspaces: WorkspaceMembership[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onDeleteClient: (id: string) => void;
  onCollapse: () => void;
  onWorkspaceSettings: (workspaceId: string) => void;
  onClientSettings: (clientId: string) => void;
  onProjectSettings: (projectId: string) => void;
  onRenameProject: (projectId: string, name: string) => void;
  onRenameClient: (clientId: string, name: string) => void;
  onCreateWorkspace: (name: string) => Promise<string | null>;
  onRefresh: () => void;
  onLogout: () => void;
  onTeam: () => void;
  teamActive?: boolean;
};

// SVG icon helpers
function GearIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function TrashIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function ProjectItem({
  project,
  isSelected,
  onSelect,
  onDelete,
  onSettings,
  onRename,
}: {
  project: ProjectSummary;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onSettings: () => void;
  onRename: (name: string) => void;
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
        <EditableText
          value={project.name}
          onSave={onRename}
          className="truncate text-inherit"
          inputClassName="text-sm text-inherit"
        />
        <div className="flex items-center gap-1.5">
          {liveCount > 0 && (
            <span className="text-[0.6rem] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
              {liveCount} live
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onSettings(); }}
            className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-white/40 transition-all p-0.5"
            title="Project settings"
          >
            <GearIcon />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
            className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 transition-all p-0.5"
            title="Delete project"
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProjectSidebar({
  workspaces,
  selectedId,
  onSelect,
  onDeleteProject,
  onDeleteClient,
  onCollapse,
  onWorkspaceSettings,
  onClientSettings,
  onProjectSettings,
  onRenameProject,
  onRenameClient,
  onCreateWorkspace,
  onRefresh,
  onLogout,
  onTeam,
  teamActive,
}: Props) {
  const [showWsForm, setShowWsForm] = useState(false);
  const [wsName, setWsName] = useState("");
  const [wsError, setWsError] = useState("");
  const [wsCreating, setWsCreating] = useState(false);

  // Per-client: which client is showing new project form
  const [newProjectClientId, setNewProjectClientId] = useState<string | null>(null);

  // Per-workspace: which workspace is showing new client form
  const [newClientWorkspaceId, setNewClientWorkspaceId] = useState<string | null>(null);

  // Per-client: confirm delete state
  const [confirmDeleteClientId, setConfirmDeleteClientId] = useState<string | null>(null);
  const [workflowsOpen, setWorkflowsOpen] = useState(true);

  return (
    <aside className="w-64 border-r border-white/[0.06] bg-[#0a0f1a] p-4 min-h-screen flex flex-col">
      {/* Header */}
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

      {/* Workflows header */}
      <button
        onClick={() => setWorkflowsOpen(!workflowsOpen)}
        className="flex items-center justify-between w-full mb-3 px-3 py-2 text-xs rounded-lg text-white/30 hover:text-white/50 hover:bg-white/[0.04] transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          <span className="text-[0.6rem] uppercase tracking-widest">Workflows</span>
        </div>
        <span className="text-[0.6rem]">{workflowsOpen ? "-" : "+"}</span>
      </button>

      {/* Workspace list */}
      <div className={`flex-1 overflow-y-auto space-y-6 ${workflowsOpen ? "" : "hidden"}`}>
        {workspaces.map((membership) => {
          const ws = membership.workspace;
          return (
            <div key={ws.id}>
              {/* Workspace header */}
              <div className="flex items-center justify-between mb-2 group">
                <div className="text-[0.6rem] uppercase tracking-widest text-white/40 truncate">
                  {ws.name}
                </div>
                <button
                  onClick={() => onWorkspaceSettings(ws.id)}
                  className="text-white/20 hover:text-white/40 transition-colors p-0.5 shrink-0"
                  title="Workspace settings"
                >
                  <GearIcon />
                </button>
              </div>

              {/* Clients */}
              <div className="ml-1 space-y-3">
                {ws.clients.map((client) => {
                  const isConfirmingDelete = confirmDeleteClientId === client.id;

                  return (
                    <div key={client.id}>
                      {/* Client header */}
                      {isConfirmingDelete ? (
                        <div className="px-2 py-1.5 rounded bg-red-500/10 border border-red-500/20 mb-1">
                          <p className="text-[0.6rem] text-red-400 mb-1.5">
                            Delete {client.name} and all its projects?
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                onDeleteClient(client.id);
                                setConfirmDeleteClientId(null);
                              }}
                              className="text-[0.55rem] px-2 py-0.5 rounded bg-red-500 text-white hover:bg-red-600 transition-colors"
                            >
                              Delete
                            </button>
                            <button
                              onClick={() => setConfirmDeleteClientId(null)}
                              className="text-[0.55rem] px-2 py-0.5 rounded bg-white/[0.06] text-white/40 hover:text-white/60 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between mb-1 group/client">
                          <EditableText
                            value={client.name}
                            onSave={(name) => onRenameClient(client.id, name)}
                            className="text-[0.55rem] uppercase tracking-widest text-white/30 truncate"
                            inputClassName="text-[0.55rem] uppercase text-white/50"
                          />
                          <div className="flex items-center gap-0.5 opacity-0 group-hover/client:opacity-100 transition-opacity shrink-0">
                            <button
                              onClick={() => onClientSettings(client.id)}
                              className="text-white/20 hover:text-white/50 transition-colors p-0.5"
                              title="Client settings"
                            >
                              <GearIcon size={11} />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteClientId(client.id)}
                              className="text-white/20 hover:text-red-400 transition-colors p-0.5"
                              title="Delete client"
                            >
                              <TrashIcon size={11} />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Projects under client */}
                      <div className="ml-2 space-y-1">
                        {client.projects.map((project) => (
                          <ProjectItem
                            key={project.id}
                            project={project}
                            isSelected={project.id === selectedId}
                            onSelect={() => onSelect(project.id)}
                            onDelete={() => onDeleteProject(project.id)}
                            onSettings={() => onProjectSettings(project.id)}
                            onRename={(name) => onRenameProject(project.id, name)}
                          />
                        ))}

                        {/* New project form / button */}
                        {newProjectClientId === client.id ? (
                          <CreateProjectForm
                            clientId={client.id}
                            onCreated={() => {
                              setNewProjectClientId(null);
                              onRefresh();
                            }}
                            onCancel={() => setNewProjectClientId(null)}
                          />
                        ) : (
                          <button
                            onClick={() => setNewProjectClientId(client.id)}
                            className="w-full text-left px-3 py-1.5 text-[0.65rem] text-white/25 hover:text-white/50 transition-colors"
                          >
                            + New project
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* New client form / button */}
                {newClientWorkspaceId === ws.id ? (
                  <CreateClientForm
                    workspaceId={ws.id}
                    onCreated={() => {
                      setNewClientWorkspaceId(null);
                      onRefresh();
                    }}
                    onCancel={() => setNewClientWorkspaceId(null)}
                  />
                ) : (
                  <button
                    onClick={() => setNewClientWorkspaceId(ws.id)}
                    className="w-full text-left px-2 py-1.5 text-[0.65rem] text-white/25 hover:text-white/50 transition-colors"
                  >
                    + New client
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* New workspace */}
        {showWsForm ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!wsName.trim() || wsCreating) return;
              setWsError("");
              setWsCreating(true);
              try {
                const error = await onCreateWorkspace(wsName.trim());
                if (error) {
                  setWsError(error);
                } else {
                  setWsName("");
                  setShowWsForm(false);
                  onRefresh();
                }
              } finally {
                setWsCreating(false);
              }
            }}
            className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.08] space-y-2"
          >
            <input
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
              placeholder="Workspace name"
              className="w-full bg-transparent border border-white/10 rounded px-2 py-1 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/20"
              autoFocus
            />
            {wsError && <p className="text-xs text-red-400">{wsError}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={wsCreating}
                className="flex-1 text-xs py-1.5 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
              >
                {wsCreating ? "Creating..." : "Create"}
              </button>
              <button
                type="button"
                onClick={() => { setShowWsForm(false); setWsError(""); }}
                className="text-xs py-1.5 px-3 rounded text-white/30 hover:text-white/50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowWsForm(true)}
            className="w-full text-left px-1 py-1.5 text-[0.65rem] text-white/25 hover:text-white/50 transition-colors"
          >
            + New workspace
          </button>
        )}
      </div>

      {/* Team */}
      <button
        onClick={onTeam}
        className={`mt-4 w-full px-3 py-2 text-xs rounded-lg transition-colors flex items-center gap-2 ${
          teamActive
            ? "bg-blue-500/15 text-blue-300 border border-blue-500/20"
            : "text-white/30 hover:text-white/50 hover:bg-white/[0.04]"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        Team
      </button>

      {/* Changelog */}
      <a
        href="/changelog"
        className="mt-4 w-full px-3 py-2 text-xs rounded-lg text-white/30 hover:text-white/50 hover:bg-white/[0.04] transition-colors flex items-center gap-2"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
        Changelog
      </a>

      {/* Log out */}
      <button
        onClick={onLogout}
        className="mt-2 w-full px-3 py-2 text-xs rounded-lg text-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
      >
        Log out
      </button>
    </aside>
  );
}


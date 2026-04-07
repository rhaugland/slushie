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
  onNotes?: () => void;
  notesActive?: boolean;
  onWishlist?: () => void;
  wishlistActive?: boolean;
  onFeedback?: () => void;
  feedbackActive?: boolean;
  onClientView?: () => void;
  clientViewActive?: boolean;
  onCostCenter?: () => void;
  costCenterActive?: boolean;
  onHome?: () => void;
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
            <span className="text-[0.6rem] text-white/40 bg-white/[0.06] px-1.5 py-0.5 rounded">
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
  onNotes,
  notesActive,
  onWishlist,
  wishlistActive,
  onFeedback,
  feedbackActive,
  onClientView,
  clientViewActive,
  onCostCenter,
  costCenterActive,
  onHome,
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

  // Unified "New" menu
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [newMenuAction, setNewMenuAction] = useState<"workspace" | "client" | "project" | null>(null);
  const [newMenuWorkspaceId, setNewMenuWorkspaceId] = useState<string | null>(null);
  const [newMenuClientId, setNewMenuClientId] = useState<string | null>(null);

  return (
    <aside className="w-64 border-r border-white/[0.06] bg-[#0a0f1a] p-4 h-screen overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <button onClick={onHome} className="text-sm font-bold tracking-tight hover:opacity-80 transition-opacity" title="Home">
          <span className="bg-gradient-to-r from-red-500 to-blue-500 bg-clip-text text-transparent">
            slushie.machine
          </span>
        </button>
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
        onClick={onHome}
        className={`text-[0.6rem] mb-5 transition-colors ${
          !selectedId ? "text-white/40" : "text-white/15 hover:text-white/30"
        }`}
      >
        Click here to upload a codebase
      </button>

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
      <div className={`space-y-6 ${workflowsOpen ? "" : "hidden"}`}>
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

                        {/* New project form (triggered from unified menu) */}
                        {newProjectClientId === client.id && (
                          <CreateProjectForm
                            clientId={client.id}
                            onCreated={() => {
                              setNewProjectClientId(null);
                              onRefresh();
                            }}
                            onCancel={() => setNewProjectClientId(null)}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* New client form (triggered from unified menu) */}
                {newClientWorkspaceId === ws.id && (
                  <CreateClientForm
                    workspaceId={ws.id}
                    onCreated={() => {
                      setNewClientWorkspaceId(null);
                      onRefresh();
                    }}
                    onCancel={() => setNewClientWorkspaceId(null)}
                  />
                )}
              </div>
            </div>
          );
        })}

        {/* Unified + New button */}
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
                  setNewMenuOpen(false);
                  setNewMenuAction(null);
                  onRefresh();
                }
              } finally {
                setWsCreating(false);
              }
            }}
            className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.08] space-y-2"
          >
            <p className="text-[0.55rem] uppercase tracking-widest text-white/30">New Workspace</p>
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
                onClick={() => { setShowWsForm(false); setWsError(""); setNewMenuAction(null); }}
                className="text-xs py-1.5 px-3 rounded text-white/30 hover:text-white/50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : newMenuOpen ? (
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
              <span className="text-[0.55rem] uppercase tracking-widest text-white/30">Create new</span>
              <button
                onClick={() => { setNewMenuOpen(false); setNewMenuAction(null); }}
                className="text-white/20 hover:text-white/40 text-xs"
              >
                x
              </button>
            </div>

            {!newMenuAction ? (
              <div className="py-1">
                <button
                  onClick={() => { setShowWsForm(true); setNewMenuAction("workspace"); }}
                  className="w-full text-left px-3 py-2 text-xs text-white/50 hover:text-white/80 hover:bg-white/[0.04] transition-colors"
                >
                  Workspace
                </button>
                {workspaces.length > 0 && (
                  <button
                    onClick={() => setNewMenuAction("client")}
                    className="w-full text-left px-3 py-2 text-xs text-white/50 hover:text-white/80 hover:bg-white/[0.04] transition-colors"
                  >
                    Client
                  </button>
                )}
                {workspaces.some((m) => m.workspace.clients.length > 0) && (
                  <button
                    onClick={() => setNewMenuAction("project")}
                    className="w-full text-left px-3 py-2 text-xs text-white/50 hover:text-white/80 hover:bg-white/[0.04] transition-colors"
                  >
                    Project
                  </button>
                )}
              </div>
            ) : newMenuAction === "client" ? (
              <div className="py-1">
                <p className="px-3 py-1 text-[0.55rem] text-white/25">Select workspace:</p>
                {workspaces.map((m) => (
                  <button
                    key={m.workspace.id}
                    onClick={() => {
                      setNewClientWorkspaceId(m.workspace.id);
                      setNewMenuOpen(false);
                      setNewMenuAction(null);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-white/50 hover:text-white/80 hover:bg-white/[0.04] transition-colors"
                  >
                    {m.workspace.name}
                  </button>
                ))}
              </div>
            ) : newMenuAction === "project" ? (
              <div className="py-1">
                <p className="px-3 py-1 text-[0.55rem] text-white/25">Select client:</p>
                {workspaces.flatMap((m) =>
                  m.workspace.clients.map((client) => (
                    <button
                      key={client.id}
                      onClick={() => {
                        setNewProjectClientId(client.id);
                        setNewMenuOpen(false);
                        setNewMenuAction(null);
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-white/50 hover:text-white/80 hover:bg-white/[0.04] transition-colors"
                    >
                      <span>{client.name}</span>
                      <span className="text-white/20 ml-1.5 text-[0.6rem]">{m.workspace.name}</span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <button
            onClick={() => setNewMenuOpen(true)}
            className="w-full text-left px-1 py-1.5 text-[0.65rem] text-white/25 hover:text-white/50 transition-colors"
          >
            + New
          </button>
        )}
      </div>

      {/* Bottom nav */}
      <div className="pt-3 mt-3 border-t border-white/[0.06] space-y-1">
            {/* Notes */}
            <button
              onClick={onNotes}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                notesActive
                  ? "bg-white/[0.08] text-white/80"
                  : "text-white/30 hover:text-white/50 hover:bg-white/[0.04]"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              Notes
            </button>

            {/* Wishlist */}
            <button
              onClick={onWishlist}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                wishlistActive
                  ? "bg-white/[0.08] text-white/80"
                  : "text-white/30 hover:text-white/50 hover:bg-white/[0.04]"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              Wishlist
            </button>

            {/* Feedback */}
            <button
              onClick={onFeedback}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                feedbackActive
                  ? "bg-white/[0.08] text-white/80"
                  : "text-white/30 hover:text-white/50 hover:bg-white/[0.04]"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Feedback
            </button>

            {/* Client View */}
            <button
              onClick={onClientView}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                clientViewActive
                  ? "bg-white/[0.08] text-white/80"
                  : "text-white/30 hover:text-white/50 hover:bg-white/[0.04]"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              Client View
            </button>

            {/* Cost Center */}
            <button
              onClick={onCostCenter}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                costCenterActive
                  ? "bg-white/[0.08] text-white/80"
                  : "text-white/30 hover:text-white/50 hover:bg-white/[0.04]"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              Cost Center
            </button>

        {/* Team */}
        <button
          onClick={onTeam}
          className={`w-full px-3 py-2 text-xs rounded-lg transition-colors flex items-center gap-2 ${
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
          className="w-full px-3 py-2 text-xs rounded-lg text-white/30 hover:text-white/50 hover:bg-white/[0.04] transition-colors flex items-center gap-2"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          Changelog
        </a>

        {/* Log out */}
        <button
          onClick={onLogout}
          className="w-full px-3 py-2 text-xs rounded-lg text-red-400/50 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          Log out
        </button>
      </div>
    </aside>
  );
}


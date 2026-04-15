"use client";

import { useState, useEffect, useCallback } from "react";

type ClientMember = {
  id: string;
  userId: string | null;
  invitedEmail: string | null;
  role: string;
  user: { id: string; email: string; name: string | null } | null;
  projectAccess: { projectId: string; project: { id: string; name: string } }[];
};

type ProjectSummary = { id: string; name: string };
type ClientData = { id: string; name: string; projects: ProjectSummary[] };
type WorkspaceData = {
  id: string;
  name: string;
  clients: ClientData[];
};

type Props = {
  workspaces: {
    workspaceId: string;
    role: string;
    workspace: WorkspaceData;
  }[];
  onUpdate: () => void;
  isAdmin?: boolean;
  projectId?: string | null;
};

export function PaneTeam({ workspaces, onUpdate, isAdmin, projectId }: Props) {
  const [membersByClient, setMembersByClient] = useState<Record<string, ClientMember[]>>({});
  const [loading, setLoading] = useState(true);
  const [addEmail, setAddEmail] = useState("");
  const [addClientId, setAddClientId] = useState("");
  const [addProjectIds, setAddProjectIds] = useState<string[]>([]);
  const [addRole, setAddRole] = useState<string>("member");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");
  const [editingMember, setEditingMember] = useState<{ clientId: string; memberId: string } | null>(null);
  const [editProjectIds, setEditProjectIds] = useState<string[]>([]);
  const [editLoading, setEditLoading] = useState(false);

  const allClients = workspaces.flatMap((m) => m.workspace.clients);

  const loadAllMembers = useCallback(async () => {
    setLoading(true);
    const results: Record<string, ClientMember[]> = {};
    await Promise.all(
      allClients.map(async (client) => {
        const res = await fetch(`/api/clients/${client.id}/members`, { cache: "no-store" });
        if (res.ok) {
          results[client.id] = await res.json();
        }
      })
    );
    setMembersByClient(results);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(allClients.map((c) => c.id))]);

  useEffect(() => {
    loadAllMembers();
  }, [loadAllMembers]);

  // Set default addClientId
  useEffect(() => {
    if (!addClientId && allClients.length > 0) {
      setAddClientId(allClients[0].id);
    }
  }, [addClientId, allClients]);

  const selectedClient = allClients.find((c) => c.id === addClientId);

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!addEmail.trim() || !addClientId || addLoading) return;
    setAddLoading(true);
    setAddError("");
    try {
      const res = await fetch(`/api/clients/${addClientId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail.trim(), projectIds: addProjectIds, role: addRole }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add member");
      }
      setAddEmail("");
      setAddProjectIds([]);
      setAddRole("member");
      await loadAllMembers();
      onUpdate();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to add member");
    } finally {
      setAddLoading(false);
    }
  }

  async function handleRemoveMember(clientId: string, memberId: string) {
    const res = await fetch(`/api/clients/${clientId}/members/${memberId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await loadAllMembers();
      onUpdate();
    }
  }

  function startEditAccess(clientId: string, member: ClientMember) {
    setEditingMember({ clientId, memberId: member.id });
    setEditProjectIds(member.projectAccess.map((a) => a.projectId));
  }

  async function handleSaveAccess() {
    if (!editingMember || editLoading) return;
    setEditLoading(true);
    try {
      await fetch(
        `/api/clients/${editingMember.clientId}/members/${editingMember.memberId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectIds: editProjectIds }),
        }
      );
      setEditingMember(null);
      await loadAllMembers();
      onUpdate();
    } finally {
      setEditLoading(false);
    }
  }

  async function handleRoleChange(clientId: string, memberId: string, newRole: string) {
    await fetch(`/api/clients/${clientId}/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    await loadAllMembers();
    onUpdate();
  }

  function toggleProjectId(projectId: string, ids: string[], setIds: (v: string[]) => void) {
    if (ids.includes(projectId)) {
      setIds(ids.filter((id) => id !== projectId));
    } else {
      setIds([...ids, projectId]);
    }
  }

  // Find workspace name for a client
  function getWorkspaceName(clientId: string): string {
    for (const m of workspaces) {
      if (m.workspace.clients.some((c) => c.id === clientId)) {
        return m.workspace.name;
      }
    }
    return "";
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-[#f1f5f9] mb-1">Team</h1>
      <p className="text-sm text-white/40 mb-6">
        {isAdmin
          ? "Manage members across all workspaces, clients, and projects."
          : "View team members across all workspaces, clients, and projects."}
      </p>

      {/* Add member form */}
      {isAdmin && <form
        onSubmit={handleAddMember}
        className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 mb-6 space-y-3"
      >
        <p className="text-[0.6rem] uppercase tracking-widest text-white/30">Add member</p>
        <div className="flex gap-2">
          <input
            value={addEmail}
            onChange={(e) => { setAddEmail(e.target.value); setAddError(""); }}
            placeholder="Email address"
            type="email"
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/20"
          />
          <select
            value={addRole}
            onChange={(e) => setAddRole(e.target.value)}
            className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white/80 focus:outline-none focus:border-white/20"
          >
            <option value="member" className="bg-[#0c1120] text-white">Member</option>
            <option value="admin" className="bg-[#0c1120] text-white">Admin</option>
          </select>
          <select
            value={addClientId}
            onChange={(e) => { setAddClientId(e.target.value); setAddProjectIds([]); }}
            className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white/80 focus:outline-none focus:border-white/20"
          >
            {allClients.map((c) => (
              <option key={c.id} value={c.id} className="bg-[#0c1120] text-white">
                {c.name} ({getWorkspaceName(c.id)})
              </option>
            ))}
          </select>
        </div>
        {selectedClient && selectedClient.projects.length > 0 && (
          <div className="space-y-1">
            <p className="text-[0.6rem] text-white/30">Grant project access</p>
            <div className="flex flex-wrap gap-2">
              {selectedClient.projects.map((proj) => (
                <label key={proj.id} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addProjectIds.includes(proj.id)}
                    onChange={() => toggleProjectId(proj.id, addProjectIds, setAddProjectIds)}
                    className="rounded border-white/20 bg-transparent accent-blue-500"
                  />
                  <span className="text-xs text-white/60">{proj.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        {addError && <p className="text-[0.6rem] text-red-400">{addError}</p>}
        <button
          type="submit"
          disabled={addLoading || !addEmail.trim()}
          className="px-4 py-2 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {addLoading ? "Adding..." : "Add member"}
        </button>
      </form>}

      {/* Members by client */}
      {loading ? (
        <p className="text-xs text-white/30">Loading team...</p>
      ) : (
        workspaces.map((membership) => {
          const ws = membership.workspace;
          return (
            <div key={ws.id} className="mb-6">
              <p className="text-[0.6rem] uppercase tracking-widest text-white/40 mb-3">
                {ws.name}
              </p>
              {ws.clients.map((client) => {
                const members = membersByClient[client.id] || [];
                return (
                  <div key={client.id} className="mb-4 ml-2">
                    <p className="text-[0.55rem] uppercase tracking-widest text-white/30 mb-2">
                      {client.name}
                      <span className="text-white/15 ml-2 normal-case tracking-normal">
                        {members.length} member{members.length !== 1 ? "s" : ""}
                      </span>
                    </p>
                    {members.length === 0 ? (
                      <p className="text-xs text-white/20 px-2 py-1 ml-2">No members</p>
                    ) : (
                      <div className="space-y-1.5 ml-2">
                        {members.map((member) => {
                          const email = member.user?.email || member.invitedEmail || "";
                          const name = member.user?.name || null;
                          const isEditing =
                            editingMember?.clientId === client.id &&
                            editingMember?.memberId === member.id;

                          return (
                            <div
                              key={member.id}
                              className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 group"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="text-xs text-white/70 truncate">
                                      {name || email}
                                    </p>
                                    {isAdmin ? (
                                      <select
                                        value={member.role || "member"}
                                        onChange={(e) => handleRoleChange(client.id, member.id, e.target.value)}
                                        className="text-[0.55rem] px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-white/50 focus:outline-none focus:border-white/20 cursor-pointer"
                                      >
                                        <option value="member" className="bg-[#0c1120] text-white">member</option>
                                        <option value="admin" className="bg-[#0c1120] text-white">admin</option>
                                      </select>
                                    ) : (
                                      <span className={`text-[0.55rem] px-1.5 py-0.5 rounded ${
                                        member.role === "admin"
                                          ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                                          : "bg-white/[0.06] text-white/30 border border-white/[0.08]"
                                      }`}>
                                        {member.role || "member"}
                                      </span>
                                    )}
                                  </div>
                                  {name && (
                                    <p className="text-[0.6rem] text-white/30 truncate">
                                      {email}
                                    </p>
                                  )}
                                </div>
                                {isAdmin && (
                                  <button
                                    onClick={() => handleRemoveMember(client.id, member.id)}
                                    className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 transition-all p-0.5 shrink-0"
                                    title="Remove from client"
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <line x1="18" y1="6" x2="6" y2="18" />
                                      <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                  </button>
                                )}
                              </div>

                              {/* Project access tags */}
                              {!isEditing && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {member.projectAccess.map((a) => (
                                    <span
                                      key={a.projectId}
                                      className="text-[0.6rem] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20"
                                    >
                                      {a.project.name}
                                    </span>
                                  ))}
                                  {member.projectAccess.length === 0 && (
                                    <span className="text-[0.6rem] text-white/20">
                                      No project access
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Edit access */}
                              {isEditing ? (
                                <div className="mt-2 space-y-2">
                                  {client.projects.map((proj) => (
                                    <label
                                      key={proj.id}
                                      className="flex items-center gap-2 cursor-pointer"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={editProjectIds.includes(proj.id)}
                                        onChange={() =>
                                          toggleProjectId(
                                            proj.id,
                                            editProjectIds,
                                            setEditProjectIds
                                          )
                                        }
                                        className="rounded border-white/20 bg-transparent accent-blue-500"
                                      />
                                      <span className="text-xs text-white/60">{proj.name}</span>
                                    </label>
                                  ))}
                                  <div className="flex gap-2">
                                    <button
                                      onClick={handleSaveAccess}
                                      disabled={editLoading}
                                      className="text-[0.6rem] px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                                    >
                                      {editLoading ? "Saving..." : "Save"}
                                    </button>
                                    <button
                                      onClick={() => setEditingMember(null)}
                                      className="text-[0.6rem] px-2 py-1 rounded text-white/30 hover:text-white/50 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : isAdmin ? (
                                <button
                                  onClick={() => startEditAccess(client.id, member)}
                                  className="text-[0.6rem] text-blue-400/70 hover:text-blue-400 transition-colors mt-1.5"
                                >
                                  Edit access
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
}

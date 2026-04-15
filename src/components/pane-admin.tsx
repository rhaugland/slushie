"use client";

import { useState, useEffect, useCallback } from "react";

type Props = {
  workspaces: any[];
  onUpdate: () => void;
};

export function PaneAdmin({ workspaces, onUpdate }: Props) {
  // Expanded state tracking
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set());
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());

  // Form state
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newClientName, setNewClientName] = useState<Record<string, string>>({});
  const [newProjectName, setNewProjectName] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Inline add-member popover
  const [addingMemberFor, setAddingMemberFor] = useState<{ clientId: string; projectId: string } | null>(null);
  const [addMemberEmail, setAddMemberEmail] = useState("");

  // Client members cache
  const [clientMembers, setClientMembers] = useState<Record<string, any[]>>({});

  // Workspace members
  const [wsMembers, setWsMembers] = useState<Record<string, any[]>>({});
  const [inviteWs, setInviteWs] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  const loadClientMembers = useCallback(async (clientId: string) => {
    try {
      const res = await fetch(`/api/clients/${clientId}/members`);
      if (res.ok) {
        const data = await res.json();
        setClientMembers((prev) => ({ ...prev, [clientId]: data }));
      }
    } catch {}
  }, []);

  const loadWsMembers = useCallback(async (wsId: string) => {
    try {
      const res = await fetch(`/api/workspaces/${wsId}/members`);
      if (res.ok) {
        const data = await res.json();
        setWsMembers((prev) => ({ ...prev, [wsId]: data }));
      }
    } catch {}
  }, []);

  // Load client members when a client is expanded
  useEffect(() => {
    for (const cId of expandedClients) {
      if (!clientMembers[cId]) loadClientMembers(cId);
    }
  }, [expandedClients, clientMembers, loadClientMembers]);

  function toggleWorkspace(id: string) {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else { next.add(id); loadWsMembers(id); }
      return next;
    });
  }

  function toggleClient(id: string) {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreateWorkspace() {
    if (!newWorkspaceName.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newWorkspaceName.trim() }),
      });
      if (!res.ok) { setError((await res.json()).error || "Failed"); return; }
      setNewWorkspaceName("");
      onUpdate();
    } catch { setError("Failed"); }
    finally { setSaving(false); }
  }

  async function handleCreateClient(wsId: string) {
    const name = newClientName[wsId]?.trim();
    if (!name) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, workspaceId: wsId }),
      });
      if (!res.ok) { setError((await res.json()).error || "Failed"); return; }
      setNewClientName((prev) => ({ ...prev, [wsId]: "" }));
      onUpdate();
    } catch { setError("Failed"); }
    finally { setSaving(false); }
  }

  async function handleCreateProject(clientId: string) {
    const name = newProjectName[clientId]?.trim();
    if (!name) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, clientId }),
      });
      if (!res.ok) { setError((await res.json()).error || "Failed"); return; }
      setNewProjectName((prev) => ({ ...prev, [clientId]: "" }));
      onUpdate();
    } catch { setError("Failed"); }
    finally { setSaving(false); }
  }

  async function handleAddMember() {
    if (!addingMemberFor || !addMemberEmail.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/clients/${addingMemberFor.clientId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addMemberEmail.trim(), projectIds: [addingMemberFor.projectId] }),
      });
      if (!res.ok) { setError((await res.json()).error || "Failed"); return; }
      setAddMemberEmail("");
      setAddingMemberFor(null);
      loadClientMembers(addingMemberFor.clientId);
    } catch { setError("Failed"); }
    finally { setSaving(false); }
  }

  async function handleRemoveMember(clientId: string, memberId: string) {
    try {
      await fetch(`/api/clients/${clientId}/members/${memberId}`, { method: "DELETE" });
      loadClientMembers(clientId);
    } catch {}
  }

  async function handleInviteWsMember(wsId: string) {
    if (!inviteEmail.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/workspaces/${wsId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      if (!res.ok) { setError((await res.json()).error || "Failed"); return; }
      setInviteEmail("");
      setInviteWs(null);
      loadWsMembers(wsId);
      onUpdate();
    } catch { setError("Failed"); }
    finally { setSaving(false); }
  }

  async function handleRemoveWsMember(wsId: string, memberId: string) {
    try {
      await fetch(`/api/workspaces/${wsId}/members/${memberId}`, { method: "DELETE" });
      loadWsMembers(wsId);
      onUpdate();
    } catch {}
  }

  async function handleChangeWsRole(wsId: string, memberId: string, role: string) {
    try {
      await fetch(`/api/workspaces/${wsId}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      loadWsMembers(wsId);
      onUpdate();
    } catch {}
  }

  // Get members for a specific project
  function getMembersForProject(clientId: string, projectId: string): any[] {
    const members = clientMembers[clientId] || [];
    return members.filter((m: any) =>
      m.projectAccess?.some((pa: any) => pa.projectId === projectId)
    );
  }

  const chevron = (expanded: boolean) => (
    <svg
      className={`w-3.5 h-3.5 text-white/25 transition-transform ${expanded ? "rotate-90" : ""}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );

  return (
    <div className="max-w-3xl">
      {error && <div className="text-red-400 text-xs mb-3">{error}</div>}

      {/* Create workspace */}
      <div className="flex items-center gap-2 mb-6">
        <input
          value={newWorkspaceName}
          onChange={(e) => setNewWorkspaceName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreateWorkspace()}
          placeholder="New workspace..."
          className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20"
        />
        <button
          onClick={handleCreateWorkspace}
          disabled={saving || !newWorkspaceName.trim()}
          className="px-4 py-2 text-sm rounded-lg bg-white/[0.08] text-white/60 hover:bg-white/[0.12] hover:text-white/80 transition-colors disabled:opacity-30"
        >
          Create
        </button>
      </div>

      {/* Expandable tree */}
      <div className="space-y-1">
        {workspaces.map((m: any) => {
          const ws = m.workspace;
          const wsExpanded = expandedWorkspaces.has(ws.id);
          const clients = ws.clients || [];
          const wsMemberList = wsMembers[ws.id] || [];

          return (
            <div key={ws.id}>
              {/* Workspace row */}
              <button
                onClick={() => toggleWorkspace(ws.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors text-left group"
              >
                {chevron(wsExpanded)}
                <span className="text-sm font-medium text-white/70 group-hover:text-white/90">{ws.name}</span>
                <span className="text-xs text-white/20 ml-auto">{m.role}</span>
              </button>

              {/* Expanded workspace content */}
              {wsExpanded && (
                <div className="ml-6 border-l border-white/[0.06] pl-4 pb-2">
                  {/* Workspace members */}
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[0.6rem] uppercase tracking-widest text-white/20">Members</span>
                      <button
                        onClick={() => setInviteWs(inviteWs === ws.id ? null : ws.id)}
                        className="text-white/15 hover:text-white/50 transition-colors"
                        title="Invite member"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </div>
                    {inviteWs === ws.id && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <input
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleInviteWsMember(ws.id)}
                          placeholder="email"
                          autoFocus
                          className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 text-xs text-white/70 placeholder:text-white/20 focus:outline-none focus:border-white/20"
                        />
                        <select
                          value={inviteRole}
                          onChange={(e) => setInviteRole(e.target.value)}
                          className="bg-white/[0.04] border border-white/[0.08] rounded px-1 py-1 text-xs text-white/50 focus:outline-none"
                        >
                          <option value="member">member</option>
                          <option value="admin">admin</option>
                        </select>
                        <button
                          onClick={() => handleInviteWsMember(ws.id)}
                          disabled={saving || !inviteEmail.trim()}
                          className="px-2 py-1 text-xs rounded bg-white/[0.08] text-white/50 hover:bg-white/[0.12] disabled:opacity-30"
                        >
                          Invite
                        </button>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {wsMemberList.map((wm: any) => (
                        <span key={wm.id} className="group/tag inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.06] text-xs text-white/50">
                          {wm.user?.name || wm.invitedEmail || "?"}
                          <span className="text-white/20 text-[0.5rem]">{wm.role}</span>
                          {wm.role !== "owner" && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRemoveWsMember(ws.id, wm.id); }}
                              className="text-white/0 group-hover/tag:text-white/30 hover:!text-red-400 transition-colors ml-0.5"
                            >
                              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Clients under workspace */}
                  {clients.map((c: any) => {
                    const clientExpanded = expandedClients.has(c.id);
                    const projects = c.projects || [];

                    return (
                      <div key={c.id}>
                        <button
                          onClick={() => toggleClient(c.id)}
                          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/[0.04] transition-colors text-left group"
                        >
                          {chevron(clientExpanded)}
                          <span className="text-sm text-white/55 group-hover:text-white/80">{c.name}</span>
                          <span className="text-xs text-white/15 ml-auto">{projects.length} project{projects.length !== 1 ? "s" : ""}</span>
                        </button>

                        {/* Expanded client: projects */}
                        {clientExpanded && (
                          <div className="ml-5 border-l border-white/[0.04] pl-4 pb-1">
                            {projects.map((p: any) => {
                              const pMembers = getMembersForProject(c.id, p.id);
                              const isAdding = addingMemberFor?.projectId === p.id;

                              return (
                                <div key={p.id} className="py-1.5">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs text-white/45">{p.name}</span>
                                  </div>
                                  {/* Member tags + add button */}
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {pMembers.map((pm: any) => (
                                      <span key={pm.id} className="group/tag inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.05] text-[0.65rem] text-white/40">
                                        {pm.user?.name || pm.invitedEmail || "?"}
                                        <button
                                          onClick={() => handleRemoveMember(c.id, pm.id)}
                                          className="text-white/0 group-hover/tag:text-white/30 hover:!text-red-400 transition-colors ml-0.5"
                                        >
                                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                      </span>
                                    ))}
                                    {pMembers.length === 0 && !isAdding && (
                                      <span className="text-[0.6rem] text-white/15">no members</span>
                                    )}

                                    {/* Inline add */}
                                    {isAdding ? (
                                      <div className="inline-flex items-center gap-1">
                                        <input
                                          value={addMemberEmail}
                                          onChange={(e) => setAddMemberEmail(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") handleAddMember();
                                            if (e.key === "Escape") { setAddingMemberFor(null); setAddMemberEmail(""); }
                                          }}
                                          placeholder="email"
                                          autoFocus
                                          className="bg-white/[0.04] border border-white/[0.08] rounded px-2 py-0.5 text-[0.65rem] text-white/60 placeholder:text-white/15 focus:outline-none focus:border-white/20 w-36"
                                        />
                                        <button
                                          onClick={handleAddMember}
                                          disabled={saving || !addMemberEmail.trim()}
                                          className="px-1.5 py-0.5 text-[0.6rem] rounded bg-white/[0.08] text-white/40 hover:bg-white/[0.12] disabled:opacity-30"
                                        >
                                          Add
                                        </button>
                                        <button
                                          onClick={() => { setAddingMemberFor(null); setAddMemberEmail(""); }}
                                          className="text-white/20 hover:text-white/50"
                                        >
                                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => { setAddingMemberFor({ clientId: c.id, projectId: p.id }); setAddMemberEmail(""); }}
                                        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/[0.04] text-white/20 hover:bg-white/[0.08] hover:text-white/50 transition-colors"
                                        title="Add member"
                                      >
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                        </svg>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}

                            {/* Add project inline */}
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <input
                                value={newProjectName[c.id] || ""}
                                onChange={(e) => setNewProjectName((prev) => ({ ...prev, [c.id]: e.target.value }))}
                                onKeyDown={(e) => e.key === "Enter" && handleCreateProject(c.id)}
                                placeholder="+ project"
                                className="bg-transparent border-none text-xs text-white/30 placeholder:text-white/10 focus:outline-none focus:text-white/60 w-28"
                              />
                              {(newProjectName[c.id] || "").trim() && (
                                <button
                                  onClick={() => handleCreateProject(c.id)}
                                  disabled={saving}
                                  className="text-[0.6rem] text-white/30 hover:text-white/60"
                                >
                                  add
                                </button>
                              )}
                            </div>

                            {projects.length === 0 && (
                              <div className="text-[0.6rem] text-white/15 py-1">No projects</div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add client inline */}
                  <div className="flex items-center gap-1.5 mt-1">
                    <input
                      value={newClientName[ws.id] || ""}
                      onChange={(e) => setNewClientName((prev) => ({ ...prev, [ws.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateClient(ws.id)}
                      placeholder="+ client"
                      className="bg-transparent border-none text-xs text-white/30 placeholder:text-white/10 focus:outline-none focus:text-white/60 w-28"
                    />
                    {(newClientName[ws.id] || "").trim() && (
                      <button
                        onClick={() => handleCreateClient(ws.id)}
                        disabled={saving}
                        className="text-[0.6rem] text-white/30 hover:text-white/60"
                      >
                        add
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

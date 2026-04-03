"use client";

import { useState, useEffect } from "react";
import { EditableText } from "./editable-text";

type Member = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  projectIds: string[];
};

type Props = {
  client: { id: string; name: string; workspaceId: string };
  projects: { id: string; name: string }[];
  currentUserId: string;
  onUpdate: () => void;
};

export function ClientSettings({ client, projects, currentUserId, onUpdate }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Add member form state
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<string>("member");
  const [addProjectIds, setAddProjectIds] = useState<string[]>([]);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");

  // Edit access state: memberId -> draft projectIds
  const [editingAccess, setEditingAccess] = useState<string | null>(null);
  const [editProjectIds, setEditProjectIds] = useState<string[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  async function loadMembers() {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/members`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load members");
      const data = await res.json();
      setMembers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  async function handleRename(name: string) {
    setError("");
    const res = await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      setError("Failed to rename client");
    } else {
      onUpdate();
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!addEmail.trim() || addLoading) return;
    setAddLoading(true);
    setAddError("");
    try {
      const res = await fetch(`/api/clients/${client.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail.trim(), projectIds: addProjectIds, role: addRole }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add member");
      }
      setAddEmail("");
      setAddRole("member");
      setAddProjectIds([]);
      await loadMembers();
      onUpdate();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to add member");
    } finally {
      setAddLoading(false);
    }
  }

  async function handleRemoveMember(memberId: string) {
    setError("");
    const res = await fetch(`/api/clients/${client.id}/members/${memberId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setError("Failed to remove member");
    } else {
      await loadMembers();
      onUpdate();
    }
  }

  async function handleRoleChange(memberId: string, newRole: string) {
    await fetch(`/api/clients/${client.id}/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    await loadMembers();
    onUpdate();
  }

  function startEditAccess(member: Member) {
    setEditingAccess(member.id);
    setEditProjectIds([...member.projectIds]);
    setEditError("");
  }

  async function handleSaveAccess(memberId: string) {
    setEditLoading(true);
    setEditError("");
    try {
      const res = await fetch(`/api/clients/${client.id}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectIds: editProjectIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update access");
      }
      setEditingAccess(null);
      await loadMembers();
      onUpdate();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Failed to update access");
    } finally {
      setEditLoading(false);
    }
  }

  function toggleProjectId(projectId: string, ids: string[], setIds: (v: string[]) => void) {
    if (ids.includes(projectId)) {
      setIds(ids.filter((id) => id !== projectId));
    } else {
      setIds([...ids, projectId]);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <EditableText
          value={client.name}
          onSave={handleRename}
          className="text-sm font-medium text-white"
          inputClassName="text-sm text-white"
        />
        <p className="text-xs text-white/30 mt-0.5">Client settings</p>
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5">
          {error}
        </p>
      )}

      {/* Members list */}
      <div className="space-y-1">
        <p className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-2">Members</p>

        {loading ? (
          <p className="text-xs text-white/30 px-1">Loading...</p>
        ) : members.length === 0 ? (
          <p className="text-xs text-white/20 px-1">No members yet</p>
        ) : (
          members.map((member) => (
            <div
              key={member.id}
              className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-white/70 truncate">
                      {member.name || member.email}
                    </p>
                    <select
                      value={member.role || "member"}
                      onChange={(e) => handleRoleChange(member.id, e.target.value)}
                      className="text-[0.55rem] px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-white/50 focus:outline-none focus:border-white/20 cursor-pointer"
                    >
                      <option value="member" className="bg-[#0c1120] text-white">member</option>
                      <option value="admin" className="bg-[#0c1120] text-white">admin</option>
                    </select>
                  </div>
                  {member.name && (
                    <p className="text-[0.6rem] text-white/30 truncate">{member.email}</p>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveMember(member.id)}
                  className="text-white/20 hover:text-red-400 transition-colors shrink-0 p-0.5"
                  title="Remove member"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Project access tags */}
              {editingAccess !== member.id && (
                <div className="flex flex-wrap gap-1">
                  {member.projectIds.map((pid) => {
                    const proj = projects.find((p) => p.id === pid);
                    if (!proj) return null;
                    return (
                      <span
                        key={pid}
                        className="text-[0.6rem] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20"
                      >
                        {proj.name}
                      </span>
                    );
                  })}
                  {member.projectIds.length === 0 && (
                    <span className="text-[0.6rem] text-white/20">No project access</span>
                  )}
                </div>
              )}

              {/* Edit access inline */}
              {editingAccess === member.id ? (
                <div className="space-y-2">
                  {projects.map((proj) => (
                    <label key={proj.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editProjectIds.includes(proj.id)}
                        onChange={() => toggleProjectId(proj.id, editProjectIds, setEditProjectIds)}
                        className="rounded border-white/20 bg-transparent accent-blue-500"
                      />
                      <span className="text-xs text-white/60">{proj.name}</span>
                    </label>
                  ))}
                  {editError && (
                    <p className="text-[0.6rem] text-red-400">{editError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSaveAccess(member.id)}
                      disabled={editLoading}
                      className="text-[0.6rem] px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                    >
                      {editLoading ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={() => setEditingAccess(null)}
                      className="text-[0.6rem] px-2 py-1 rounded text-white/30 hover:text-white/50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => startEditAccess(member)}
                  className="text-[0.6rem] text-blue-400/70 hover:text-blue-400 transition-colors"
                >
                  Edit access
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add member form */}
      <form onSubmit={handleAddMember} className="space-y-2 pt-2 border-t border-white/[0.06]">
        <p className="text-[0.6rem] uppercase tracking-widest text-white/30">Add member</p>
        <div className="flex gap-2">
          <input
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
            placeholder="Email address"
            type="email"
            className="flex-1 bg-transparent border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/20"
          />
          <select
            value={addRole}
            onChange={(e) => setAddRole(e.target.value)}
            className="bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1.5 text-xs text-white/80 focus:outline-none focus:border-white/20"
          >
            <option value="member" className="bg-[#0c1120] text-white">Member</option>
            <option value="admin" className="bg-[#0c1120] text-white">Admin</option>
          </select>
        </div>
        {projects.length > 0 && (
          <div className="space-y-1">
            <p className="text-[0.6rem] text-white/30">Project access</p>
            {projects.map((proj) => (
              <label key={proj.id} className="flex items-center gap-2 cursor-pointer">
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
        )}
        {addError && (
          <p className="text-[0.6rem] text-red-400">{addError}</p>
        )}
        <button
          type="submit"
          disabled={addLoading || !addEmail.trim()}
          className="w-full text-xs py-1.5 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {addLoading ? "Adding..." : "Add member"}
        </button>
      </form>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { EditableText } from "./editable-text";

type ClientMember = {
  id: string;
  userId: string | null;
  invitedEmail: string | null;
  role: string;
  user: { id: string; email: string; name: string | null } | null;
  projectAccess: { projectId: string }[];
};

type Props = {
  project: {
    id: string;
    name: string;
    clientId: string;
    workspaceId: string;
    deployUrl: string | null;
    deployStatus: string;
    features: any[];
    meetings: any[];
    client?: { id: string; name: string };
  };
  onUpdate: () => void;
  onOpenPreview?: () => void;
  isAdmin?: boolean;
};

export function PaneProject({ project, onUpdate, onOpenPreview, isAdmin }: Props) {
  const [members, setMembers] = useState<ClientMember[]>([]);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<string>("member");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");

  const loadMembers = useCallback(async () => {
    if (!project.clientId) return;
    const res = await fetch(`/api/clients/${project.clientId}/members`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = await res.json();
    setMembers(data);
  }, [project.clientId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const projectMembers = members.filter((m) =>
    m.projectAccess.some((a) => a.projectId === project.id)
  );

  async function handleRename(name: string) {
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    onUpdate();
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!addEmail.trim() || addLoading) return;
    setAddLoading(true);
    setAddError("");
    try {
      // Check if user is already a client member
      const existing = members.find(
        (m) => m.user?.email === addEmail.trim() || m.invitedEmail === addEmail.trim()
      );
      if (existing) {
        // Grant access to this project
        const currentProjectIds = existing.projectAccess.map((a) => a.projectId);
        if (currentProjectIds.includes(project.id)) {
          setAddError("Already has access to this project");
          return;
        }
        const res = await fetch(
          `/api/clients/${project.clientId}/members/${existing.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectIds: [...currentProjectIds, project.id] }),
          }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to grant access");
        }
      } else {
        // Add new client member with this project
        const res = await fetch(`/api/clients/${project.clientId}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: addEmail.trim(), projectIds: [project.id], role: addRole }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to add member");
        }
      }
      setAddEmail("");
      setAddRole("member");
      await loadMembers();
      onUpdate();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to add member");
    } finally {
      setAddLoading(false);
    }
  }

  async function handleRoleChange(member: ClientMember, newRole: string) {
    await fetch(`/api/clients/${project.clientId}/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    await loadMembers();
    onUpdate();
  }

  async function handleRemoveAccess(member: ClientMember) {
    const newProjectIds = member.projectAccess
      .map((a) => a.projectId)
      .filter((id) => id !== project.id);
    const res = await fetch(
      `/api/clients/${project.clientId}/members/${member.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectIds: newProjectIds }),
      }
    );
    if (res.ok) {
      await loadMembers();
      onUpdate();
    }
  }

  return (
    <div>
      <EditableText
        value={project.name}
        onSave={handleRename}
        className="text-xl font-semibold text-[#f1f5f9]"
        inputClassName="text-xl font-semibold text-[#f1f5f9]"
      />
      <p className="text-xs text-white/40 mb-6 mt-1">
        {project.client?.name || ""}
      </p>

      {/* Preview button */}
      {project.deployUrl && (
        <button
          onClick={() => onOpenPreview?.()}
          className="flex items-center justify-center gap-2 w-full px-4 py-3 mb-6 rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/70 text-sm hover:bg-white/[0.06] hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <span>Preview</span>
        </button>
      )}

      {/* Team Members */}
      <div className="mb-6">
        <h3 className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-3">Team Members</h3>
        <div className="space-y-2 mb-4">
          {projectMembers.length === 0 ? (
            <p className="text-xs text-white/20 px-1">No team members yet</p>
          ) : (
            projectMembers.map((m) => {
              const email = m.user?.email || m.invitedEmail || "";
              const name = m.user?.name || null;
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white/80 truncate">{name || email}</span>
                      {isAdmin ? (
                        <select
                          value={m.role || "member"}
                          onChange={(e) => handleRoleChange(m, e.target.value)}
                          className="text-[0.55rem] px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-white/50 focus:outline-none focus:border-white/20 cursor-pointer"
                        >
                          <option value="member" className="bg-[#0c1120] text-white">member</option>
                          <option value="admin" className="bg-[#0c1120] text-white">admin</option>
                        </select>
                      ) : (
                        <span className={`text-[0.55rem] px-1.5 py-0.5 rounded ${
                          m.role === "admin"
                            ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                            : "bg-white/[0.06] text-white/30 border border-white/[0.08]"
                        }`}>
                          {m.role || "member"}
                        </span>
                      )}
                    </div>
                    {name && (
                      <div className="text-[0.6rem] text-white/30 truncate">{email}</div>
                    )}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleRemoveAccess(m)}
                      className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 transition-all p-1 shrink-0"
                      title="Remove from project"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Add member form */}
        {isAdmin && <form onSubmit={handleAddMember} className="flex gap-2">
          <input
            value={addEmail}
            onChange={(e) => { setAddEmail(e.target.value); setAddError(""); }}
            placeholder="Add by email..."
            type="email"
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/20"
          />
          <select
            value={addRole}
            onChange={(e) => setAddRole(e.target.value)}
            className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-2 text-xs text-white/80 focus:outline-none focus:border-white/20"
          >
            <option value="member" className="bg-[#0c1120] text-white">Member</option>
            <option value="admin" className="bg-[#0c1120] text-white">Admin</option>
          </select>
          <button
            type="submit"
            disabled={addLoading || !addEmail.trim()}
            className="px-3 py-2 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors shrink-0"
          >
            {addLoading ? "..." : "Add"}
          </button>
        </form>}
        {isAdmin && addError && (
          <p className="text-[0.6rem] text-red-400 mt-1.5 px-1">{addError}</p>
        )}
      </div>
    </div>
  );
}

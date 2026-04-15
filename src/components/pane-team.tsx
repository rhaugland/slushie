"use client";

import { useState, useEffect, useCallback } from "react";

type Member = {
  id: string;
  userId: string | null;
  invitedEmail: string | null;
  role: string;
  user: { id: string; email: string; name: string | null } | null;
  projectAccess: { projectId: string; project: { id: string; name: string } }[];
};

type Props = {
  workspaces: {
    workspaceId: string;
    role: string;
    workspace: {
      id: string;
      name: string;
      clients: {
        id: string;
        name: string;
        projects: { id: string; name: string }[];
      }[];
    };
  }[];
  onUpdate: () => void;
  isAdmin?: boolean;
  projectId?: string | null;
};

export function PaneTeam({ workspaces, onUpdate, isAdmin, projectId }: Props) {
  // Find the client that owns the selected project
  const clientForProject = (() => {
    for (const m of workspaces) {
      for (const c of m.workspace.clients) {
        if (c.projects.some((p) => p.id === projectId)) {
          return c;
        }
      }
    }
    return workspaces[0]?.workspace.clients[0] || null;
  })();

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite form
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");

  const loadMembers = useCallback(async () => {
    if (!clientForProject) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientForProject.id}/members`, { cache: "no-store" });
      if (res.ok) {
        const all: Member[] = await res.json();
        // Filter to only members with access to this project (or all if no projectId)
        if (projectId) {
          setMembers(all.filter((m) =>
            m.projectAccess.some((a) => a.projectId === projectId) || m.role === "admin"
          ));
        } else {
          setMembers(all);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [clientForProject?.id, projectId]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || !clientForProject || inviteLoading) return;
    setInviteLoading(true);
    setInviteError("");
    try {
      const res = await fetch(`/api/clients/${clientForProject.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
          projectIds: projectId ? [projectId] : [],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to invite");
      }
      setInviteEmail("");
      setInviteRole("member");
      setShowInvite(false);
      await loadMembers();
      onUpdate();
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : "Failed to invite");
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleRemove(memberId: string) {
    if (!clientForProject) return;
    await fetch(`/api/clients/${clientForProject.id}/members/${memberId}`, { method: "DELETE" });
    await loadMembers();
    onUpdate();
  }

  async function handleRoleChange(memberId: string, newRole: string) {
    if (!clientForProject) return;
    await fetch(`/api/clients/${clientForProject.id}/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    await loadMembers();
    onUpdate();
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <div className="flex-1" />
        {isAdmin && (
          <button
            onClick={() => setShowInvite(!showInvite)}
            className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white font-medium hover:opacity-90 transition-opacity"
          >
            + Invite Member
          </button>
        )}
      </div>

      {/* Invite form */}
      {showInvite && isAdmin && (
        <form onSubmit={handleInvite} className="mb-6 rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
          <div className="flex gap-2">
            <input
              value={inviteEmail}
              onChange={(e) => { setInviteEmail(e.target.value); setInviteError(""); }}
              placeholder="Email address"
              type="email"
              autoFocus
              className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/20"
            >
              <option value="member" className="bg-[#0c1120]">Member</option>
              <option value="admin" className="bg-[#0c1120]">Admin</option>
            </select>
          </div>
          {inviteError && <p className="text-xs text-red-400">{inviteError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={inviteLoading || !inviteEmail.trim()}
              className="px-4 py-2 text-xs rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {inviteLoading ? "Inviting..." : "Send Invite"}
            </button>
            <button
              type="button"
              onClick={() => { setShowInvite(false); setInviteEmail(""); setInviteError(""); }}
              className="px-4 py-2 text-xs text-white/30 hover:text-white/50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Member list */}
      {loading ? (
        <p className="text-sm text-white/30">Loading...</p>
      ) : members.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-white/30 mb-2">No team members yet.</p>
          <p className="text-xs text-white/20">Invite someone to collaborate on this project.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((member) => {
            const email = member.user?.email || member.invitedEmail || "";
            const name = member.user?.name || null;

            return (
              <div
                key={member.id}
                className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3 flex items-center gap-3 group"
              >
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0">
                  <span className="text-xs text-white/40 font-medium">
                    {(name || email).charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white/70 truncate">{name || email}</div>
                  {name && <div className="text-[0.6rem] text-white/30 truncate">{email}</div>}
                </div>

                {/* Role */}
                {isAdmin ? (
                  <select
                    value={member.role || "member"}
                    onChange={(e) => handleRoleChange(member.id, e.target.value)}
                    className="text-[0.6rem] px-2 py-1 rounded-md bg-white/[0.04] border border-white/[0.08] text-white/50 focus:outline-none cursor-pointer shrink-0"
                  >
                    <option value="member" className="bg-[#0c1120]">Member</option>
                    <option value="admin" className="bg-[#0c1120]">Admin</option>
                  </select>
                ) : (
                  <span className={`text-[0.6rem] px-2 py-1 rounded-md shrink-0 ${
                    member.role === "admin"
                      ? "bg-amber-500/15 text-amber-400"
                      : "bg-white/[0.06] text-white/30"
                  }`}>
                    {member.role || "member"}
                  </span>
                )}

                {/* Remove */}
                {isAdmin && (
                  <button
                    onClick={() => handleRemove(member.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-white/15 hover:text-red-400/60 transition-all shrink-0"
                    title="Remove member"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

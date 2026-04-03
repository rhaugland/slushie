"use client";

import { useState, useEffect, useCallback } from "react";
import { EditableText } from "./editable-text";

type Member = {
  id: string;
  role: string;
  invitedEmail: string | null;
  user: { id: string; name: string; email: string } | null;
};

type Props = {
  workspace: { id: string; name: string; slug: string };
  currentUserId: string;
  userRole: string;
  onWorkspaceRenamed: () => void;
};

export function WorkspaceSettings({ workspace, currentUserId, userRole, onWorkspaceRenamed }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");

  const isAdmin = userRole === "admin" || userRole === "owner";
  const [inviteRole, setInviteRole] = useState<string>("member");

  const loadMembers = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspace.id}/members`);
    if (res.ok) setMembers(await res.json());
  }, [workspace.id]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  async function handleRename(name: string) {
    await fetch(`/api/workspaces/${workspace.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    onWorkspaceRenamed();
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setError("");
    setInviting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Invite failed");
        return;
      }
      setInviteEmail("");
      setInviteRole("member");
      loadMembers();
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(memberId: string, newRole: string) {
    await fetch(`/api/workspaces/${workspace.id}/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    loadMembers();
  }

  async function handleRemove(memberId: string) {
    await fetch(`/api/workspaces/${workspace.id}/members/${memberId}`, {
      method: "DELETE",
    });
    loadMembers();
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-1">
        <EditableText
          value={workspace.name}
          onSave={handleRename}
          className="text-xl font-semibold text-[#f1f5f9]"
          inputClassName="text-xl font-semibold text-[#f1f5f9]"
        />
      </div>
      <p className="text-xs text-white/30 mb-8">Workspace settings</p>

      <div className="mb-6">
        <h3 className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-3">Members</h3>
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08]">
              <div>
                <div className="text-sm text-white/80">
                  {m.user?.name || m.invitedEmail}
                  {m.user?.id === currentUserId && (
                    <span className="text-[0.6rem] text-white/30 ml-2">(you)</span>
                  )}
                </div>
                <div className="text-[0.6rem] text-white/30">
                  {m.user?.email || m.invitedEmail}
                  {!m.user && (
                    <span className="ml-2 text-yellow-400/60 bg-yellow-400/10 px-1.5 py-0.5 rounded">Pending</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && m.user?.id !== currentUserId ? (
                  <select
                    value={m.role === "owner" ? "admin" : m.role}
                    onChange={(e) => handleRoleChange(m.id, e.target.value)}
                    className="text-[0.6rem] px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-white/50 focus:outline-none focus:border-white/20 cursor-pointer"
                  >
                    <option value="member" className="bg-[#0c1120] text-white">member</option>
                    <option value="admin" className="bg-[#0c1120] text-white">admin</option>
                  </select>
                ) : (
                  <span className={`text-[0.6rem] px-1.5 py-0.5 rounded ${
                    m.role === "admin" || m.role === "owner"
                      ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                      : "bg-white/[0.06] text-white/30 border border-white/[0.08]"
                  }`}>
                    {m.role === "owner" ? "admin" : m.role}
                  </span>
                )}
                {isAdmin && m.user?.id !== currentUserId && (
                  <button
                    onClick={() => handleRemove(m.id)}
                    className="text-white/20 hover:text-red-400 transition-colors p-1"
                    title="Remove member"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {isAdmin && (
        <div>
          <h3 className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-3">Invite member</h3>
          <form onSubmit={handleInvite} className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Email address"
              className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white/80 focus:outline-none focus:border-white/20"
            >
              <option value="member" className="bg-[#0c1120] text-white">Member</option>
              <option value="admin" className="bg-[#0c1120] text-white">Admin</option>
            </select>
            <button
              type="submit"
              disabled={inviting}
              className="px-4 py-2 text-xs rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {inviting ? "Inviting..." : "Invite"}
            </button>
          </form>
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        </div>
      )}
    </div>
  );
}

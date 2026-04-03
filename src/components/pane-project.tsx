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
  project: {
    id: string;
    name: string;
    clientName: string;
    workspaceId: string;
    deployUrl: string | null;
    deployStatus: string;
    features: any[];
    meetings: any[];
  };
  onUpdate: () => void;
  onOpenPreview?: () => void;
  currentUserId?: string;
};

export function PaneProject({ project, onUpdate, onOpenPreview, currentUserId }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");

  const loadMembers = useCallback(async () => {
    const res = await fetch(`/api/projects/${project.id}/members`);
    if (res.ok) setMembers(await res.json());
  }, [project.id]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  async function handleRename(name: string) {
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    onUpdate();
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setError("");
    setInviting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Invite failed");
        return;
      }
      setInviteEmail("");
      loadMembers();
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(memberId: string) {
    await fetch(`/api/projects/${project.id}/members/${memberId}`, {
      method: "DELETE",
    });
    loadMembers();
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
        {project.clientName}
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

      {/* Project Members */}
      <div className="mb-6">
        <h3 className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-1">Members</h3>
        <p className="text-[0.6rem] text-white/20 mb-3">Project only visible to these people</p>
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
                <span className="text-[0.6rem] text-white/20 uppercase tracking-wider">{m.role}</span>
                {m.user?.id !== currentUserId && (
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

      {/* Invite to project */}
      <div>
        <h3 className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-3">Add member</h3>
        <form onSubmit={handleInvite} className="flex gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="Email address"
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20"
          />
          <button
            type="submit"
            disabled={inviting}
            className="px-4 py-2 text-xs rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {inviting ? "Adding..." : "Add"}
          </button>
        </form>
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      </div>
    </div>
  );
}

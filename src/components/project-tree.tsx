"use client";

import { useState, useEffect, useCallback } from "react";
import { TreeNode } from "./tree-node";
import { EditableText } from "./editable-text";

type Feature = {
  id: string;
  title: string;
  enabled: boolean;
  status: string;
  parentId: string | null;
  children: Feature[];
  builds: { id: string; status: string }[];
};

type Meeting = {
  id: string;
  status: string;
  createdAt: string;
  suggestions: { id: string; status: string }[];
};

type Project = {
  id: string;
  name: string;
  clientId: string;
  deployUrl: string | null;
  deployStatus: string;
  features: Feature[];
  meetings: Meeting[];
};

type TeamMember = {
  id: string;
  userId: string | null;
  invitedEmail: string | null;
  role: string;
  user: { id: string; email: string; name: string | null } | null;
  projectAccess: { projectId: string }[];
};

type Selection =
  | { type: "project" }
  | { type: "feature"; id: string }
  | { type: "meeting"; id: string }
  | { type: "cost-center" };

type Props = {
  project: Project;
  selection: Selection;
  onSelect: (sel: Selection) => void;
  onToggle: (featureId: string, enabled: boolean) => void;
  onAddFeature: (parentId: string | null) => void;
  onCollapse: () => void;
  onRenameProject?: (name: string) => void;
  onTeamUpdate?: () => void;
  isAdmin?: boolean;
};

export function ProjectTree({ project, selection, onSelect, onToggle, onAddFeature, onCollapse, onRenameProject, onTeamUpdate, isAdmin }: Props) {
  const [meetingsOpen, setMeetingsOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(true);
  const [allMembers, setAllMembers] = useState<TeamMember[]>([]);
  const [addingMember, setAddingMember] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<string>("member");
  const [addLoading, setAddLoading] = useState(false);

  const loadMembers = useCallback(async () => {
    if (!project.clientId) return;
    const res = await fetch(`/api/clients/${project.clientId}/members`, { cache: "no-store" });
    if (!res.ok) return;
    setAllMembers(await res.json());
  }, [project.clientId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const teamMembers = allMembers.filter((m) =>
    m.projectAccess.some((a) => a.projectId === project.id)
  );

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addEmail.trim() || addLoading) return;
    setAddLoading(true);
    try {
      const existing = allMembers.find(
        (m) => m.user?.email === addEmail.trim() || m.invitedEmail === addEmail.trim()
      );
      if (existing) {
        const currentProjectIds = existing.projectAccess.map((a) => a.projectId);
        if (currentProjectIds.includes(project.id)) { setAddEmail(""); return; }
        await fetch(`/api/clients/${project.clientId}/members/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectIds: [...currentProjectIds, project.id] }),
        });
      } else {
        await fetch(`/api/clients/${project.clientId}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: addEmail.trim(), projectIds: [project.id], role: addRole }),
        });
      }
      setAddEmail("");
      setAddRole("member");
      setAddingMember(false);
      await loadMembers();
      onTeamUpdate?.();
    } finally {
      setAddLoading(false);
    }
  }

  async function handleRoleChange(member: TeamMember, newRole: string) {
    await fetch(`/api/clients/${project.clientId}/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    await loadMembers();
    onTeamUpdate?.();
  }

  async function handleRemoveFromProject(member: TeamMember) {
    const newProjectIds = member.projectAccess
      .map((a) => a.projectId)
      .filter((id) => id !== project.id);
    await fetch(`/api/clients/${project.clientId}/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectIds: newProjectIds }),
    });
    await loadMembers();
    onTeamUpdate?.();
  }

  const pendingSuggestions = project.meetings.reduce(
    (sum, m) => sum + m.suggestions.filter((s) => s.status === "pending").length,
    0
  );

  return (
    <div className="w-72 border-r border-white/[0.06] bg-[#0c1120] p-3 min-h-screen flex flex-col overflow-y-auto">
      {/* Collapse button */}
      <div className="flex justify-end mb-1">
        <button
          onClick={onCollapse}
          className="text-white/20 hover:text-white/40 transition-colors p-1"
          title="Collapse feature tree"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      {/* Project header */}
      <button
        onClick={() => onSelect({ type: "project" })}
        className={`w-full text-left px-3 py-2 rounded-lg mb-3 transition-colors ${
          selection.type === "project"
            ? "bg-white/[0.06] border border-white/[0.1]"
            : "hover:bg-white/[0.03] border border-transparent"
        }`}
      >
        <div className="flex items-center justify-between">
          {onRenameProject ? (
            <EditableText
              value={project.name}
              onSave={onRenameProject}
              className="text-sm font-semibold text-white/90"
              inputClassName="text-sm font-semibold text-white/90"
            />
          ) : (
            <span className="text-sm font-semibold text-white/90">{project.name}</span>
          )}
          {project.deployUrl && (
            <a
              href={project.deployUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[0.65rem] font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded-md transition-colors"
            >
              Preview
            </a>
          )}
        </div>
      </button>

      {/* Team section */}
      <div className="mb-4">
        <button
          onClick={() => { setTeamOpen(!teamOpen); }}
          className="flex items-center justify-between w-full mb-2"
        >
          <div className="text-[0.6rem] uppercase tracking-widest text-white/30 flex items-center gap-2">
            Team
            {teamMembers.length > 0 && (
              <span className="text-[0.55rem] bg-white/[0.08] text-white/40 px-1.5 py-0.5 rounded-full">
                {teamMembers.length}
              </span>
            )}
          </div>
          <span className="text-white/20 text-[0.6rem]">{teamOpen ? "-" : "+"}</span>
        </button>

        {teamOpen && (
          <div className="space-y-1">
            {teamMembers.map((m) => {
              const email = m.user?.email || m.invitedEmail || "";
              const name = m.user?.name || null;
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between px-2 py-1.5 rounded-md text-xs text-white/40 hover:bg-white/[0.04] group/member"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{name || email}</span>
                    {isAdmin ? (
                      <select
                        value={m.role || "member"}
                        onChange={(e) => handleRoleChange(m, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[0.5rem] px-1 py-0 rounded bg-white/[0.04] border border-white/[0.08] text-white/50 focus:outline-none focus:border-white/20 cursor-pointer shrink-0"
                      >
                        <option value="member" className="bg-[#0c1120]">member</option>
                        <option value="admin" className="bg-[#0c1120]">admin</option>
                      </select>
                    ) : m.role === "admin" ? (
                      <span className="text-[0.5rem] px-1 py-0 rounded shrink-0 bg-amber-500/15 text-amber-400">
                        admin
                      </span>
                    ) : null}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleRemoveFromProject(m)}
                      className="opacity-0 group-hover/member:opacity-100 text-white/20 hover:text-red-400 transition-all p-0.5 shrink-0"
                      title="Remove from project"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
            {teamMembers.length === 0 && !addingMember && (
              <p className="text-[0.6rem] text-white/20 px-2 py-1">No members yet</p>
            )}

            {isAdmin && (addingMember ? (
              <form onSubmit={handleQuickAdd} className="px-1 mt-1 space-y-1">
                <div className="flex gap-1">
                  <input
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    placeholder="email"
                    type="email"
                    autoFocus
                    className="flex-1 min-w-0 bg-transparent border border-white/10 rounded px-1.5 py-1 text-[0.65rem] text-white placeholder:text-white/20 focus:outline-none focus:border-white/20"
                  />
                  <select
                    value={addRole}
                    onChange={(e) => setAddRole(e.target.value)}
                    className="bg-transparent border border-white/10 rounded px-1 py-1 text-[0.6rem] text-white/50 focus:outline-none focus:border-white/20"
                  >
                    <option value="member" className="bg-[#0c1120]">member</option>
                    <option value="admin" className="bg-[#0c1120]">admin</option>
                  </select>
                </div>
                <div className="flex gap-1">
                  <button
                    type="submit"
                    disabled={addLoading}
                    className="text-[0.6rem] px-1.5 py-1 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors shrink-0"
                  >
                    {addLoading ? "..." : "+"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAddingMember(false); setAddEmail(""); setAddRole("member"); }}
                    className="text-[0.6rem] px-1 py-1 text-white/20 hover:text-white/40 transition-colors shrink-0"
                  >
                    x
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setAddingMember(true)}
                className="text-[0.6rem] text-white/20 hover:text-white/40 transition-colors px-2 py-1"
              >
                + Add member
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Feature tree */}
      <button
        onClick={() => setFeaturesOpen(!featuresOpen)}
        className="flex items-center justify-between w-full mb-2"
      >
        <div className="text-[0.6rem] uppercase tracking-widest text-white/30 flex items-center gap-2">
          Features
          {project.features.length > 0 && (
            <span className="text-[0.55rem] bg-white/[0.08] text-white/40 px-1.5 py-0.5 rounded-full">
              {project.features.length}
            </span>
          )}
        </div>
        <span className="text-white/20 text-[0.6rem]">{featuresOpen ? "-" : "+"}</span>
      </button>

      {featuresOpen && (
        <div className="space-y-0.5 mb-4">
          {project.features.map((f) => (
            <TreeNode
              key={f.id}
              feature={f}
              depth={0}
              selectedId={selection.type === "feature" ? selection.id : null}
              onSelect={(id) => onSelect({ type: "feature", id })}
              onToggle={onToggle}
              onAddFeature={onAddFeature}
            />
          ))}
          <button
            onClick={() => onAddFeature(null)}
            className="text-[0.6rem] text-white/20 hover:text-white/40 transition-colors px-2 py-1"
          >
            + Add feature
          </button>
        </div>
      )}

      {/* Meetings section */}
      <div className="mt-auto pt-4 border-t border-white/[0.06]">
        <button
          onClick={() => setMeetingsOpen(!meetingsOpen)}
          className="flex items-center justify-between w-full mb-2"
        >
          <div className="text-[0.6rem] uppercase tracking-widest text-white/30 flex items-center gap-2">
            Meetings
            {pendingSuggestions > 0 && (
              <span className="text-[0.55rem] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full">
                {pendingSuggestions}
              </span>
            )}
          </div>
          <span className="text-white/20 text-[0.6rem]">{meetingsOpen ? "-" : "+"}</span>
        </button>

        {meetingsOpen && (
          <div className="space-y-1">
            {project.meetings.map((m) => {
              const date = new Date(m.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              });
              const pending = m.suggestions.filter((s) => s.status === "pending").length;

              return (
                <button
                  key={m.id}
                  onClick={() => onSelect({ type: "meeting", id: m.id })}
                  className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors ${
                    selection.type === "meeting" && selection.id === m.id
                      ? "bg-blue-500/15 text-blue-300"
                      : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex justify-between">
                    <span>{date}</span>
                    <span className={`text-[0.55rem] ${
                      m.status === "ready" ? "text-green-400" : "text-yellow-400"
                    }`}>
                      {m.status}
                    </span>
                  </div>
                  {pending > 0 && (
                    <span className="text-[0.55rem] text-blue-400">{pending} suggestions</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Cost Center */}
      <div className="pt-3 border-t border-white/[0.06]">
        <button
          onClick={() => onSelect({ type: "cost-center" })}
          className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs transition-colors ${
            selection.type === "cost-center"
              ? "bg-blue-500/15 text-blue-300 border border-blue-500/20"
              : "text-white/30 hover:text-white/50 hover:bg-white/[0.04]"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          Cost Center
        </button>
      </div>
    </div>
  );
}

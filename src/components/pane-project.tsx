"use client";

import { useState, useEffect, useCallback } from "react";
import { EditableText } from "./editable-text";

type VisibleMember = {
  id: string;
  name: string | null;
  email: string;
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
};

export function PaneProject({ project, onUpdate, onOpenPreview }: Props) {
  const [visibleMembers, setVisibleMembers] = useState<VisibleMember[]>([]);

  const loadVisibleMembers = useCallback(async () => {
    if (!project.clientId) return;
    const res = await fetch(`/api/clients/${project.clientId}/members`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data: { id: string; name: string | null; email: string; projectIds: string[] }[] =
      await res.json();
    const filtered = data
      .filter((m) => m.projectIds.includes(project.id))
      .map((m) => ({ id: m.id, name: m.name, email: m.email }));
    setVisibleMembers(filtered);
  }, [project.clientId, project.id]);

  useEffect(() => {
    loadVisibleMembers();
  }, [loadVisibleMembers]);

  async function handleRename(name: string) {
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    onUpdate();
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

      {/* Visible to */}
      <div className="mb-6">
        <h3 className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-1">Visible to</h3>
        <p className="text-[0.6rem] text-white/20 mb-3">Manage access through client settings</p>
        <div className="space-y-2">
          {visibleMembers.length === 0 ? (
            <p className="text-xs text-white/20 px-1">No one has been granted access yet</p>
          ) : (
            visibleMembers.map((m) => (
              <div
                key={m.id}
                className="flex items-center px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08]"
              >
                <div>
                  <div className="text-sm text-white/80">{m.name || m.email}</div>
                  {m.name && (
                    <div className="text-[0.6rem] text-white/30">{m.email}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

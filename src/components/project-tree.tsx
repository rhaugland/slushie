"use client";

import { useState } from "react";
import { TreeNode } from "./tree-node";

type Feature = {
  id: string;
  title: string;
  enabled: boolean;
  status: string;
  parentId: string | null;
  children: Feature[];
  builds: { id: string; status: string }[];
};

type Project = {
  id: string;
  name: string;
  clientId: string;
  deployUrl: string | null;
  deployStatus: string;
  features: Feature[];
  meetings: any[];
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

export function ProjectTree({ project, selection, onSelect, onToggle, onAddFeature, onCollapse }: Props) {
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState(project.name);

  return (
    <div className="w-64 border-r border-white/[0.06] bg-[#0c1120] p-3 flex flex-col overflow-y-auto">
      {/* Collapse button */}
      <div className="flex justify-end mb-1">
        <button
          onClick={onCollapse}
          className="text-white/20 hover:text-white/40 transition-colors p-1"
          title="Collapse"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      {/* Project header */}
      <button
        onClick={() => onSelect({ type: "project" })}
        className={`w-full text-left px-3 py-2 rounded-lg mb-4 transition-colors ${
          selection.type === "project"
            ? "bg-white/[0.06] border border-white/[0.1]"
            : "hover:bg-white/[0.03] border border-transparent"
        }`}
      >
        <span className="text-sm font-semibold text-white/90">{project.name}</span>
        {project.deployStatus === "running" && (
          <span className="ml-2 text-[0.55rem] text-green-400 font-medium">Live</span>
        )}
      </button>

      {/* Feature tree */}
      <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-2 px-1 flex items-center justify-between">
        <span>Features</span>
        {project.features.length > 0 && (
          <span className="text-[0.55rem] bg-white/[0.08] text-white/40 px-1.5 py-0.5 rounded-full">
            {project.features.length}
          </span>
        )}
      </div>

      <div className="space-y-0.5 flex-1">
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
          className="text-[0.6rem] text-white/20 hover:text-white/40 transition-colors px-2 py-1.5"
        >
          + Add feature
        </button>
      </div>
    </div>
  );
}

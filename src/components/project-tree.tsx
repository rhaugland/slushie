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

type Meeting = {
  id: string;
  status: string;
  createdAt: string;
  suggestions: { id: string; status: string }[];
};

type Project = {
  id: string;
  name: string;
  deployUrl: string | null;
  deployStatus: string;
  features: Feature[];
  meetings: Meeting[];
};

type Selection =
  | { type: "project" }
  | { type: "feature"; id: string }
  | { type: "meeting"; id: string };

type Props = {
  project: Project;
  selection: Selection;
  onSelect: (sel: Selection) => void;
  onToggle: (featureId: string, enabled: boolean) => void;
  onAddFeature: (parentId: string | null) => void;
  onCollapse: () => void;
};

export function ProjectTree({ project, selection, onSelect, onToggle, onAddFeature, onCollapse }: Props) {
  const [meetingsOpen, setMeetingsOpen] = useState(false);

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
          <span className="text-sm font-semibold text-white/90">{project.name}</span>
          {project.deployUrl && (
            <a
              href={project.deployUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[0.6rem] text-blue-400 hover:text-blue-300"
            >
              Preview
            </a>
          )}
        </div>
        <div className={`text-[0.55rem] mt-0.5 ${
          project.deployStatus === "running" ? "text-green-400" : "text-white/30"
        }`}>
          {project.deployStatus}
        </div>
      </button>

      {/* Feature tree */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-[0.6rem] uppercase tracking-widest text-white/30">Features</div>
        <button
          onClick={() => onAddFeature(null)}
          className="text-[0.6rem] text-white/20 hover:text-white/40 transition-colors"
        >
          +
        </button>
      </div>

      <div className="space-y-0.5 mb-4">
        {project.features.map((f) => (
          <TreeNode
            key={f.id}
            feature={f}
            depth={0}
            selectedId={selection.type === "feature" ? selection.id : null}
            onSelect={(id) => onSelect({ type: "feature", id })}
            onToggle={onToggle}
          />
        ))}
        {project.features.length === 0 && (
          <p className="text-[0.65rem] text-white/20 px-2 py-4 text-center">
            No features yet. Add one above or upload a meeting.
          </p>
        )}
      </div>

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
    </div>
  );
}

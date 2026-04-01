"use client";

import { useState } from "react";

type Feature = {
  id: string;
  title: string;
  enabled: boolean;
  status: string;
  parentId: string | null;
  children: Feature[];
  builds: { id: string; status: string }[];
};

type Props = {
  feature: Feature;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
};

const STATUS_DOT: Record<string, string> = {
  draft: "bg-white/20",
  building: "bg-yellow-400 animate-pulse",
  live: "bg-green-400",
  error: "bg-red-400",
};

export function TreeNode({ feature, depth, selectedId, onSelect, onToggle }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = feature.children.length > 0;
  const isSelected = feature.id === selectedId;

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors group ${
          isSelected
            ? "bg-blue-500/15 border border-blue-500/20"
            : "hover:bg-white/[0.04] border border-transparent"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(feature.id)}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed(!collapsed);
            }}
            className="text-white/20 hover:text-white/40 text-[0.6rem] w-3"
          >
            {collapsed ? "+" : "-"}
          </button>
        )}
        {!hasChildren && <span className="w-3" />}

        <div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[feature.status] || STATUS_DOT.draft}`} />

        <span className={`flex-1 text-xs truncate ${
          feature.enabled ? "text-white/80" : "text-white/30 line-through"
        }`}>
          {feature.title}
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(feature.id, !feature.enabled);
          }}
          className={`w-7 h-4 rounded-full transition-colors flex-shrink-0 ${
            feature.enabled ? "bg-blue-500" : "bg-white/10"
          }`}
        >
          <div
            className={`w-3 h-3 rounded-full bg-white transition-transform ${
              feature.enabled ? "translate-x-3.5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {!collapsed && hasChildren && (
        <div>
          {feature.children.map((child) => (
            <TreeNode
              key={child.id}
              feature={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

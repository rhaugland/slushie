"use client";

import { useState } from "react";

type MinorFeature = { title: string; description: string };

type Section = {
  id: string;
  name: string;
  description: string;
  category: "base" | "feature";
  route?: string;
  files: string[];
  minorFeatures: MinorFeature[];
};

type Props = {
  sections: Section[];
  projectId: string;
  fileUrl: string;
  onComplete: () => void;
  onCancel: () => void;
};

export function CodebaseMapper({ sections: initial, projectId, fileUrl, onComplete, onCancel }: Props) {
  const [sections, setSections] = useState<Section[]>(initial);
  const [applying, setApplying] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function updateCategory(id: string, category: "base" | "feature") {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, category } : s))
    );
  }

  function removeMinor(sectionId: string, minorIndex: number) {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, minorFeatures: s.minorFeatures.filter((_, i) => i !== minorIndex) }
          : s
      )
    );
  }

  async function handleApply() {
    setApplying(true);
    try {
      await fetch(`/api/projects/${projectId}/apply-mapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections, fileUrl }),
      });
      onComplete();
    } finally {
      setApplying(false);
    }
  }

  const featureCount = sections.filter((s) => s.category === "feature").length;
  const minorCount = sections
    .filter((s) => s.category === "feature")
    .reduce((sum, s) => sum + s.minorFeatures.length, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-[#f1f5f9]">Codebase Analysis</h3>
          <p className="text-[0.65rem] text-white/40 mt-0.5">
            {sections.length} sections found · {featureCount} features · {minorCount} sub-features
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-md bg-white/[0.06] text-white/40 hover:text-white/60 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={applying || featureCount === 0}
            className="px-4 py-1.5 text-xs rounded-md bg-gradient-to-r from-red-500 to-blue-500 text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {applying ? "Creating..." : `Create ${featureCount} Features`}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {sections.map((section) => {
          const isExpanded = expandedId === section.id;

          return (
            <div
              key={section.id}
              className={`rounded-lg border transition-colors ${
                section.category === "base"
                  ? "border-white/[0.06] bg-white/[0.02]"
                  : "border-blue-500/20 bg-blue-500/[0.03]"
              }`}
            >
              {/* Section header */}
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : section.id)}
                  className="text-white/20 hover:text-white/40 text-xs w-4"
                >
                  {isExpanded ? "-" : "+"}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white/80 font-medium truncate">
                    {section.name}
                  </div>
                  <div className="text-[0.6rem] text-white/30 truncate">
                    {section.description}
                  </div>
                </div>

                {section.category === "feature" && section.minorFeatures.length > 0 && (
                  <span className="text-[0.55rem] text-white/30 whitespace-nowrap">
                    {section.minorFeatures.length} sub
                  </span>
                )}

                <select
                  value={section.category}
                  onChange={(e) => updateCategory(section.id, e.target.value as "base" | "feature")}
                  className="bg-white/[0.06] border border-white/[0.1] rounded px-2 py-1 text-xs text-white/70 focus:outline-none focus:border-white/20 cursor-pointer"
                >
                  <option value="base">Base</option>
                  <option value="feature">Major Feature</option>
                </select>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-4 pb-3 border-t border-white/[0.04]">
                  {/* Files */}
                  {section.files.length > 0 && (
                    <div className="mt-2 mb-3">
                      <div className="text-[0.55rem] uppercase tracking-widest text-white/20 mb-1">
                        Files
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {section.files.map((f) => (
                          <span
                            key={f}
                            className="text-[0.6rem] text-white/30 bg-white/[0.04] px-1.5 py-0.5 rounded"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Minor features */}
                  {section.category === "feature" && section.minorFeatures.length > 0 && (
                    <div className="mt-2">
                      <div className="text-[0.55rem] uppercase tracking-widest text-white/20 mb-1.5">
                        Build Instructions
                      </div>
                      <div className="space-y-1">
                        {section.minorFeatures.map((minor, i) => (
                          <div
                            key={i}
                            className="flex items-start justify-between gap-2 px-2 py-1.5 rounded bg-white/[0.03] border border-white/[0.06]"
                          >
                            <div className="min-w-0">
                              <div className="text-xs text-white/60">{minor.title}</div>
                              <div className="text-[0.6rem] text-white/25">{minor.description}</div>
                            </div>
                            <button
                              onClick={() => removeMinor(section.id, i)}
                              className="text-white/15 hover:text-red-400 transition-colors text-xs flex-shrink-0 mt-0.5"
                              title="Remove"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

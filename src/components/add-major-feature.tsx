"use client";

import { useState } from "react";

type SuggestedMinor = {
  title: string;
  description: string;
  route: string;
};

type Props = {
  projectId: string;
  projectName: string;
  onCreated: () => void;
  onCancel: () => void;
};

export function AddMajorFeature({ projectId, projectName, onCreated, onCancel }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedMinor[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function handleSuggest() {
    if (!title.trim() || !description.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/features/suggest-minors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, projectName, projectId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to get suggestions");
        return;
      }
      setSuggestions(data.suggestions);
      setSelected(new Set(data.suggestions.map((_: any, i: number) => i)));
    } catch {
      setError("Failed to get suggestions");
    } finally {
      setLoading(false);
    }
  }

  function toggleSuggestion(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function handleApprove() {
    if (!suggestions) return;
    setCreating(true);
    setError("");
    try {
      // Create the major feature
      const majorRes = await fetch(`/api/projects/${projectId}/features`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      const majorFeature = await majorRes.json();
      if (!majorRes.ok) {
        setError(majorFeature.error || "Failed to create feature");
        return;
      }

      // Create selected minor features under it and collect IDs
      const selectedMinors = suggestions.filter((_, i) => selected.has(i));
      const createdIds: string[] = [];
      for (const minor of selectedMinors) {
        const minorRes = await fetch(`/api/projects/${projectId}/features`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: minor.title,
            description: minor.description,
            parentId: majorFeature.id,
            route: minor.route,
          }),
        });
        if (minorRes.ok) {
          const minorFeature = await minorRes.json();
          createdIds.push(minorFeature.id);
        }
      }

      // Trigger Claude Code builds for each minor feature (sequentially via Inngest)
      // Each build is queued as an async job, so they'll run one at a time via Inngest's concurrency
      for (const childId of createdIds) {
        await fetch(`/api/features/${childId}/build-og`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: "" }),
        });
      }

      onCreated();
    } catch {
      setError("Failed to create features");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white/90">New Major Feature</h2>
        <button
          onClick={onCancel}
          className="text-xs text-white/30 hover:text-white/50 transition-colors"
        >
          Cancel
        </button>
      </div>

      {!suggestions ? (
        <>
          <div>
            <label className="block text-[0.65rem] uppercase tracking-widest text-white/30 mb-1.5">
              Feature Name
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. User Dashboard"
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20"
            />
          </div>

          <div>
            <label className="block text-[0.65rem] uppercase tracking-widest text-white/30 mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this section of the app should do..."
              rows={4}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <button
            onClick={handleSuggest}
            disabled={loading || !title.trim() || !description.trim()}
            className="w-full py-2.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating features...
              </span>
            ) : (
              "Generate Minor Features"
            )}
          </button>
        </>
      ) : (
        <>
          <div className="bg-white/[0.03] rounded-lg border border-white/[0.08] p-3">
            <div className="text-xs text-white/60 font-medium mb-1">{title}</div>
            <div className="text-[0.65rem] text-white/30">{description}</div>
          </div>

          <div>
            <div className="text-[0.65rem] uppercase tracking-widest text-white/30 mb-2">
              Suggested Minor Features
            </div>
            <div className="space-y-1.5">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => toggleSuggestion(i)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    selected.has(i)
                      ? "bg-white/[0.06] border-white/[0.12]"
                      : "bg-transparent border-white/[0.04] opacity-40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-4 h-4 rounded border flex items-center justify-center text-[0.6rem] shrink-0 ${
                      selected.has(i)
                        ? "border-red-500 bg-red-500 text-white"
                        : "border-white/20"
                    }`}>
                      {selected.has(i) && "✓"}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs text-white/70">{s.title}</div>
                      <div className="text-[0.6rem] text-white/30 truncate">{s.description}</div>
                      <div className="text-[0.55rem] text-white/20 font-mono">{s.route}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => { setSuggestions(null); setSelected(new Set()); }}
              className="px-4 py-2 rounded-lg text-xs text-white/30 hover:text-white/50 border border-white/[0.08] transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleApprove}
              disabled={creating || selected.size === 0}
              className="flex-1 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating & building...
                </span>
              ) : (
                `Approve & Build (${selected.size} features)`
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

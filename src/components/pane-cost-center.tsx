"use client";

import { useState, useEffect, useCallback } from "react";

type CostEntry = {
  id: string;
  action: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  featureId: string | null;
  createdAt: string;
};

type Summary = {
  totalCostCents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCalls: number;
  byAction: Record<string, { count: number; costCents: number; inputTokens: number; outputTokens: number }>;
  byDay: Record<string, number>;
};

type Props = {
  projectId: string;
  projectName: string;
};

const ACTION_LABELS: Record<string, string> = {
  build: "Feature Build",
  feedback_analysis: "Feedback Analysis",
  suggestion_extraction: "Suggestion Extraction",
  classification: "Wishlist Classification",
  transcription: "Note Transcription",
  demo_generation: "Demo Sample Generation",
  codebase_analysis: "Codebase Analysis",
  suggest_minors: "Minor Feature Suggestions",
};

const ACTION_COLORS: Record<string, string> = {
  build: "text-blue-400 bg-blue-500/10",
  feedback_analysis: "text-purple-400 bg-purple-500/10",
  suggestion_extraction: "text-green-400 bg-green-500/10",
  classification: "text-yellow-400 bg-yellow-500/10",
  transcription: "text-cyan-400 bg-cyan-500/10",
  demo_generation: "text-pink-400 bg-pink-500/10",
  codebase_analysis: "text-orange-400 bg-orange-500/10",
  suggest_minors: "text-indigo-400 bg-indigo-500/10",
};

function formatCost(cents: number): string {
  if (cents < 1) return `${(cents * 10).toFixed(1)}¢`;
  if (cents < 100) return `${cents.toFixed(1)}¢`;
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function PaneCostCenter({ projectId, projectName }: Props) {
  const [entries, setEntries] = useState<CostEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadCosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/costs`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries);
        setSummary(data.summary);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadCosts();
  }, [loadCosts]);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-[#f1f5f9] mb-6">Cost Center</h1>
        <p className="text-sm text-white/30">Loading...</p>
      </div>
    );
  }

  const actionEntries = summary ? Object.entries(summary.byAction).sort((a, b) => b[1].costCents - a[1].costCents) : [];
  const dayEntries = summary ? Object.entries(summary.byDay).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14) : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#f1f5f9]">Cost Center</h1>
          <p className="text-xs text-white/30 mt-1">{projectName}</p>
        </div>
        <button
          onClick={loadCosts}
          className="px-3 py-1.5 text-xs rounded-lg bg-white/[0.08] text-white/60 hover:text-white/80 hover:bg-white/[0.12] transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-1">Total Cost</div>
            <div className="text-2xl font-bold text-white">{formatCost(summary.totalCostCents)}</div>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-1">API Calls</div>
            <div className="text-2xl font-bold text-white">{summary.totalCalls}</div>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-1">Input Tokens</div>
            <div className="text-2xl font-bold text-white">{formatTokens(summary.totalInputTokens)}</div>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-1">Output Tokens</div>
            <div className="text-2xl font-bold text-white">{formatTokens(summary.totalOutputTokens)}</div>
          </div>
        </div>
      )}

      {/* Cost by action type */}
      {actionEntries.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-white/50 mb-3">Cost by Action</h2>
          <div className="space-y-2">
            {actionEntries.map(([action, data]) => {
              const pct = summary ? (data.costCents / summary.totalCostCents) * 100 : 0;
              return (
                <div key={action} className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[0.6rem] px-1.5 py-0.5 rounded-full font-medium ${ACTION_COLORS[action] || "text-white/40 bg-white/[0.06]"}`}>
                        {ACTION_LABELS[action] || action}
                      </span>
                      <span className="text-xs text-white/30">{data.count} calls</span>
                    </div>
                    <span className="text-sm font-medium text-white">{formatCost(data.costCents)}</span>
                  </div>
                  <div className="w-full bg-white/[0.06] rounded-full h-1.5">
                    <div
                      className="bg-gradient-to-r from-red-500 to-blue-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5 text-[0.6rem] text-white/20">
                    <span>{formatTokens(data.inputTokens)} in / {formatTokens(data.outputTokens)} out</span>
                    <span>{pct.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Daily cost */}
      {dayEntries.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-white/50 mb-3">Daily Cost (Last 14 Days)</h2>
          <div className="space-y-1">
            {dayEntries.map(([day, costCents]) => {
              const maxCost = Math.max(...dayEntries.map(([, c]) => c));
              const pct = maxCost > 0 ? (costCents / maxCost) * 100 : 0;
              return (
                <div key={day} className="flex items-center gap-3">
                  <span className="text-xs text-white/30 w-20 shrink-0">{day}</span>
                  <div className="flex-1 bg-white/[0.06] rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-red-500/60 to-blue-500/60 h-2 rounded-full"
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                  <span className="text-xs text-white/50 w-16 text-right shrink-0">{formatCost(costCents)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent entries */}
      <div>
        <h2 className="text-sm font-medium text-white/50 mb-3">Recent API Calls</h2>
        {entries.length === 0 ? (
          <p className="text-sm text-white/30">No API costs tracked yet. Costs will appear as you use AI features.</p>
        ) : (
          <div className="space-y-1">
            {entries.slice(0, 50).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-3">
                  <span className={`text-[0.55rem] px-1.5 py-0.5 rounded-full font-medium ${ACTION_COLORS[entry.action] || "text-white/40 bg-white/[0.06]"}`}>
                    {ACTION_LABELS[entry.action] || entry.action}
                  </span>
                  <span className="text-xs text-white/20">
                    {formatTokens(entry.inputTokens)} in / {formatTokens(entry.outputTokens)} out
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-white/50">{formatCost(entry.costCents)}</span>
                  <span className="text-[0.6rem] text-white/20">
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

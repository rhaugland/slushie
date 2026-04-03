"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

type ActivityEntry = {
  id: string;
  action: string;
  category: string;
  description: string;
  userName: string | null;
  projectId: string | null;
  metadata: any;
  createdAt: string;
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  build: { bg: "bg-yellow-500/10", text: "text-yellow-400", label: "Build" },
  feature: { bg: "bg-blue-500/10", text: "text-blue-400", label: "Feature" },
  team: { bg: "bg-purple-500/10", text: "text-purple-400", label: "Team" },
  variant: { bg: "bg-cyan-500/10", text: "text-cyan-400", label: "Variant" },
  general: { bg: "bg-white/[0.06]", text: "text-white/50", label: "General" },
};

const ACTION_ICONS: Record<string, string> = {
  build_started: "hammer",
  build_completed: "check",
  build_failed: "x",
  feature_created: "plus",
  feature_deleted: "trash",
  feature_toggled_on: "toggle-right",
  feature_toggled_off: "toggle-left",
  variant_created: "copy",
  variant_deleted: "trash",
  variant_promoted: "star",
  member_added: "user-plus",
  member_invited: "mail",
  role_changed: "shield",
};

function ActionIcon({ action }: { action: string }) {
  const type = ACTION_ICONS[action] || "activity";

  if (type === "check") return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
  if (type === "x") return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
  if (type === "plus") return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
  if (type === "trash") return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
  if (type === "user-plus" || type === "mail") return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  );
  if (type === "shield") return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
  if (type === "star") return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
  // Default: hammer / activity
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function ChangelogPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [hasDummy, setHasDummy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (filter !== "all") params.set("category", filter);
    const res = await fetch(`/api/activity?${params}`, { cache: "no-store" });
    if (!res.ok) {
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      setLoading(false);
      return;
    }
    const data = await res.json();
    setLogs(data.logs);
    setTotal(data.total);
    setTotalPages(data.totalPages);
    setHasDummy(data.logs.some((l: ActivityEntry) => l.metadata?.isDummy));
    setLoading(false);
  }, [page, filter, router]);

  useEffect(() => {
    load();
  }, [load]);

  // Group logs by date
  const grouped: { date: string; entries: ActivityEntry[] }[] = [];
  let currentDate = "";
  for (const log of logs) {
    const dateLabel = formatDate(log.createdAt);
    if (dateLabel !== currentDate) {
      currentDate = dateLabel;
      grouped.push({ date: dateLabel, entries: [] });
    }
    grouped[grouped.length - 1].entries.push(log);
  }

  const filters = [
    { value: "all", label: "All" },
    { value: "build", label: "Builds" },
    { value: "feature", label: "Features" },
    { value: "variant", label: "Variants" },
    { value: "team", label: "Team" },
  ];

  return (
    <div className="min-h-screen bg-[#080d19]">
      {/* Header */}
      <div className="border-b border-white/[0.06] bg-[#0a0f1a]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/")}
              className="text-white/30 hover:text-white/60 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-semibold text-white">Changelog</h1>
              <p className="text-xs text-white/30">{total} activit{total === 1 ? "y" : "ies"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasDummy && (
              <button
                onClick={async () => {
                  await fetch("/api/activity/seed?action=clear-dummy", { method: "POST" });
                  setPage(1);
                  load();
                }}
                className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
              >
                Remove demo data
              </button>
            )}
            {total === 0 && (
              <button
                onClick={async () => {
                  await fetch("/api/activity/seed", { method: "POST" });
                  setPage(1);
                  load();
                }}
                className="px-3 py-1.5 text-xs rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
              >
                Load demo data
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-4xl mx-auto px-6 py-4">
        <div className="flex gap-1.5">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => { setFilter(f.value); setPage(1); }}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                filter === f.value
                  ? "bg-white/[0.1] text-white"
                  : "text-white/30 hover:text-white/50 hover:bg-white/[0.04]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Log entries */}
      <div className="max-w-4xl mx-auto px-6 pb-12">
        {loading && logs.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-5 h-5 border-2 border-white/10 border-t-white/40 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-white/30">Loading...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-white/30">No activity yet</p>
            <p className="text-xs text-white/20 mt-1">Actions like builds, feature changes, and team updates will appear here</p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map((group) => (
              <div key={group.date}>
                <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-3 sticky top-0 bg-[#080d19] py-1">
                  {group.date}
                </div>
                <div className="space-y-1">
                  {group.entries.map((log) => {
                    const cat = CATEGORY_COLORS[log.category] || CATEGORY_COLORS.general;
                    return (
                      <div
                        key={log.id}
                        className="flex items-start gap-3 px-4 py-3 rounded-lg border border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.03] transition-colors"
                      >
                        {/* Icon */}
                        <div className={`p-1.5 rounded-md ${cat.bg} ${cat.text} shrink-0 mt-0.5`}>
                          <ActionIcon action={log.action} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white/70">{log.description}</p>
                          <div className="flex items-center gap-3 mt-1">
                            {log.userName && (
                              <span className="text-[0.6rem] text-white/30">{log.userName}</span>
                            )}
                            <span className="text-[0.6rem] text-white/20">{formatTime(log.createdAt)}</span>
                            <span className={`text-[0.55rem] px-1.5 py-0.5 rounded ${cat.bg} ${cat.text}`}>
                              {cat.label}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-xs rounded-lg text-white/30 hover:text-white/50 disabled:opacity-30 transition-colors"
            >
              Previous
            </button>
            <span className="text-xs text-white/30">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-xs rounded-lg text-white/30 hover:text-white/50 disabled:opacity-30 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";

type TimeRange = "7" | "30" | "all";

type ReportData = {
  project: { name: string; client: string; deployStatus: string };
  features: { title: string; status: string; parentId: string | null; createdAt: string }[];
  meetings: { type: string; summary: string | null; status: string; createdByName: string | null; createdAt: string }[];
  feedback: { title: string; priority: string | null; status: string; source: string; createdAt: string }[];
  costs: { totalCents: number; byAction: Record<string, number> };
  activities: { action: string; description: string; category: string; createdAt: string }[];
  period: { start: string | null; end: string };
};

type Props = {
  projectId: string;
  projectName: string;
};

const ACTION_LABELS: Record<string, string> = {
  build: "Feature Build",
  feedback_analysis: "Feedback Analysis",
  suggestion_extraction: "Suggestion Extraction",
  classification: "Classification",
  transcription: "Transcription",
  demo_generation: "Demo Generation",
  codebase_analysis: "Codebase Analysis",
  suggest_minors: "Minor Suggestions",
};

const STATUS_COLORS: Record<string, string> = {
  live: "text-green-400",
  building: "text-blue-400",
  draft: "text-white/40",
  error: "text-red-400",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-400",
  medium: "text-yellow-400",
  low: "text-white/40",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatMeetingType(type: string): string {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function generateMarkdown(data: ReportData, range: TimeRange): string {
  const rangeLabel =
    range === "7" ? "Last 7 Days" : range === "30" ? "Last 30 Days" : "All Time";
  const periodStart = data.period.start ? formatDate(data.period.start) : "Project start";
  const periodEnd = formatDate(data.period.end);

  let md = `# ${data.project.name} - Project Report\n\n`;
  md += `**Client:** ${data.project.client}  \n`;
  md += `**Period:** ${periodStart} - ${periodEnd} (${rangeLabel})  \n`;
  md += `**Deploy Status:** ${data.project.deployStatus}  \n`;
  md += `**Total Features:** ${data.features.length}  \n\n`;

  // Features
  md += `## Features Built (${data.features.length})\n\n`;
  if (data.features.length > 0) {
    const majors = data.features.filter((f) => !f.parentId);
    const minors = data.features.filter((f) => f.parentId);
    if (majors.length > 0) {
      for (const f of majors) {
        md += `- **${f.title}** - ${f.status} (${formatDate(f.createdAt)})\n`;
      }
    }
    if (minors.length > 0) {
      md += `\n*Sub-features:*\n`;
      for (const f of minors) {
        md += `  - ${f.title} - ${f.status} (${formatDate(f.createdAt)})\n`;
      }
    }
  } else {
    md += `_No features in this period._\n`;
  }

  // Meetings
  md += `\n## Meetings & Notes (${data.meetings.length})\n\n`;
  if (data.meetings.length > 0) {
    for (const m of data.meetings) {
      const summary = m.summary ? `: ${m.summary.slice(0, 120)}${m.summary.length > 120 ? "..." : ""}` : "";
      md += `- **${formatMeetingType(m.type)}** (${formatDate(m.createdAt)})${summary}\n`;
    }
  } else {
    md += `_No meetings in this period._\n`;
  }

  // Feedback
  md += `\n## Feedback Received (${data.feedback.length})\n\n`;
  if (data.feedback.length > 0) {
    for (const f of data.feedback) {
      const priority = f.priority ? ` [${f.priority.toUpperCase()}]` : "";
      md += `- ${f.title}${priority} - ${f.status} (${formatDate(f.createdAt)})\n`;
    }
  } else {
    md += `_No feedback in this period._\n`;
  }

  // Costs
  md += `\n## AI Costs\n\n`;
  md += `**Total Spend:** ${formatCents(data.costs.totalCents)}\n\n`;
  if (Object.keys(data.costs.byAction).length > 0) {
    md += `| Action | Cost |\n|--------|------|\n`;
    for (const [action, cents] of Object.entries(data.costs.byAction)) {
      md += `| ${ACTION_LABELS[action] || action} | ${formatCents(cents)} |\n`;
    }
  }

  // Activity
  md += `\n## Recent Activity (${data.activities.length})\n\n`;
  if (data.activities.length > 0) {
    for (const a of data.activities.slice(0, 20)) {
      md += `- ${a.description} (${formatDate(a.createdAt)})\n`;
    }
    if (data.activities.length > 20) {
      md += `\n_...and ${data.activities.length - 20} more activities._\n`;
    }
  } else {
    md += `_No activity in this period._\n`;
  }

  md += `\n---\n_Generated ${formatDate(new Date().toISOString())}_\n`;

  return md;
}

export function PaneReports({ projectId, projectName }: Props) {
  const [range, setRange] = useState<TimeRange>("30");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchReport = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/report?days=${range}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [projectId, range]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  function handleCopy() {
    if (!data) return;
    const md = generateMarkdown(data, range);
    navigator.clipboard.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDownload() {
    if (!data) return;
    const md = generateMarkdown(data, range);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = data.project.name.replace(/[^a-zA-Z0-9-_]/g, "_").toLowerCase();
    a.download = `${safeName}-report-${range === "all" ? "all-time" : range + "d"}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const ranges: { value: TimeRange; label: string }[] = [
    { value: "7", label: "Last 7 days" },
    { value: "30", label: "Last 30 days" },
    { value: "all", label: "All time" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {ranges.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                range === r.value
                  ? "bg-white/[0.1] text-white border border-white/[0.15]"
                  : "bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.06] hover:text-white/70"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            disabled={!data || loading}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-white/[0.03] border border-white/[0.06] text-white/60 hover:bg-white/[0.06] hover:text-white/80 transition-colors disabled:opacity-30"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
            </svg>
            {copied ? "Copied!" : "Copy as Markdown"}
          </button>
          <button
            onClick={handleDownload}
            disabled={!data || loading}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-white/[0.03] border border-white/[0.06] text-white/60 hover:bg-white/[0.06] hover:text-white/80 transition-colors disabled:opacity-30"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download .md
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        </div>
      )}

      {!loading && data && (
        <div className="space-y-6">
          {/* Overview */}
          <section className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-5">
            <h3 className="text-sm font-medium text-white/70 mb-3">Overview</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-white/30 mb-1">Client</div>
                <div className="text-sm text-white/80">{data.project.client}</div>
              </div>
              <div>
                <div className="text-xs text-white/30 mb-1">Period</div>
                <div className="text-sm text-white/80">
                  {data.period.start ? formatDate(data.period.start) : "All time"} &mdash; {formatDate(data.period.end)}
                </div>
              </div>
              <div>
                <div className="text-xs text-white/30 mb-1">Features</div>
                <div className="text-sm text-white/80">{data.features.length}</div>
              </div>
              <div>
                <div className="text-xs text-white/30 mb-1">Deploy Status</div>
                <div className={`text-sm capitalize ${
                  data.project.deployStatus === "running" ? "text-green-400" :
                  data.project.deployStatus === "starting" ? "text-yellow-400" :
                  data.project.deployStatus === "error" ? "text-red-400" :
                  "text-white/50"
                }`}>
                  {data.project.deployStatus}
                </div>
              </div>
            </div>
          </section>

          {/* Features */}
          <section className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-5">
            <h3 className="text-sm font-medium text-white/70 mb-3">
              Features Built
              <span className="text-white/30 ml-2">({data.features.length})</span>
            </h3>
            {data.features.length === 0 ? (
              <p className="text-sm text-white/30 italic">No features in this period.</p>
            ) : (
              <div className="space-y-1.5">
                {data.features.map((f, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between text-sm py-1.5 ${
                      f.parentId ? "pl-5 border-l border-white/[0.06] ml-2" : ""
                    }`}
                  >
                    <span className="text-white/70">{f.title}</span>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs capitalize ${STATUS_COLORS[f.status] || "text-white/40"}`}>
                        {f.status}
                      </span>
                      <span className="text-xs text-white/20">{formatDate(f.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Meetings */}
          <section className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-5">
            <h3 className="text-sm font-medium text-white/70 mb-3">
              Meetings & Notes
              <span className="text-white/30 ml-2">({data.meetings.length})</span>
            </h3>
            {data.meetings.length === 0 ? (
              <p className="text-sm text-white/30 italic">No meetings in this period.</p>
            ) : (
              <div className="space-y-2">
                {data.meetings.map((m, i) => (
                  <div key={i} className="text-sm py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-white/60 font-medium">{formatMeetingType(m.type)}</span>
                      {m.createdByName && (
                        <span className="text-xs text-white/20">by {m.createdByName}</span>
                      )}
                      <span className="text-xs text-white/20">{formatDate(m.createdAt)}</span>
                    </div>
                    {m.summary && (
                      <p className="text-xs text-white/40 mt-1 line-clamp-2">{m.summary}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Feedback */}
          <section className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-5">
            <h3 className="text-sm font-medium text-white/70 mb-3">
              Feedback Received
              <span className="text-white/30 ml-2">({data.feedback.length})</span>
            </h3>
            {data.feedback.length === 0 ? (
              <p className="text-sm text-white/30 italic">No feedback in this period.</p>
            ) : (
              <div className="space-y-1.5">
                {data.feedback.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1.5">
                    <span className="text-white/70 truncate mr-3">{f.title}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      {f.priority && (
                        <span className={`text-xs uppercase ${PRIORITY_COLORS[f.priority] || "text-white/40"}`}>
                          {f.priority}
                        </span>
                      )}
                      <span className="text-xs text-white/30 capitalize">{f.status}</span>
                      <span className="text-xs text-white/20">{formatDate(f.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* AI Costs */}
          <section className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-5">
            <h3 className="text-sm font-medium text-white/70 mb-3">AI Costs</h3>
            <div className="text-xl font-medium text-white/80 mb-3">
              {formatCents(data.costs.totalCents)}
            </div>
            {Object.keys(data.costs.byAction).length > 0 && (
              <div className="space-y-1.5">
                {Object.entries(data.costs.byAction)
                  .sort(([, a], [, b]) => b - a)
                  .map(([action, cents]) => (
                    <div key={action} className="flex items-center justify-between text-sm">
                      <span className="text-white/50">
                        {ACTION_LABELS[action] || action}
                      </span>
                      <span className="text-white/60">{formatCents(cents)}</span>
                    </div>
                  ))}
              </div>
            )}
          </section>

          {/* Activity Log */}
          <section className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-5">
            <h3 className="text-sm font-medium text-white/70 mb-3">
              Recent Activity
              <span className="text-white/30 ml-2">({data.activities.length})</span>
            </h3>
            {data.activities.length === 0 ? (
              <p className="text-sm text-white/30 italic">No activity in this period.</p>
            ) : (
              <div className="space-y-1.5">
                {data.activities.slice(0, 20).map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1">
                    <span className="text-white/50 truncate mr-3">{a.description}</span>
                    <span className="text-xs text-white/20 shrink-0">{formatDate(a.createdAt)}</span>
                  </div>
                ))}
                {data.activities.length > 20 && (
                  <p className="text-xs text-white/30 italic pt-1">
                    ...and {data.activities.length - 20} more activities
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

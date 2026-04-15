"use client";

import { useState, useEffect } from "react";

type Props = {
  workspaces: any[];
};

type ProjectSummary = {
  id: string;
  name: string;
  clientName: string;
  deployStatus: string;
  featureCount: number;
  draftCount: number;
  buildingCount: number;
  liveCount: number;
  lastActivityAt: string | null;
  stage: "scoping" | "building" | "review" | "live";
};

const STAGES = [
  { key: "scoping" as const, label: "Scoping", color: "text-white/40", dotColor: "bg-white/20" },
  { key: "building" as const, label: "Building", color: "text-amber-400/80", dotColor: "bg-amber-400/60" },
  { key: "review" as const, label: "Review", color: "text-blue-400/80", dotColor: "bg-blue-400/60" },
  { key: "live" as const, label: "Live", color: "text-emerald-400/80", dotColor: "bg-emerald-400/60" },
];

function determineStage(project: any): "scoping" | "building" | "review" | "live" {
  const features = project.features || [];
  const deployStatus = project.deployStatus || "stopped";

  // Live: project is running
  if (deployStatus === "running") return "live";

  // Review: has live features but project isn't running
  const hasLiveFeatures = features.some((f: any) => f.status === "live");
  if (hasLiveFeatures) return "review";

  // Building: has features being built
  const hasBuildingFeatures = features.some((f: any) => f.status === "building");
  if (hasBuildingFeatures) return "building";

  // Scoping: everything else (no features, or all draft)
  return "scoping";
}

function formatRelativeDate(dateStr: string | null): string {
  if (!dateStr) return "No activity";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

export function PaneStatus({ workspaces }: Props) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Derive projects from the workspace data already available
    const allProjects: ProjectSummary[] = [];

    for (const membership of workspaces) {
      const ws = membership.workspace;
      for (const client of ws.clients || []) {
        for (const project of client.projects || []) {
          const features = project.features || [];
          const draftCount = features.filter((f: any) => f.status === "draft").length;
          const buildingCount = features.filter((f: any) => f.status === "building").length;
          const liveCount = features.filter((f: any) => f.status === "live").length;

          allProjects.push({
            id: project.id,
            name: project.name,
            clientName: client.name,
            deployStatus: project.deployStatus || "stopped",
            featureCount: features.length,
            draftCount,
            buildingCount,
            liveCount,
            lastActivityAt: null, // Will be enriched by API
            stage: determineStage(project),
          });
        }
      }
    }

    setProjects(allProjects);
    setLoading(false);

    // Fetch enriched data from the status API
    fetch("/api/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: any[]) => {
        if (!Array.isArray(data)) return;
        setProjects((prev) =>
          prev.map((p) => {
            const enriched = data.find((d: any) => d.id === p.id);
            if (enriched) {
              return {
                ...p,
                lastActivityAt: enriched.lastActivityAt,
                featureCount: enriched.featureCount ?? p.featureCount,
                draftCount: enriched.draftCount ?? p.draftCount,
                buildingCount: enriched.buildingCount ?? p.buildingCount,
                liveCount: enriched.liveCount ?? p.liveCount,
              };
            }
            return p;
          })
        );
      })
      .catch(() => {});
  }, [workspaces]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-white/20">Loading...</div>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-white/30">No projects yet</div>
      </div>
    );
  }

  const grouped = STAGES.map((stage) => ({
    ...stage,
    projects: projects.filter((p) => p.stage === stage.key),
  }));

  return (
    <div className="max-w-full">
      {/* Pipeline columns */}
      <div className="grid grid-cols-4 gap-4 min-h-[400px]">
        {grouped.map((stage) => (
          <div key={stage.key} className="flex flex-col">
            {/* Column header */}
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className={`w-2 h-2 rounded-full ${stage.dotColor}`} />
              <span className={`text-xs font-medium uppercase tracking-wider ${stage.color}`}>
                {stage.label}
              </span>
              <span className="text-[0.6rem] text-white/15 ml-auto">
                {stage.projects.length}
              </span>
            </div>

            {/* Column body */}
            <div className="flex-1 space-y-2">
              {stage.projects.map((project) => (
                <div
                  key={project.id}
                  className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.1] transition-all"
                >
                  {/* Project name */}
                  <div className="text-sm font-medium text-white/75 leading-tight truncate">
                    {project.name}
                  </div>

                  {/* Client name */}
                  <div className="text-[0.65rem] text-white/25 mt-0.5 truncate">
                    {project.clientName}
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-3 mt-2">
                    {project.featureCount > 0 && (
                      <span className="text-[0.6rem] text-white/20">
                        {project.featureCount} feature{project.featureCount !== 1 ? "s" : ""}
                      </span>
                    )}
                    {project.featureCount === 0 && (
                      <span className="text-[0.6rem] text-white/15 italic">
                        No features
                      </span>
                    )}
                    <span className="text-[0.6rem] text-white/15 ml-auto">
                      {formatRelativeDate(project.lastActivityAt)}
                    </span>
                  </div>

                  {/* Feature status breakdown bar */}
                  {project.featureCount > 0 && (
                    <div className="flex gap-0.5 mt-2 h-1 rounded-full overflow-hidden bg-white/[0.04]">
                      {project.liveCount > 0 && (
                        <div
                          className="bg-emerald-400/50 rounded-full"
                          style={{ flex: project.liveCount }}
                        />
                      )}
                      {project.buildingCount > 0 && (
                        <div
                          className="bg-amber-400/50 rounded-full"
                          style={{ flex: project.buildingCount }}
                        />
                      )}
                      {project.draftCount > 0 && (
                        <div
                          className="bg-white/10 rounded-full"
                          style={{ flex: project.draftCount }}
                        />
                      )}
                    </div>
                  )}
                </div>
              ))}

              {stage.projects.length === 0 && (
                <div className="flex items-center justify-center py-8 rounded-lg border border-dashed border-white/[0.04]">
                  <span className="text-[0.6rem] text-white/10">None</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

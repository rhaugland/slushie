"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ProjectSidebar } from "@/components/project-sidebar";
import { ProjectTree } from "@/components/project-tree";
import { ContextPane } from "@/components/context-pane";
import { AddContext } from "@/components/add-context";

type Selection =
  | { type: "project" }
  | { type: "feature"; id: string }
  | { type: "meeting"; id: string }
  | { type: "workspace-settings"; workspaceId: string };

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({ type: "project" });
  const [project, setProject] = useState<any>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [middleCollapsed, setMiddleCollapsed] = useState(false);
  const [previewMode, setPreviewMode] = useState<"collapsed" | "half" | "full">("collapsed");

  const loadUser = useCallback(async () => {
    const res = await fetch("/api/auth/me");
    if (!res.ok) {
      router.push("/login");
      return;
    }
    const data = await res.json();
    setUser(data);
  }, [router]);

  const loadProjects = useCallback(async () => {
    const res = await fetch("/api/projects");
    if (!res.ok) return;
    const data = await res.json();
    setProjects(data);
  }, []);

  const loadProject = useCallback(async (id: string) => {
    const res = await fetch(`/api/projects/${id}`);
    const data = await res.json();
    setProject(data);
  }, []);

  useEffect(() => {
    loadUser();
    loadProjects();
  }, [loadUser, loadProjects]);

  useEffect(() => {
    if (selectedProjectId) {
      loadProject(selectedProjectId);
    } else {
      setProject(null);
    }
  }, [selectedProjectId, loadProject]);

  useEffect(() => {
    if (!project) return;

    const allFeatures = [
      ...project.features,
      ...project.features.flatMap((f: any) => f.children || []),
    ];
    const hasActiveWork =
      allFeatures.some((f: any) => f.status === "building") ||
      project.meetings.some((m: any) =>
        ["transcribing", "extracting"].includes(m.status)
      ) ||
      project.deployStatus === "starting";

    if (!hasActiveWork) return;

    const interval = setInterval(() => loadProject(project.id), 2000);
    return () => clearInterval(interval);
  }, [project, loadProject]);

  async function handleToggle(featureId: string, enabled: boolean) {
    await fetch(`/api/features/${featureId}/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (selectedProjectId) loadProject(selectedProjectId);
  }

  async function handleAddFeature(parentId: string | null) {
    const title = prompt("Feature name:");
    if (!title) return;
    const description = prompt("Short description:") || title;

    await fetch(`/api/projects/${selectedProjectId}/features`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, parentId }),
    });
    if (selectedProjectId) loadProject(selectedProjectId);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const workspaces = user?.memberships || [];

  return (
    <div className="flex min-h-screen">
      {/* Left sidebar — project list (hidden in full preview) */}
      {previewMode !== "full" && (
        leftCollapsed ? (
          <button
            onClick={() => setLeftCollapsed(false)}
            className="w-10 border-r border-white/[0.06] bg-[#0a0f1a] flex flex-col items-center cursor-pointer hover:bg-white/[0.03] transition-colors group"
            title="Expand navigation"
          >
            <svg className="mt-3 mb-3 text-white/20 group-hover:text-white/40 transition-colors" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span className="text-[0.6rem] uppercase tracking-[0.2em] text-white/20 group-hover:text-white/40 transition-colors"
              style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
            >
              Navigation
            </span>
          </button>
        ) : (
          <ProjectSidebar
            projects={projects}
            workspaces={workspaces}
            selectedId={selectedProjectId}
            onSelect={(id) => {
              setSelectedProjectId(id);
              setSelection({ type: "project" });
            }}
            onProjectCreated={() => {
              loadProjects();
              loadUser();
            }}
            onDeleteProject={async (id) => {
              await fetch(`/api/projects/${id}`, { method: "DELETE" });
              if (selectedProjectId === id) {
                setSelectedProjectId(null);
                setProject(null);
                setSelection({ type: "project" });
              }
              loadProjects();
            }}
            onCollapse={() => setLeftCollapsed(true)}
            onWorkspaceSettings={(workspaceId) => {
              setSelectedProjectId(null);
              setProject(null);
              setSelection({ type: "workspace-settings", workspaceId });
            }}
            onLogout={handleLogout}
          />
        )
      )}

      {project ? (
        <>
          {/* Middle panel — feature tree (hidden in full/half preview) */}
          {previewMode === "collapsed" && (
            middleCollapsed ? (
              <button
                onClick={() => setMiddleCollapsed(false)}
                className="w-10 border-r border-white/[0.06] bg-[#0c1120] flex flex-col items-center cursor-pointer hover:bg-white/[0.03] transition-colors group"
                title="Expand features"
              >
                <svg className="mt-3 mb-3 text-white/20 group-hover:text-white/40 transition-colors" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                <span className="text-[0.6rem] uppercase tracking-[0.2em] text-white/20 group-hover:text-white/40 transition-colors"
                  style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
                >
                  Features
                </span>
              </button>
            ) : (
              <ProjectTree
                project={project}
                selection={selection}
                onSelect={setSelection}
                onToggle={handleToggle}
                onAddFeature={handleAddFeature}
                onCollapse={() => setMiddleCollapsed(true)}
              />
            )
          )}

          {/* Context pane (hidden in full preview, shares space in half) */}
          {previewMode !== "full" && (
            <main className="flex-1 p-6 overflow-y-auto">
              <ContextPane
                project={project}
                selection={selection}
                onUpdate={() => {
                  if (selectedProjectId) loadProject(selectedProjectId);
                  loadProjects();
                  loadUser();
                }}
                workspaces={workspaces}
                currentUserId={user?.id}
              />
            </main>
          )}

          {/* Right panel — full site preview */}
          {previewMode === "collapsed" ? (
            <button
              onClick={() => setPreviewMode("half")}
              className="w-10 border-l border-white/[0.06] bg-[#0a0f1a] flex flex-col items-center cursor-pointer hover:bg-white/[0.03] transition-colors group"
              title="Expand preview"
            >
              <svg className="mt-3 mb-3 text-white/20 group-hover:text-white/40 transition-colors" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span className="text-[0.6rem] uppercase tracking-[0.2em] text-white/20 group-hover:text-white/40 transition-colors"
                style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
              >
                Preview
              </span>
            </button>
          ) : (
            <div className="flex-1 border-l border-white/[0.06] bg-[#0a0f1a] flex flex-col min-w-0">
              <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] shrink-0">
                <span className="text-[0.6rem] uppercase tracking-widest text-white/30">
                  Live Preview
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPreviewMode("half")}
                    className={`p-1.5 rounded transition-colors ${previewMode === "half" ? "text-white/60 bg-white/[0.08]" : "text-white/20 hover:text-white/40"}`}
                    title="Half screen"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="12" y="3" width="9" height="18" rx="1" />
                      <line x1="3" y1="3" x2="3" y2="21" strokeDasharray="2 2" opacity="0.4" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setPreviewMode("full")}
                    className={`p-1.5 rounded transition-colors ${previewMode === "full" ? "text-white/60 bg-white/[0.08]" : "text-white/20 hover:text-white/40"}`}
                    title="Full screen"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="1" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setPreviewMode("collapsed")}
                    className="p-1.5 rounded text-white/20 hover:text-white/40 transition-colors"
                    title="Collapse preview"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
              {project.deployStatus === "running" ? (
                <iframe
                  src={`/api/preview?projectId=${project.id}`}
                  className="flex-1 w-full border-0"
                  title="Full site preview"
                />
              ) : (
                <div className="flex-1 flex items-center justify-center p-6">
                  <p className="text-white/30 text-sm text-center">
                    {project.deployStatus === "starting"
                      ? "Deploying preview..."
                      : "Upload a codebase to see a live preview."}
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      ) : selection.type === "workspace-settings" ? (
        <main className="flex-1 p-6 overflow-y-auto">
          <ContextPane
            project={null}
            selection={selection}
            onUpdate={() => {
              loadProjects();
              loadUser();
            }}
            workspaces={workspaces}
            currentUserId={user?.id}
          />
        </main>
      ) : (
        <main className="flex-1 p-6 overflow-y-auto">
          <AddContext
            projects={projects}
            onUpdate={() => {
              loadProjects();
              if (selectedProjectId) loadProject(selectedProjectId);
            }}
            onProjectSelected={(id) => {
              setSelectedProjectId(id);
              setSelection({ type: "project" });
            }}
          />
        </main>
      )}
    </div>
  );
}

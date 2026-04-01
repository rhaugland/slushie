"use client";

import { useEffect, useState, useCallback } from "react";
import { ProjectSidebar } from "@/components/project-sidebar";
import { ProjectTree } from "@/components/project-tree";
import { ContextPane } from "@/components/context-pane";

type Selection =
  | { type: "project" }
  | { type: "feature"; id: string }
  | { type: "meeting"; id: string };

export default function Home() {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({ type: "project" });
  const [project, setProject] = useState<any>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [middleCollapsed, setMiddleCollapsed] = useState(false);

  const loadProjects = useCallback(async () => {
    const res = await fetch("/api/projects");
    const data = await res.json();
    setProjects(data);
  }, []);

  const loadProject = useCallback(async (id: string) => {
    const res = await fetch(`/api/projects/${id}`);
    const data = await res.json();
    setProject(data);
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

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

  return (
    <div className="flex min-h-screen">
      {/* Left sidebar — project list */}
      {leftCollapsed ? (
        <div className="w-10 border-r border-white/[0.06] bg-[#0a0f1a] flex flex-col items-center pt-3">
          <button
            onClick={() => setLeftCollapsed(false)}
            className="text-white/20 hover:text-white/50 transition-colors p-1"
            title="Expand projects"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      ) : (
        <ProjectSidebar
          projects={projects}
          selectedId={selectedProjectId}
          onSelect={(id) => {
            setSelectedProjectId(id);
            setSelection({ type: "project" });
          }}
          onProjectCreated={loadProjects}
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
        />
      )}

      {project ? (
        <>
          {/* Middle panel — feature tree */}
          {middleCollapsed ? (
            <div className="w-10 border-r border-white/[0.06] bg-[#0c1120] flex flex-col items-center pt-3">
              <button
                onClick={() => setMiddleCollapsed(false)}
                className="text-white/20 hover:text-white/50 transition-colors p-1"
                title="Expand feature tree"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          ) : (
            <ProjectTree
              project={project}
              selection={selection}
              onSelect={setSelection}
              onToggle={handleToggle}
              onAddFeature={handleAddFeature}
              onCollapse={() => setMiddleCollapsed(true)}
            />
          )}

          <main className="flex-1 p-6 overflow-y-auto">
            <ContextPane
              project={project}
              selection={selection}
              onUpdate={() => {
                if (selectedProjectId) loadProject(selectedProjectId);
                loadProjects();
              }}
            />
          </main>
        </>
      ) : (
        <main className="flex-1 p-6 flex items-center justify-center">
          <p className="text-white/50">Select or create a project to get started.</p>
        </main>
      )}
    </div>
  );
}

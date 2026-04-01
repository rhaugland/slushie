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

  async function handleUploadMeeting() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      const { url } = await uploadRes.json();

      await fetch(`/api/projects/${selectedProjectId}/meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl: url }),
      });

      if (selectedProjectId) loadProject(selectedProjectId);
    };
    input.click();
  }

  return (
    <div className="flex min-h-screen">
      <ProjectSidebar
        projects={projects}
        selectedId={selectedProjectId}
        onSelect={(id) => {
          setSelectedProjectId(id);
          setSelection({ type: "project" });
        }}
        onProjectCreated={loadProjects}
      />

      {project ? (
        <>
          <ProjectTree
            project={project}
            selection={selection}
            onSelect={setSelection}
            onToggle={handleToggle}
            onAddFeature={handleAddFeature}
          />
          <main className="flex-1 p-6">
            <ContextPane
              project={project}
              selection={selection}
              onUpdate={() => {
                if (selectedProjectId) loadProject(selectedProjectId);
                loadProjects();
              }}
            />

            <div className="mt-8 pt-4 border-t border-white/[0.06]">
              <button
                onClick={handleUploadMeeting}
                className="text-xs text-white/30 hover:text-white/50 transition-colors"
              >
                + Upload meeting recording
              </button>
            </div>
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

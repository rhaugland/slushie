"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { Dashboard } from "@/components/dashboard";
import { ProjectTree } from "@/components/project-tree";
import { ContextPane } from "@/components/context-pane";
import { CreateProject } from "@/components/create-project";
import { PaneTeam } from "@/components/pane-team";
import { PaneNotes } from "@/components/pane-notes";
import { PaneWishlist } from "@/components/pane-wishlist";
import { PaneFeedback } from "@/components/pane-feedback";
import { PaneClientView } from "@/components/pane-client-portal";
import { PaneCostCenter } from "@/components/pane-cost-center";
import { PanePropose } from "@/components/pane-propose";
import { PaneBilling } from "@/components/pane-billing";
import { PaneAdmin } from "@/components/pane-admin";
import { PaneStatus } from "@/components/pane-status";
import { PaneReports } from "@/components/pane-reports";
import { InitialBuild } from "@/components/initial-build";
import { AddMajorFeature } from "@/components/add-major-feature";

type View =
  | "dashboard"
  | "build"
  | "notes"
  | "feedback"
  | "wishlist"
  | "propose"
  | "cost-center"
  | "client-view"
  | "team"
  | "billing"
  | "admin"
  | "status"
  | "reports"
  | "mobile"
  | "workspace-settings"
  | "client-settings";

type BuildSelection =
  | { type: "project" }
  | { type: "feature"; id: string }
  | { type: "meeting"; id: string }
  | { type: "add-major-feature" };

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [project, setProject] = useState<any>(null);
  const [buildSelection, setBuildSelection] = useState<BuildSelection>({ type: "project" });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [billingPrefill, setBillingPrefill] = useState<{ monthlyAmount: number; totalMonths: number } | null>(null);
  const [autoOpenAddFeature, setAutoOpenAddFeature] = useState(false);
  const [needsInitialBuild, setNeedsInitialBuild] = useState(false);

  const loadUser = useCallback(async () => {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) {
      router.push("/login");
      return;
    }
    const data = await res.json();
    setUser(data);
  }, [router]);

  const loadProject = useCallback(async (id: string) => {
    const res = await fetch(`/api/projects/${id}`, { cache: "no-store" });
    const data = await res.json();
    setProject(data);
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (selectedProjectId) {
      loadProject(selectedProjectId);
    } else {
      setProject(null);
    }
  }, [selectedProjectId, loadProject]);

  // Polling for active builds
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
    if (parentId) {
      setBuildSelection({ type: "feature", id: parentId });
      setAutoOpenAddFeature(true);
      return;
    }
    setBuildSelection({ type: "add-major-feature" });
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const workspaces = user?.memberships || [];

  function isAdminForWorkspace(workspaceId?: string): boolean {
    const isAdmin = (m: any) => m.role === "admin" || m.role === "owner";
    if (!workspaceId) return workspaces.some(isAdmin);
    return workspaces.some((m: any) => m.workspaceId === workspaceId && isAdmin(m));
  }

  const allProjects = workspaces.flatMap((m: any) =>
    m.workspace.clients.flatMap((c: any) =>
      c.projects.map((p: any) => ({ ...p, clientName: c.name }))
    )
  );

  // Derive workspace/client info from selectedProjectId for settings panel
  let currentWorkspaceId: string | null = null;
  let currentClientId: string | null = null;
  let currentWorkspaceName = "";
  let currentClientName = "";
  let currentProjectName = "";
  for (const m of workspaces) {
    for (const c of m.workspace.clients) {
      for (const p of c.projects) {
        if (p.id === selectedProjectId) {
          currentWorkspaceId = m.workspaceId;
          currentClientId = c.id;
          currentWorkspaceName = m.workspace.name;
          currentClientName = c.name;
          currentProjectName = p.name;
        }
      }
    }
  }

  function handleSelectProject(projectId: string) {
    setSelectedProjectId(projectId);
    setNeedsInitialBuild(false);
    setView("dashboard");
    setBuildSelection({ type: "project" });
  }

  const viewTitles: Record<string, string> = {
    notes: "Notes",
    feedback: "Feedback",
    wishlist: "Wishlist",
    propose: "Propose",
    billing: "Billing",
    admin: "Admin",
    status: "Status",
    reports: "Reports",
    "cost-center": "Cost Center",
    "client-view": "Client View",
    team: "Team",
    "workspace-settings": "Workspace Settings",
    "client-settings": "Client Settings",
  };

  if (!user) return null;

  const hasProjects = allProjects.length > 0;

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar
        workspaces={workspaces}
        selectedProjectId={selectedProjectId}
        onSelectProject={handleSelectProject}
        onCreateProject={() => {
          setSelectedProjectId(null);
          setProject(null);
        }}
        onHome={() => setView("dashboard")}
        onLogout={handleLogout}
        onWorkspaceSettings={() => setView("workspace-settings")}
        onClientSettings={() => setView("client-settings")}
        onProjectSettings={() => {
          setView("build");
          setBuildSelection({ type: "project" });
        }}
        onUserUpdated={() => loadUser()}
        hasGithubToken={user?.hasGithubToken}
        githubTokenPreview={user?.githubTokenPreview}
        workspaceName={currentWorkspaceName}
        clientName={currentClientName}
        projectName={currentProjectName}
        workspaceId={currentWorkspaceId}
        clientId={currentClientId}
      />

      {!hasProjects || !selectedProjectId ? (
        <CreateProject
          workspaces={workspaces}
          onCreated={(id) => {
            loadUser();
            setSelectedProjectId(id);
            setNeedsInitialBuild(true);
            setView("dashboard");
          }}
        />
      ) : needsInitialBuild ? (
        <InitialBuild
          projectId={selectedProjectId}
          projectName={currentProjectName}
          onComplete={() => {
            setNeedsInitialBuild(false);
            if (selectedProjectId) loadProject(selectedProjectId);
            setView("dashboard");
          }}
        />
      ) : view === "dashboard" ? (
        <Dashboard
          projectId={selectedProjectId}
          projectName={currentProjectName}
          onNavigate={(v) => {
            if (v === "mobile") {
              router.push(`/mobile?project=${selectedProjectId}`);
              return;
            }
            setView(v);
            if (v === "build") {
              setBuildSelection({ type: "project" });
              setSidebarCollapsed(false);
            }
          }}
        />
      ) : view === "build" && project ? (
        <div className="flex flex-1 min-h-0 flex-col">
          {/* Back button bar */}
          <div className="px-4 py-2 border-b border-white/[0.06] bg-[#0c1120] shrink-0">
            <button
              onClick={() => setView("dashboard")}
              className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] px-3 py-1.5 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Dashboard
            </button>
          </div>
          <div className="flex flex-1 min-h-0">
            {sidebarCollapsed ? (
              <button
                onClick={() => setSidebarCollapsed(false)}
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
                selection={buildSelection as any}
                onSelect={(sel) => setBuildSelection(sel as BuildSelection)}
                onToggle={handleToggle}
                onAddFeature={handleAddFeature}
                onCollapse={() => setSidebarCollapsed(true)}
              />
            )}

            <main className="flex-1 p-6 overflow-y-auto">
              {buildSelection.type === "add-major-feature" ? (
                <AddMajorFeature
                  projectId={project.id}
                  projectName={project.name}
                  onCreated={() => {
                    if (selectedProjectId) loadProject(selectedProjectId);
                    setBuildSelection({ type: "project" });
                  }}
                  onCancel={() => setBuildSelection({ type: "project" })}
                />
              ) : (
                <ContextPane
                  project={project}
                  selection={buildSelection}
                  onUpdate={() => {
                    if (selectedProjectId) loadProject(selectedProjectId);
                    loadUser();
                  }}
                  workspaces={workspaces}
                  currentUserId={user?.id}
                  isAdmin={isAdminForWorkspace(project?.workspaceId)}
                  autoOpenAddFeature={autoOpenAddFeature}
                  onAutoOpenAddFeatureConsumed={() => setAutoOpenAddFeature(false)}
                  onAddMajorFeature={() => setBuildSelection({ type: "add-major-feature" })}
                />
              )}
            </main>
          </div>
        </div>
      ) : view === "workspace-settings" || view === "client-settings" ? (
        <main className="flex-1 p-6 overflow-y-auto">
          <button
            onClick={() => setView("dashboard")}
            className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] px-3 py-1.5 rounded-lg transition-colors mb-4"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Dashboard
          </button>
          <ContextPane
            project={null}
            selection={
              view === "workspace-settings"
                ? { type: "workspace-settings", workspaceId: currentWorkspaceId! }
                : { type: "client-settings", clientId: currentClientId! }
            }
            onUpdate={() => loadUser()}
            workspaces={workspaces}
            currentUserId={user?.id}
          />
        </main>
      ) : (
        <main className="flex-1 p-6 overflow-y-auto">
          <button
            onClick={() => setView("dashboard")}
            className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] px-3 py-1.5 rounded-lg transition-colors mb-4"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Dashboard
          </button>
          <h2 className="text-lg font-medium text-white/80 mb-4">{viewTitles[view] ?? view}</h2>

          {view === "notes" && (
            <PaneNotes workspaces={workspaces} projectId={selectedProjectId} />
          )}
          {view === "feedback" && (
            <PaneFeedback workspaces={workspaces} onUpdate={() => loadUser()} projectId={selectedProjectId} />
          )}
          {view === "wishlist" && (
            <PaneWishlist workspaces={workspaces} onUpdate={() => loadUser()} projectId={selectedProjectId} />
          )}
          {view === "propose" && (
            <PanePropose
              workspaces={workspaces}
              projectId={selectedProjectId}
              onStartBilling={(data) => {
                setBillingPrefill(data);
                setView("billing");
              }}
            />
          )}
          {view === "cost-center" && (
            <PaneCostCenter projectId={selectedProjectId ?? undefined} projectName={currentProjectName} />
          )}
          {view === "client-view" && (
            <PaneClientView workspaces={workspaces} projectId={selectedProjectId} />
          )}
          {view === "billing" && (
            <PaneBilling projectId={selectedProjectId} projectName={currentProjectName} prefill={billingPrefill} />
          )}
          {view === "team" && (
            <PaneTeam workspaces={workspaces} onUpdate={() => loadUser()} isAdmin={isAdminForWorkspace()} projectId={selectedProjectId} />
          )}
          {view === "admin" && (
            <PaneAdmin workspaces={workspaces} onUpdate={() => loadUser()} />
          )}
          {view === "status" && (
            <PaneStatus workspaces={workspaces} />
          )}
          {view === "reports" && selectedProjectId && (
            <PaneReports projectId={selectedProjectId} projectName={currentProjectName} />
          )}
        </main>
      )}
    </div>
  );
}

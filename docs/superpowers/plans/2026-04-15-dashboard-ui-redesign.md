# Dashboard UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sidebar-driven three-panel layout with a dashboard UI — persistent top bar with project picker, 8-card grid dashboard, full-page takeover views for each card.

**Architecture:** A persistent `TopBar` component holds the logo (home link), `ProjectPicker` dropdown (workspace > client > project), settings gear, and logout. Below it, the main area renders either the `Dashboard` card grid or a full-page takeover view for the selected card. The Build card renders the existing three-panel layout; all other cards render their existing pane component full-width. The `ProjectSidebar` component is removed entirely.

**Tech Stack:** Next.js, React, Tailwind CSS, existing slushie API endpoints

---

## Context

- **Spec:** `docs/superpowers/specs/2026-04-15-dashboard-ui-redesign.md`
- All existing pane components (`pane-*.tsx`) are preserved internally
- Several panes currently take `workspaces` and do workspace-level filtering — they'll receive a `projectId` prop to scope to the selected project
- The Build view keeps its full three-panel layout (ProjectTree + ContextPane + Preview)

## Critical Files (read before implementing)

- `/Users/ryanhaugland/slushie/src/app/page.tsx` — Current layout, Selection type, all state management
- `/Users/ryanhaugland/slushie/src/components/project-sidebar.tsx` — Being removed; understand what callbacks it handles
- `/Users/ryanhaugland/slushie/src/components/context-pane.tsx` — Routes project-level selections inside Build
- `/Users/ryanhaugland/slushie/src/components/project-tree.tsx` — Middle panel, used inside Build view
- `/Users/ryanhaugland/slushie/src/components/add-context.tsx` — Empty state with drag-and-drop codebase upload
- `/Users/ryanhaugland/slushie/src/components/pane-notes.tsx` — Workspace-level, needs project scoping
- `/Users/ryanhaugland/slushie/src/components/pane-feedback.tsx` — Workspace-level, needs project scoping
- `/Users/ryanhaugland/slushie/src/components/pane-wishlist.tsx` — Workspace-level, needs project scoping
- `/Users/ryanhaugland/slushie/src/components/pane-team.tsx` — Workspace-level, needs project scoping
- `/Users/ryanhaugland/slushie/src/components/pane-client-portal.tsx` — Workspace-level, needs project scoping
- `/Users/ryanhaugland/slushie/src/components/pane-propose.tsx` — Workspace-level, needs project scoping
- `/Users/ryanhaugland/slushie/src/components/pane-cost-center.tsx` — Already accepts projectId

## File Structure

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/components/top-bar.tsx` | Persistent top bar: logo, project picker, settings gear, logout |
| Create | `src/components/project-picker.tsx` | Dropdown grouped by workspace > client > project |
| Create | `src/components/dashboard.tsx` | 8-card responsive grid with live data previews |
| Create | `src/components/settings-panel.tsx` | Settings gear dropdown with workspace/client/project tabs |
| Rewrite | `src/app/page.tsx` | New layout: TopBar + Dashboard/Takeover pattern |
| Modify | `src/components/pane-notes.tsx` | Add optional `projectId` prop for project-scoped filtering |
| Modify | `src/components/pane-feedback.tsx` | Add optional `projectId` prop for project-scoped filtering |
| Modify | `src/components/pane-wishlist.tsx` | Add optional `projectId` prop for project-scoped filtering |
| Modify | `src/components/pane-team.tsx` | Add optional `projectId` prop for project-scoped filtering |
| Modify | `src/components/pane-client-portal.tsx` | Add optional `projectId` prop for project-scoped filtering |
| Modify | `src/components/pane-propose.tsx` | Add optional `projectId` prop for project-scoped filtering |
| Remove | `src/components/project-sidebar.tsx` | Replaced by TopBar + Dashboard |

---

### Task 1: Create ProjectPicker Component

**Files:**
- Create: `src/components/project-picker.tsx`

- [ ] **Step 1: Create the ProjectPicker component**

```tsx
// src/components/project-picker.tsx
"use client";

import { useState, useRef, useEffect } from "react";

type WorkspaceMembership = {
  workspaceId: string;
  role: string;
  workspace: {
    id: string;
    name: string;
    slug: string;
    clients: {
      id: string;
      name: string;
      projects: { id: string; name: string }[];
    }[];
  };
};

type Props = {
  workspaces: WorkspaceMembership[];
  selectedProjectId: string | null;
  onSelect: (projectId: string) => void;
  onCreateProject?: () => void;
};

export function ProjectPicker({ workspaces, selectedProjectId, onSelect, onCreateProject }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Find the selected project's display label
  let selectedLabel = "Select a project";
  for (const m of workspaces) {
    for (const c of m.workspace.clients) {
      for (const p of c.projects) {
        if (p.id === selectedProjectId) {
          selectedLabel = `${m.workspace.name} > ${c.name} > ${p.name}`;
        }
      }
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.15] transition-colors text-sm min-w-[200px] max-w-[400px]"
      >
        <span className="truncate text-white/70">{selectedLabel}</span>
        <svg className="w-3.5 h-3.5 text-white/30 shrink-0 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 w-80 bg-[#111827] border border-white/[0.1] rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto">
          {workspaces.map((m) => (
            <div key={m.workspaceId}>
              <div className="px-3 py-1.5 text-[0.6rem] uppercase tracking-widest text-white/30 font-medium">
                {m.workspace.name}
              </div>
              {m.workspace.clients.map((c) => (
                <div key={c.id}>
                  <div className="px-3 py-1 text-xs text-white/40 pl-5">
                    {c.name}
                  </div>
                  {c.projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { onSelect(p.id); setOpen(false); }}
                      className={`w-full text-left px-3 py-1.5 text-sm pl-8 transition-colors ${
                        p.id === selectedProjectId
                          ? "bg-white/[0.08] text-white"
                          : "text-white/60 hover:bg-white/[0.04] hover:text-white/80"
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))}
          {onCreateProject && (
            <>
              <div className="border-t border-white/[0.06] my-1" />
              <button
                onClick={() => { onCreateProject(); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-blue-400 hover:bg-white/[0.04] transition-colors"
              >
                + New Project
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/project-picker.tsx
git commit -m "feat: add ProjectPicker dropdown component"
```

---

### Task 2: Create SettingsPanel Component

**Files:**
- Create: `src/components/settings-panel.tsx`

- [ ] **Step 1: Create the SettingsPanel component**

This renders when the gear icon is clicked. It shows workspace/client/project settings using the existing `ContextPane` for workspace-settings and client-settings, and `PaneProject` for project settings.

```tsx
// src/components/settings-panel.tsx
"use client";

import { useState, useRef, useEffect } from "react";

type Props = {
  workspaceId: string | null;
  clientId: string | null;
  projectId: string | null;
  workspaceName: string;
  clientName: string;
  projectName: string;
  onWorkspaceSettings: () => void;
  onClientSettings: () => void;
  onProjectSettings: () => void;
};

export function SettingsPanel({
  workspaceId,
  clientId,
  projectId,
  workspaceName,
  clientName,
  projectName,
  onWorkspaceSettings,
  onClientSettings,
  onProjectSettings,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-colors"
        title="Settings"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 right-0 w-56 bg-[#111827] border border-white/[0.1] rounded-lg shadow-xl z-50">
          {workspaceId && (
            <button
              onClick={() => { onWorkspaceSettings(); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 text-sm text-white/60 hover:bg-white/[0.04] hover:text-white/80 transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
              </svg>
              <span>Workspace: {workspaceName}</span>
            </button>
          )}
          {clientId && (
            <button
              onClick={() => { onClientSettings(); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 text-sm text-white/60 hover:bg-white/[0.04] hover:text-white/80 transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>Client: {clientName}</span>
            </button>
          )}
          {projectId && (
            <button
              onClick={() => { onProjectSettings(); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 text-sm text-white/60 hover:bg-white/[0.04] hover:text-white/80 transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span>Project: {projectName}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/settings-panel.tsx
git commit -m "feat: add SettingsPanel dropdown for workspace/client/project settings"
```

---

### Task 3: Create TopBar Component

**Files:**
- Create: `src/components/top-bar.tsx`

- [ ] **Step 1: Create the TopBar component**

```tsx
// src/components/top-bar.tsx
"use client";

import { ProjectPicker } from "./project-picker";
import { SettingsPanel } from "./settings-panel";

type WorkspaceMembership = {
  workspaceId: string;
  role: string;
  workspace: {
    id: string;
    name: string;
    slug: string;
    clients: {
      id: string;
      name: string;
      projects: { id: string; name: string }[];
    }[];
  };
};

type Props = {
  workspaces: WorkspaceMembership[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onHome: () => void;
  onLogout: () => void;
  onWorkspaceSettings: () => void;
  onClientSettings: () => void;
  onProjectSettings: () => void;
  // Derived from selectedProjectId for settings panel labels
  workspaceName: string;
  clientName: string;
  projectName: string;
  workspaceId: string | null;
  clientId: string | null;
};

export function TopBar({
  workspaces,
  selectedProjectId,
  onSelectProject,
  onHome,
  onLogout,
  onWorkspaceSettings,
  onClientSettings,
  onProjectSettings,
  workspaceName,
  clientName,
  projectName,
  workspaceId,
  clientId,
}: Props) {
  return (
    <div className="h-12 border-b border-white/[0.06] bg-[#0a0f1a] flex items-center px-4 gap-4 shrink-0">
      {/* Logo / Home */}
      <button
        onClick={onHome}
        className="text-sm font-bold shrink-0"
      >
        <span className="bg-gradient-to-r from-red-500 to-blue-500 bg-clip-text text-transparent">
          slushie.machine
        </span>
      </button>

      {/* Project Picker — centered */}
      <div className="flex-1 flex justify-center">
        <ProjectPicker
          workspaces={workspaces}
          selectedProjectId={selectedProjectId}
          onSelect={onSelectProject}
        />
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1 shrink-0">
        <SettingsPanel
          workspaceId={workspaceId}
          clientId={clientId}
          projectId={selectedProjectId}
          workspaceName={workspaceName}
          clientName={clientName}
          projectName={projectName}
          onWorkspaceSettings={onWorkspaceSettings}
          onClientSettings={onClientSettings}
          onProjectSettings={onProjectSettings}
        />
        <button
          onClick={onLogout}
          className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-colors"
          title="Log out"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/top-bar.tsx
git commit -m "feat: add TopBar component with logo, project picker, settings, logout"
```

---

### Task 4: Create Dashboard Component

**Files:**
- Create: `src/components/dashboard.tsx`

- [ ] **Step 1: Create the Dashboard card grid component**

The dashboard fetches live summary data for each card via a lightweight API call. Cards show icon + title + subtitle with live counts.

```tsx
// src/components/dashboard.tsx
"use client";

import { useEffect, useState } from "react";

type View = "build" | "notes" | "feedback" | "wishlist" | "propose" | "cost-center" | "client-view" | "team";

type Props = {
  projectId: string;
  projectName: string;
  onNavigate: (view: View) => void;
};

type CardDef = {
  view: View;
  title: string;
  icon: React.ReactNode;
  subtitle: string;
};

export function Dashboard({ projectId, projectName, onNavigate }: Props) {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    if (!projectId) return;
    // Fetch project data for card summaries
    fetch(`/api/projects/${projectId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => {});
  }, [projectId]);

  const featureCount = stats
    ? stats.features?.length + (stats.features?.flatMap((f: any) => f.children || [])?.length || 0)
    : 0;
  const meetingCount = stats?.meetings?.length ?? 0;
  const deployStatus = stats?.deployStatus ?? "idle";

  const cards: CardDef[] = [
    {
      view: "build",
      title: "Build",
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
        </svg>
      ),
      subtitle: `${featureCount} features \u00b7 ${deployStatus === "running" ? "Live" : deployStatus === "starting" ? "Deploying..." : "Not deployed"}`,
    },
    {
      view: "notes",
      title: "Notes",
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      ),
      subtitle: `${meetingCount} meeting${meetingCount !== 1 ? "s" : ""}`,
    },
    {
      view: "feedback",
      title: "Feedback",
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
      ),
      subtitle: "Client feedback",
    },
    {
      view: "wishlist",
      title: "Wishlist",
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
        </svg>
      ),
      subtitle: "Feature requests",
    },
    {
      view: "propose",
      title: "Propose",
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      subtitle: "Scope & estimate",
    },
    {
      view: "cost-center",
      title: "Cost Center",
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      subtitle: "AI token costs",
    },
    {
      view: "client-view",
      title: "Client View",
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      subtitle: "Portal credentials",
    },
    {
      view: "team",
      title: "Team",
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      ),
      subtitle: "Project members",
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-lg font-medium text-white/80 mb-6">{projectName}</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card) => (
            <button
              key={card.view}
              onClick={() => onNavigate(card.view)}
              className="group flex flex-col items-center gap-3 p-6 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.12] transition-all text-center"
            >
              <div className="text-white/30 group-hover:text-white/60 transition-colors">
                {card.icon}
              </div>
              <div>
                <div className="text-sm font-medium text-white/70 group-hover:text-white/90 transition-colors">
                  {card.title}
                </div>
                <div className="text-xs text-white/30 mt-0.5">{card.subtitle}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard.tsx
git commit -m "feat: add Dashboard 8-card grid component"
```

---

### Task 5: Rewrite page.tsx with New Layout

This is the biggest task. Replace the three-panel sidebar layout with TopBar + Dashboard/Takeover.

**Files:**
- Rewrite: `src/app/page.tsx`

- [ ] **Step 1: Read the current page.tsx to confirm latest state**

Read `src/app/page.tsx` to confirm the current state matches what we expect.

- [ ] **Step 2: Rewrite page.tsx**

The new page.tsx has:
- `View` type instead of `Selection` (dashboard | build | notes | feedback | ...)
- `buildSelection` sub-state for navigation within the Build view
- Persistent `TopBar` at the top
- Main area renders Dashboard or takeover views
- Build takeover renders the existing three-panel layout
- Other takeovers render pane components full-width with a back button header
- All existing callbacks (delete, rename, create, toggle, etc.) preserved

```tsx
// src/app/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { Dashboard } from "@/components/dashboard";
import { ProjectTree } from "@/components/project-tree";
import { ContextPane } from "@/components/context-pane";
import { AddContext } from "@/components/add-context";
import { PaneTeam } from "@/components/pane-team";
import { PaneNotes } from "@/components/pane-notes";
import { PaneWishlist } from "@/components/pane-wishlist";
import { PaneFeedback } from "@/components/pane-feedback";
import { PaneClientView } from "@/components/pane-client-portal";
import { PaneCostCenter } from "@/components/pane-cost-center";
import { PanePropose } from "@/components/pane-propose";
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
  | "workspace-settings"
  | "client-settings";

// Sub-selection within the Build view (same as old Selection for project-level)
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
  const [middleCollapsed, setMiddleCollapsed] = useState(false);
  const [previewMode, setPreviewMode] = useState<"collapsed" | "half" | "full">("collapsed");
  const [autoOpenAddFeature, setAutoOpenAddFeature] = useState(false);

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
    setView("dashboard");
    setBuildSelection({ type: "project" });
  }

  // View titles for back button header
  const viewTitles: Record<string, string> = {
    notes: "Notes",
    feedback: "Feedback",
    wishlist: "Wishlist",
    propose: "Propose",
    "cost-center": "Cost Center",
    "client-view": "Client View",
    team: "Team",
    "workspace-settings": "Workspace Settings",
    "client-settings": "Client Settings",
  };

  if (!user) return null;

  // No projects — show onboarding
  const hasProjects = allProjects.length > 0;

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar
        workspaces={workspaces}
        selectedProjectId={selectedProjectId}
        onSelectProject={handleSelectProject}
        onHome={() => setView("dashboard")}
        onLogout={handleLogout}
        onWorkspaceSettings={() => setView("workspace-settings")}
        onClientSettings={() => setView("client-settings")}
        onProjectSettings={() => {
          setView("build");
          setBuildSelection({ type: "project" });
        }}
        workspaceName={currentWorkspaceName}
        clientName={currentClientName}
        projectName={currentProjectName}
        workspaceId={currentWorkspaceId}
        clientId={currentClientId}
      />

      {!hasProjects || !selectedProjectId ? (
        /* Empty state / onboarding — drag-and-drop codebase upload */
        <main className="flex-1 p-6 overflow-y-auto">
          <AddContext
            projects={allProjects}
            onUpdate={() => {
              loadUser();
              if (selectedProjectId) loadProject(selectedProjectId);
            }}
            onProjectSelected={(id) => {
              setSelectedProjectId(id);
              setView("dashboard");
            }}
          />
        </main>
      ) : view === "dashboard" ? (
        /* Dashboard card grid */
        <Dashboard
          projectId={selectedProjectId}
          projectName={currentProjectName}
          onNavigate={(v) => {
            setView(v);
            if (v === "build") {
              setBuildSelection({ type: "project" });
              setPreviewMode("collapsed");
              setMiddleCollapsed(false);
            }
          }}
        />
      ) : view === "build" && project ? (
        /* Build view — existing three-panel layout */
        <div className="flex flex-1 min-h-0">
          {/* Middle panel — feature tree */}
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
                selection={buildSelection as any}
                onSelect={(sel) => setBuildSelection(sel as BuildSelection)}
                onToggle={handleToggle}
                onAddFeature={handleAddFeature}
                onCollapse={() => setMiddleCollapsed(true)}
                onRenameProject={async (name) => {
                  await fetch(`/api/projects/${project.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name }),
                  });
                  loadUser();
                  loadProject(project.id);
                }}
                onTeamUpdate={() => {
                  if (selectedProjectId) loadProject(selectedProjectId);
                  loadUser();
                }}
                isAdmin={isAdminForWorkspace(project?.workspaceId)}
              />
            )
          )}

          {/* Context pane */}
          {previewMode !== "full" && (
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
                  onOpenPreview={() => setPreviewMode("half")}
                  isAdmin={isAdminForWorkspace(project?.workspaceId)}
                  autoOpenAddFeature={autoOpenAddFeature}
                  onAutoOpenAddFeatureConsumed={() => setAutoOpenAddFeature(false)}
                  onAddMajorFeature={() => setBuildSelection({ type: "add-major-feature" })}
                />
              )}
            </main>
          )}

          {/* Preview panel */}
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
                <span className="text-[0.6rem] uppercase tracking-widest text-white/30">Live Preview</span>
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
        </div>
      ) : view === "workspace-settings" || view === "client-settings" ? (
        /* Settings views — use ContextPane for workspace/client settings */
        <main className="flex-1 p-6 overflow-y-auto">
          <button
            onClick={() => setView("dashboard")}
            className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors mb-4"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
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
        /* All other takeover views (notes, feedback, wishlist, etc.) */
        <main className="flex-1 p-6 overflow-y-auto">
          <button
            onClick={() => setView("dashboard")}
            className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors mb-4"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
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
            <PanePropose workspaces={workspaces} projectId={selectedProjectId} />
          )}
          {view === "cost-center" && (
            <PaneCostCenter projectId={selectedProjectId ?? undefined} projectName={currentProjectName} />
          )}
          {view === "client-view" && (
            <PaneClientView workspaces={workspaces} projectId={selectedProjectId} />
          )}
          {view === "team" && (
            <PaneTeam workspaces={workspaces} onUpdate={() => loadUser()} isAdmin={isAdminForWorkspace()} projectId={selectedProjectId} />
          )}
        </main>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: rewrite page.tsx with dashboard layout and card takeover views"
```

---

### Task 6: Add projectId Prop to Pane Components

Each pane that currently takes `workspaces` and shows a project dropdown needs to accept an optional `projectId` prop to pre-filter to that project. The approach: add the prop, and if provided, auto-set the internal `selectedProjectId` state on mount and whenever the prop changes. This is a minimal change — the pane's internal UI still works, it just starts pre-filtered.

**Files:**
- Modify: `src/components/pane-notes.tsx`
- Modify: `src/components/pane-feedback.tsx`
- Modify: `src/components/pane-wishlist.tsx`
- Modify: `src/components/pane-team.tsx`
- Modify: `src/components/pane-client-portal.tsx`
- Modify: `src/components/pane-propose.tsx`

- [ ] **Step 1: Read each pane to find the Props type and internal project state**

Read the following files to find where `Props` is defined and where internal `selectedProjectId` state is managed:
- `src/components/pane-notes.tsx` — find Props type and any internal project selection state
- `src/components/pane-feedback.tsx` — find Props type and any internal project selection state
- `src/components/pane-wishlist.tsx` — find Props type and any internal project selection state
- `src/components/pane-team.tsx` — find Props type and any internal project selection state
- `src/components/pane-client-portal.tsx` — find Props type and any internal project selection state
- `src/components/pane-propose.tsx` — find Props type and any internal project selection state

- [ ] **Step 2: Add projectId prop to each pane**

For each pane component, make these changes:

**Pattern A** — Panes that have internal `selectedProjectId` state (likely Notes, Feedback, Wishlist, Client View):

1. Add `projectId?: string | null` to the Props type
2. Destructure `projectId` in the component signature
3. Add a `useEffect` that sets the internal `selectedProjectId` when the prop changes:

```tsx
useEffect(() => {
  if (projectId) setSelectedProjectId(projectId);
}, [projectId]);
```

4. Optionally hide the project dropdown when `projectId` is provided (cleaner UX since project is already selected in the top bar)

**Pattern B** — Panes that don't have internal project state (likely Team, Propose):

1. Add `projectId?: string | null` to the Props type
2. Destructure `projectId` in the component signature
3. Use it to filter displayed data (e.g., filter workspace members to those with access to the project)

Apply the changes to each file. The exact lines to modify depend on what Step 1 reveals — look for the `Props` type definition and any `useState` for project selection.

- [ ] **Step 3: Verify build compiles**

Run: `npx next build 2>&1 | tail -10`
Expected: Build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/pane-notes.tsx src/components/pane-feedback.tsx src/components/pane-wishlist.tsx src/components/pane-team.tsx src/components/pane-client-portal.tsx src/components/pane-propose.tsx
git commit -m "feat: add projectId prop to all pane components for project-scoped filtering"
```

---

### Task 7: Build, Test, and Clean Up

**Files:**
- Remove: `src/components/project-sidebar.tsx` (no longer imported)

- [ ] **Step 1: Remove project-sidebar.tsx**

Verify that `project-sidebar.tsx` is no longer imported anywhere:

Run: `grep -r "project-sidebar" src/ --include="*.tsx" --include="*.ts"`

If no imports found (page.tsx no longer imports it), delete the file:

```bash
rm src/components/project-sidebar.tsx
```

- [ ] **Step 2: Build the project**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds. Fix any type errors that appear.

- [ ] **Step 3: Restart production server**

```bash
# Kill existing server
lsof -ti:3000 | xargs kill -9
# Start production
npx next start -p 3000 &
```

- [ ] **Step 4: Visual verification**

Open `http://localhost:3000` in browser (or ngrok URL). Verify:
1. Top bar shows with logo, project picker, settings gear, logout
2. Project picker dropdown lists workspace > client > project hierarchy
3. Selecting a project shows 8-card dashboard grid
4. Clicking Build card opens three-panel layout (feature tree + context + preview)
5. Clicking other cards opens full-page view with back button
6. Back button and logo click return to dashboard
7. Settings gear shows workspace/client/project options
8. No projects state shows drag-and-drop upload

- [ ] **Step 5: Commit cleanup**

```bash
git add -A
git commit -m "chore: remove project-sidebar.tsx, verify build"
```

---

## Verification Checklist

1. **Top bar persistent** — visible on dashboard, inside cards, inside Build
2. **Project picker works** — grouped dropdown, switching refreshes dashboard
3. **Dashboard cards** — 8 cards, responsive grid, live data previews
4. **Build takeover** — three-panel layout identical to before
5. **Pane takeovers** — full-page with back button, project-scoped data
6. **Settings gear** — workspace/client/project settings accessible
7. **Empty state** — drag-and-drop upload when no projects
8. **Logout** — redirects to login
9. **ngrok** — works through `https://slushiemachine.ngrok.dev` (production build)

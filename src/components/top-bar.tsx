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

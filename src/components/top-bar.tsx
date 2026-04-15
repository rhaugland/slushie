"use client";

import { useState } from "react";
import { ProjectPicker } from "./project-picker";
import { SettingsPanel } from "./settings-panel";
import { NotificationDropdown, useUnreadCount } from "./notification-dropdown";

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
  onCreateProject?: () => void;
  onHome: () => void;
  onLogout: () => void;
  onWorkspaceSettings: () => void;
  onClientSettings: () => void;
  onProjectSettings: () => void;
  onUserUpdated?: () => void;
  hasGithubToken?: boolean;
  githubTokenPreview?: string | null;
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
  onCreateProject,
  onHome,
  onLogout,
  onWorkspaceSettings,
  onClientSettings,
  onProjectSettings,
  onUserUpdated,
  hasGithubToken,
  githubTokenPreview,
  workspaceName,
  clientName,
  projectName,
  workspaceId,
  clientId,
}: Props) {
  const [notifOpen, setNotifOpen] = useState(false);
  const { unread, recheck } = useUnreadCount();

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
          onCreateProject={onCreateProject}
        />
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Notification bell */}
        <div className="relative">
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-colors relative"
            title="Activity"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {unread && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>
          <NotificationDropdown
            open={notifOpen}
            onClose={() => {
              setNotifOpen(false);
              recheck();
            }}
          />
        </div>
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
          onUserUpdated={onUserUpdated}
          hasGithubToken={hasGithubToken}
          githubTokenPreview={githubTokenPreview}
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

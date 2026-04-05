"use client";

import { PaneProject } from "./pane-project";
import { PaneFeature } from "./pane-feature";
import { PaneMeeting } from "./pane-meeting";
import { WorkspaceSettings } from "./workspace-settings";
import { ClientSettings } from "./client-settings";

type Selection =
  | { type: "project" }
  | { type: "feature"; id: string }
  | { type: "meeting"; id: string }
  | { type: "workspace-settings"; workspaceId: string }
  | { type: "client-settings"; clientId: string }
  | { type: string };

type WorkspaceMembership = {
  workspaceId: string;
  role: string;
  workspace: { id: string; name: string; slug: string; clients: any[] };
};

type Props = {
  project: any;
  selection: Selection;
  onUpdate: () => void;
  workspaces?: WorkspaceMembership[];
  currentUserId?: string;
  onOpenPreview?: () => void;
  isAdmin?: boolean;
  autoOpenAddFeature?: boolean;
  onAutoOpenAddFeatureConsumed?: () => void;
  onAddMajorFeature?: () => void;
};

export function ContextPane({ project, selection, onUpdate, workspaces, currentUserId, onOpenPreview, isAdmin, autoOpenAddFeature, onAutoOpenAddFeatureConsumed, onAddMajorFeature }: Props) {
  if (selection.type === "workspace-settings") {
    const membership = workspaces?.find((m) => m.workspaceId === selection.workspaceId);
    if (!membership || !currentUserId) return null;
    return (
      <WorkspaceSettings
        workspace={membership.workspace}
        currentUserId={currentUserId}
        userRole={membership.role}
        onWorkspaceRenamed={onUpdate}
      />
    );
  }

  if (selection.type === "client-settings") {
    const allClients = workspaces?.flatMap((m) => m.workspace.clients || []) || [];
    const clientData = allClients.find((c: any) => c.id === selection.clientId);
    if (!clientData || !currentUserId) return null;
    const clientProjects: { id: string; name: string }[] = (clientData.projects || []).map(
      (p: any) => ({ id: p.id, name: p.name })
    );
    return (
      <ClientSettings
        client={clientData}
        projects={clientProjects}
        currentUserId={currentUserId}
        onUpdate={onUpdate}
      />
    );
  }

  if (selection.type === "project") {
    return <PaneProject project={project} onUpdate={onUpdate} onOpenPreview={onOpenPreview} isAdmin={isAdmin} />;
  }

  if (selection.type === "feature") {
    const allFeatures = [
      ...project.features,
      ...project.features.flatMap((f: any) => f.children || []),
    ];
    const feature = allFeatures.find((f: any) => f.id === selection.id);
    if (!feature) return <p className="text-white/30 text-sm">Feature not found.</p>;

    const parentFeature = feature.parentId
      ? project.features.find((f: any) => f.id === feature.parentId)
      : null;

    return (
      <PaneFeature
        key={feature.id}
        feature={feature}
        projectId={project.id}
        deployUrl={project.deployUrl || null}
        parentTitle={parentFeature?.title || null}
        parentRoute={parentFeature?.route || null}
        onUpdate={onUpdate}
        autoOpenAddFeature={autoOpenAddFeature}
        onAutoOpenAddFeatureConsumed={onAutoOpenAddFeatureConsumed}
        onAddMajorFeature={!feature.parentId ? onAddMajorFeature : undefined}
      />
    );
  }

  if (selection.type === "meeting") {
    const meeting = project.meetings.find((m: any) => m.id === selection.id);
    if (!meeting) return <p className="text-white/30 text-sm">Meeting not found.</p>;
    return (
      <PaneMeeting
        meeting={meeting}
        projectId={project.id}
        existingFeatures={project.features}
        onUpdate={onUpdate}
      />
    );
  }

  return null;
}

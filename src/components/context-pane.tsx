"use client";

import { PaneProject } from "./pane-project";
import { PaneFeature } from "./pane-feature";
import { PaneMeeting } from "./pane-meeting";
import { WorkspaceSettings } from "./workspace-settings";

type Selection =
  | { type: "project" }
  | { type: "feature"; id: string }
  | { type: "meeting"; id: string }
  | { type: "workspace-settings"; workspaceId: string };

type WorkspaceMembership = {
  workspaceId: string;
  role: string;
  workspace: { id: string; name: string; slug: string };
};

type Props = {
  project: any;
  selection: Selection;
  onUpdate: () => void;
  workspaces?: WorkspaceMembership[];
  currentUserId?: string;
  onOpenPreview?: () => void;
};

export function ContextPane({ project, selection, onUpdate, workspaces, currentUserId, onOpenPreview }: Props) {
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

  if (selection.type === "project") {
    return <PaneProject project={project} onUpdate={onUpdate} onOpenPreview={onOpenPreview} currentUserId={currentUserId} />;
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
        feature={feature}
        projectId={project.id}
        deployUrl={project.deployUrl || null}
        parentTitle={parentFeature?.title || null}
        parentRoute={parentFeature?.route || null}
        onUpdate={onUpdate}
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

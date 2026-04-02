"use client";

import { PaneProject } from "./pane-project";
import { PaneFeature } from "./pane-feature";
import { PaneMeeting } from "./pane-meeting";

type Selection =
  | { type: "project" }
  | { type: "feature"; id: string }
  | { type: "meeting"; id: string };

type Props = {
  project: any;
  selection: Selection;
  onUpdate: () => void;
};

export function ContextPane({ project, selection, onUpdate }: Props) {
  if (selection.type === "project") {
    return <PaneProject project={project} onUpdate={onUpdate} />;
  }

  if (selection.type === "feature") {
    const allFeatures = [
      ...project.features,
      ...project.features.flatMap((f: any) => f.children || []),
    ];
    const feature = allFeatures.find((f: any) => f.id === selection.id);
    if (!feature) return <p className="text-white/30 text-sm">Feature not found.</p>;

    // For minor features, find the parent to derive the preview route
    const parentFeature = feature.parentId
      ? project.features.find((f: any) => f.id === feature.parentId)
      : null;

    return (
      <PaneFeature
        feature={feature}
        projectId={project.id}
        deployUrl={project.deployUrl || null}
        parentTitle={parentFeature?.title || null}
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

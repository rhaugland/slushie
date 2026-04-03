"use client";

import { EditableText } from "./editable-text";

type Props = {
  project: {
    id: string;
    name: string;
    clientName: string;
    workspaceId: string;
    deployUrl: string | null;
    deployStatus: string;
    features: any[];
    meetings: any[];
  };
  onUpdate: () => void;
};

export function PaneProject({ project, onUpdate }: Props) {
  const liveFeatures = [
    ...project.features,
    ...project.features.flatMap((f: any) => f.children || []),
  ].filter((f) => f.status === "live");

  const totalFeatures = [
    ...project.features,
    ...project.features.flatMap((f: any) => f.children || []),
  ].length;

  async function handleRename(name: string) {
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    onUpdate();
  }

  return (
    <div>
      <EditableText
        value={project.name}
        onSave={handleRename}
        className="text-xl font-semibold text-[#f1f5f9]"
        inputClassName="text-xl font-semibold text-[#f1f5f9]"
      />
      <p className="text-xs text-white/40 mb-6 mt-1">
        {project.clientName}
      </p>

      {project.deployUrl && (
        <a
          href={`/api/preview/?projectId=${project.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full px-4 py-3 mb-6 rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          <span>Open Preview</span>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.08]">
          <div className="text-lg font-semibold text-white/80">{totalFeatures}</div>
          <div className="text-[0.6rem] text-white/30 uppercase tracking-wider">Features</div>
        </div>
        <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.08]">
          <div className="text-lg font-semibold text-green-400">{liveFeatures.length}</div>
          <div className="text-[0.6rem] text-white/30 uppercase tracking-wider">Live</div>
        </div>
        <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.08]">
          <div className={`text-lg font-semibold ${
            project.deployStatus === "running" ? "text-green-400" : "text-white/40"
          }`}>
            {project.deployStatus === "running" ? "Up" : project.deployStatus}
          </div>
          <div className="text-[0.6rem] text-white/30 uppercase tracking-wider">Server</div>
        </div>
      </div>
    </div>
  );
}

"use client";

type Props = {
  project: {
    id: string;
    name: string;
    clientName: string;
    clientFirm: string;
    deployUrl: string | null;
    deployStatus: string;
    features: any[];
  };
  onUpdate: () => void;
};

export function PaneProject({ project }: Props) {
  const liveFeatures = [
    ...project.features,
    ...project.features.flatMap((f: any) => f.children || []),
  ].filter((f) => f.status === "live");

  const totalFeatures = [
    ...project.features,
    ...project.features.flatMap((f: any) => f.children || []),
  ].length;

  return (
    <div>
      <h2 className="text-xl font-semibold text-[#f1f5f9] mb-1">{project.name}</h2>
      <p className="text-xs text-white/40 mb-6">
        {project.clientName} · {project.clientFirm}
      </p>

      <div className="grid grid-cols-3 gap-3 mb-6">
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

      {project.deployUrl && (
        <div className="bg-white/[0.03] rounded-lg p-4 border border-white/[0.08] mb-4">
          <div className="text-[0.6rem] text-white/30 uppercase tracking-wider mb-2">Preview URL</div>
          <a
            href={project.deployUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-400 hover:text-blue-300 underline break-all"
          >
            {project.deployUrl}
          </a>
        </div>
      )}
    </div>
  );
}

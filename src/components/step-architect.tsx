"use client";

type ArchitectPlan = {
  summary: string;
  features: string[];
  techStack: { framework: string; styling: string; other: string[] };
  fileStructure: string[];
  implementationSteps: string[];
};

type Build = {
  id: string;
  architectPlan: ArchitectPlan;
  deployStatus: string;
};

type StepArchitectProps = {
  objectiveTitle: string;
  objectiveStatus: string;
  build: Build | null;
  onApprove: (buildId: string) => void;
};

export function StepArchitect({
  objectiveTitle,
  objectiveStatus,
  build,
  onApprove,
}: StepArchitectProps) {
  if (objectiveStatus === "architecting" || !build) {
    return (
      <div>
        <h3 className="text-base font-semibold text-[#f1f5f9] mb-1">
          Architecting: {objectiveTitle}
        </h3>
        <div className="flex items-center gap-3 py-8">
          <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-sm text-blue-300">Architect bot is designing the approach...</span>
        </div>
      </div>
    );
  }

  const plan = build.architectPlan;

  return (
    <div>
      <h3 className="text-base font-semibold text-[#f1f5f9] mb-1">
        Architecture Plan: {objectiveTitle}
      </h3>
      <p className="text-xs text-white/40 mb-4">{plan.summary}</p>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white/[0.02] rounded-lg p-3">
          <h4 className="text-[0.65rem] uppercase tracking-widest text-blue-400 font-semibold mb-2">
            Features
          </h4>
          <ul className="space-y-1">
            {plan.features.map((f, i) => (
              <li key={i} className="text-xs text-white/60 flex items-start gap-1.5">
                <span className="text-blue-400 mt-0.5">•</span> {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white/[0.02] rounded-lg p-3">
          <h4 className="text-[0.65rem] uppercase tracking-widest text-red-400 font-semibold mb-2">
            Tech Stack
          </h4>
          <div className="space-y-1 text-xs text-white/60">
            <p><span className="text-white/30">Framework:</span> {plan.techStack.framework}</p>
            <p><span className="text-white/30">Styling:</span> {plan.techStack.styling}</p>
            {plan.techStack.other.map((t, i) => (
              <p key={i}><span className="text-white/30">+</span> {t}</p>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white/[0.02] rounded-lg p-3 mb-4">
        <h4 className="text-[0.65rem] uppercase tracking-widest text-white/30 font-semibold mb-2">
          File Structure
        </h4>
        <div className="font-mono text-xs text-white/40 space-y-0.5">
          {plan.fileStructure.map((f, i) => (
            <p key={i}>{f}</p>
          ))}
        </div>
      </div>

      <div className="bg-white/[0.02] rounded-lg p-3 mb-6">
        <h4 className="text-[0.65rem] uppercase tracking-widest text-white/30 font-semibold mb-2">
          Implementation Steps
        </h4>
        <ol className="space-y-1">
          {plan.implementationSteps.map((s, i) => (
            <li key={i} className="text-xs text-white/60 flex items-start gap-2">
              <span className="text-white/20 font-mono">{i + 1}.</span> {s}
            </li>
          ))}
        </ol>
      </div>

      {build.deployStatus === "planning" && (
        <button
          onClick={() => onApprove(build.id)}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Approve & Build
        </button>
      )}
    </div>
  );
}

"use client";

type Objective = {
  id: string;
  title: string;
  status: string;
};

type StepDeployProps = {
  objectiveTitle: string;
  deployUrl: string | null;
  deployStatus: string;
  otherObjectives: Objective[];
  onTackleAnother: (id: string) => void;
  onUploadNew: () => void;
};

export function StepDeploy({
  objectiveTitle,
  deployUrl,
  deployStatus,
  otherObjectives,
  onTackleAnother,
  onUploadNew,
}: StepDeployProps) {
  const draftObjectives = otherObjectives.filter((o) => o.status === "draft");

  return (
    <div>
      {deployStatus === "deploying" ? (
        <>
          <h3 className="text-base font-semibold text-[#f1f5f9] mb-1">
            Deploying: {objectiveTitle}
          </h3>
          <div className="flex items-center gap-3 py-8">
            <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-sm text-blue-300">Deploying to Vercel...</span>
          </div>
        </>
      ) : (
        <>
          <h3 className="text-base font-semibold text-[#f1f5f9] mb-1">
            Deployed: {objectiveTitle}
          </h3>

          {deployUrl && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-6">
              <p className="text-xs text-green-400 mb-2">Live at:</p>
              <a
                href={deployUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-green-300 underline hover:text-green-200 break-all"
              >
                {deployUrl}
              </a>
            </div>
          )}

          {draftObjectives.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs text-white/30 uppercase tracking-widest mb-2">
                Tackle another objective
              </h4>
              <div className="flex flex-wrap gap-2">
                {draftObjectives.map((obj) => (
                  <button
                    key={obj.id}
                    onClick={() => onTackleAnother(obj.id)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-white/[0.05] border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-colors"
                  >
                    {obj.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={onUploadNew}
            className="text-xs text-white/30 hover:text-white/50 transition-colors"
          >
            + Upload new meeting recording
          </button>
        </>
      )}
    </div>
  );
}

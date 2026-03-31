const STEPS = [
  { label: "Upload", key: "upload" },
  { label: "Objectives", key: "objectives" },
  { label: "Architect", key: "architect" },
  { label: "Build", key: "build" },
  { label: "Deploy", key: "deploy" },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

export function ProgressStepper({
  currentStep,
  completedSteps,
}: {
  currentStep: StepKey;
  completedSteps: StepKey[];
}) {
  return (
    <div className="flex items-center gap-0 mb-8 px-4 py-3 bg-white/[0.03] rounded-xl">
      {STEPS.map((step, i) => {
        const isCompleted = completedSteps.includes(step.key);
        const isCurrent = step.key === currentStep;

        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-1.5">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-content font-bold text-[0.6rem] text-white ${
                  isCompleted
                    ? "bg-gradient-to-br from-[#ef4444] to-[#dc2626]"
                    : isCurrent
                    ? "bg-gradient-to-br from-[#3b82f6] to-[#2563eb]"
                    : "bg-white/10"
                }`}
                style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                {isCompleted ? "✓" : i + 1}
              </div>
              <span
                className={`text-[0.7rem] font-medium ${
                  isCompleted
                    ? "text-red-400"
                    : isCurrent
                    ? "text-blue-300 font-semibold"
                    : "text-white/30"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 ${
                  isCompleted ? "bg-[#ef4444]" : "bg-white/10"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

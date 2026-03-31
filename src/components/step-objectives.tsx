"use client";

import { ObjectiveCard } from "./objective-card";
import { TranscriptViewer } from "./transcript-viewer";

type Objective = {
  id: string;
  title: string;
  description: string;
  priority: string | null;
  status: string;
};

type StepObjectivesProps = {
  objectives: Objective[];
  transcript: string | null;
  meetingStatus: string;
  onUpdate: () => void;
  onSelectObjective: (id: string) => void;
};

export function StepObjectives({
  objectives,
  transcript,
  meetingStatus,
  onUpdate,
  onSelectObjective,
}: StepObjectivesProps) {
  if (meetingStatus === "transcribing") {
    return (
      <div>
        <h3 className="text-base font-semibold text-[#f1f5f9] mb-1">Transcribing Audio</h3>
        <div className="flex items-center gap-3 py-8">
          <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-sm text-blue-300">Deepgram is processing your audio...</span>
        </div>
      </div>
    );
  }

  if (meetingStatus === "extracting") {
    return (
      <div>
        <h3 className="text-base font-semibold text-[#f1f5f9] mb-1">Extracting Objectives</h3>
        <div className="flex items-center gap-3 py-8">
          <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-sm text-blue-300">Claude is analyzing the transcript...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-base font-semibold text-[#f1f5f9] mb-1">Client Objectives</h3>
      <p className="text-xs text-white/40 mb-4">
        {objectives.length} objective{objectives.length !== 1 ? "s" : ""} extracted. Edit if needed, then select one to architect.
      </p>

      {objectives.map((obj) => (
        <ObjectiveCard
          key={obj.id}
          id={obj.id}
          title={obj.title}
          description={obj.description}
          priority={obj.priority}
          status={obj.status}
          onUpdate={onUpdate}
          onSelect={onSelectObjective}
        />
      ))}

      <TranscriptViewer transcript={transcript} />
    </div>
  );
}

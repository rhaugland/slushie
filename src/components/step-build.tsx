"use client";

import { useEffect, useState } from "react";

type StepBuildProps = {
  objectiveTitle: string;
  buildId: string;
  deployStatus: string;
  logs: string | null;
  onBuildComplete: () => void;
};

export function StepBuild({
  objectiveTitle,
  buildId,
  deployStatus,
  logs,
  onBuildComplete,
}: StepBuildProps) {
  const [status, setStatus] = useState(deployStatus);
  const [currentLogs, setCurrentLogs] = useState(logs);

  useEffect(() => {
    if (["live", "failed"].includes(status)) return;

    const eventSource = new EventSource(`/api/progress/build/${buildId}`);
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setStatus(data.status);
      if (data.message) setCurrentLogs(data.message);
      if (["deploying", "live"].includes(data.status)) {
        eventSource.close();
        onBuildComplete();
      }
    };
    eventSource.onerror = () => eventSource.close();

    return () => eventSource.close();
  }, [buildId, status, onBuildComplete]);

  return (
    <div>
      <h3 className="text-base font-semibold text-[#f1f5f9] mb-1">
        Building: {objectiveTitle}
      </h3>

      <div className="flex items-center gap-3 mb-4">
        <div
          className={`w-3 h-3 rounded-full ${
            status === "failed"
              ? "bg-red-500"
              : ["live", "deploying"].includes(status)
              ? "bg-green-500"
              : "bg-blue-500 animate-pulse"
          }`}
        />
        <span
          className={`text-sm ${
            status === "failed"
              ? "text-red-400"
              : ["live", "deploying"].includes(status)
              ? "text-green-400"
              : "text-blue-300"
          }`}
        >
          {status === "building" && "Build bot is generating code..."}
          {status === "deploying" && "Deploying to Vercel..."}
          {status === "live" && "Build complete!"}
          {status === "failed" && "Build failed"}
        </span>
      </div>

      {currentLogs && (
        <div className="bg-black/30 rounded-lg p-3 font-mono text-xs text-white/40 max-h-48 overflow-y-auto">
          <pre className="whitespace-pre-wrap">{currentLogs}</pre>
        </div>
      )}
    </div>
  );
}

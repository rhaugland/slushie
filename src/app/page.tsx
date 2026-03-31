"use client";

import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/sidebar";
import { ClientHeader } from "@/components/client-header";
import { ProgressStepper, StepKey } from "@/components/progress-stepper";
import { StepUpload } from "@/components/step-upload";
import { StepObjectives } from "@/components/step-objectives";
import { StepArchitect } from "@/components/step-architect";

type ArchitectPlan = {
  summary: string;
  features: string[];
  techStack: { framework: string; styling: string; other: string[] };
  fileStructure: string[];
  implementationSteps: string[];
};
type Build = { id: string; deployUrl: string | null; deployStatus: string; architectPlan: ArchitectPlan };
type Objective = { id: string; title: string; description: string; priority: string | null; status: string; builds: Build[] };
type Meeting = { id: string; status: string; createdAt: string; transcript?: string | null; objectives: Objective[] };
type Client = {
  id: string;
  name: string;
  firm: string;
  meetings: Meeting[];
};

function deriveStep(client: Client): { current: StepKey; completed: StepKey[] } {
  const meetings = client.meetings;
  if (meetings.length === 0) return { current: "upload", completed: [] };

  const latestMeeting = meetings[0];
  const objectives = latestMeeting.objectives;
  const completed: StepKey[] = ["upload"];

  if (latestMeeting.status !== "ready" && objectives.length === 0) {
    return { current: "objectives", completed };
  }

  if (objectives.length > 0) completed.push("objectives");

  const activeObj = objectives.find((o) =>
    ["selected", "architecting", "building", "deployed"].includes(o.status)
  );

  if (!activeObj) return { current: "architect", completed };

  if (activeObj.status === "architecting" || activeObj.status === "selected") {
    return { current: "architect", completed };
  }

  completed.push("architect");

  if (activeObj.status === "building") {
    return { current: "build", completed };
  }

  if (activeObj.builds.some((b) => b.deployStatus === "live")) {
    completed.push("build", "deploy");
    return { current: "deploy", completed };
  }

  if (activeObj.builds.some((b) => b.deployStatus === "deploying")) {
    completed.push("build");
    return { current: "deploy", completed };
  }

  return { current: "build", completed };
}

export default function Home() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    const res = await fetch("/api/clients");
    const data = await res.json();
    setClients(data);
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const selected = clients.find((c) => c.id === selectedId) || null;

  const allObjectives = selected?.meetings.flatMap((m) => m.objectives) || [];
  const deployedCount = allObjectives.flatMap((o) => o.builds).filter((b) => b.deployUrl).length;

  const stepInfo = selected ? deriveStep(selected) : null;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        clients={clients}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onClientCreated={loadClients}
      />
      <main className="flex-1 p-6">
        {selected && stepInfo ? (
          <div>
            <ClientHeader
              name={selected.name}
              firm={selected.firm}
              objectiveCount={allObjectives.length}
              deployedCount={deployedCount}
            />
            <ProgressStepper
              currentStep={stepInfo.current}
              completedSteps={stepInfo.completed}
            />
            <div className="bg-white/[0.03] rounded-xl p-6 border border-white/[0.08]">
              <div className="text-[0.6rem] uppercase tracking-widest text-blue-500 font-semibold mb-2">
                Step · {stepInfo.current}
              </div>
              {stepInfo.current === "upload" && (
                <StepUpload clientId={selected.id} onUploadComplete={loadClients} />
              )}
              {stepInfo.current === "objectives" && selected.meetings[0] && (
                <StepObjectives
                  objectives={selected.meetings[0].objectives}
                  transcript={selected.meetings[0].transcript ?? null}
                  meetingStatus={selected.meetings[0].status}
                  onUpdate={loadClients}
                  onSelectObjective={async (id) => {
                    await fetch(`/api/objectives/${id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "selected" }),
                    });
                    loadClients();
                  }}
                />
              )}
              {stepInfo.current === "architect" && (() => {
                const activeObj = selected.meetings
                  .flatMap((m) => m.objectives)
                  .find((o) => ["selected", "architecting"].includes(o.status) || o.builds.length > 0);
                if (!activeObj) return <p className="text-sm text-white/50">Select an objective first.</p>;
                const latestBuild = activeObj.builds[activeObj.builds.length - 1] || null;
                return (
                  <StepArchitect
                    objectiveTitle={activeObj.title}
                    objectiveStatus={activeObj.status}
                    build={latestBuild}
                    onApprove={async (buildId) => {
                      await fetch(`/api/builds/${buildId}/approve`, { method: "POST" });
                      loadClients();
                    }}
                  />
                );
              })()}
              {!["upload", "objectives", "architect"].includes(stepInfo.current) && (
                <p className="text-sm text-white/50">Step content coming soon...</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-white/50">Select or create a client to get started.</p>
        )}
      </main>
    </div>
  );
}

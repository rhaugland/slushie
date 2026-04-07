"use client";

import { useState, useEffect } from "react";

type WorkspaceMembership = {
  workspaceId: string;
  role: string;
  workspace: { id: string; name: string; slug: string; clients: any[] };
};

type Props = {
  workspaces: WorkspaceMembership[];
};

export function PaneClientView({ workspaces }: Props) {
  const allProjects = workspaces.flatMap((m) =>
    m.workspace.clients.flatMap((c: any) =>
      (c.projects || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        clientName: c.name,
        deployUrl: p.deployUrl,
        deployStatus: p.deployStatus,
      }))
    )
  );

  const [filterProject, setFilterProject] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [clientCreds, setClientCreds] = useState<Record<string, { email: string; password: string }>>({});

  // Auto-create client access users for each project on mount
  useEffect(() => {
    allProjects.forEach(async (project) => {
      try {
        const res = await fetch(`/api/projects/${project.id}/client-access`, { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          setClientCreds((prev) => ({ ...prev, [project.id]: { email: data.email, password: data.password } }));
        }
      } catch { /* ignore */ }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allProjects.length]);

  const filtered = filterProject
    ? allProjects.filter((p) => p.id === filterProject)
    : allProjects;

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  function copyToClipboard(text: string, projectId: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(projectId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-[#f1f5f9]">Client View</h1>
      </div>

      <div className="mb-4">
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/20"
        >
          <option value="" className="bg-[#0c1120]">All projects</option>
          {allProjects.map((p) => (
            <option key={p.id} value={p.id} className="bg-[#0c1120]">
              {p.clientName} / {p.name}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-white/30">No projects found.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((project) => {
            const portalUrl = `${baseUrl}/portal/${project.id}`;
            const loginUrl = `${baseUrl}/portal/login`;

            return (
              <div
                key={project.id}
                className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-medium text-white/80">{project.name}</h3>
                    <p className="text-[0.65rem] text-white/30">{project.clientName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {project.deployStatus === "running" ? (
                      <span className="text-[0.6rem] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 font-medium">
                        Live
                      </span>
                    ) : (
                      <span className="text-[0.6rem] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-white/30 font-medium">
                        {project.deployStatus || "stopped"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Portal Link */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="text-[0.6rem] uppercase tracking-widest text-white/30">Portal Link</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs text-blue-400 bg-white/[0.04] border border-white/[0.06] rounded px-3 py-2 truncate">
                      {portalUrl}
                    </code>
                    <button
                      onClick={() => copyToClipboard(portalUrl, project.id + "-portal")}
                      className="px-3 py-2 text-xs rounded-lg bg-white/[0.08] text-white/60 hover:text-white/80 hover:bg-white/[0.12] transition-colors shrink-0"
                    >
                      {copiedId === project.id + "-portal" ? "Copied!" : "Copy"}
                    </button>
                    <a
                      href={portalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 text-xs rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 transition-colors shrink-0"
                    >
                      Open
                    </a>
                  </div>
                </div>

                {/* Login Link */}
                <div className="mt-3 space-y-2">
                  <div className="text-[0.6rem] uppercase tracking-widest text-white/30">Client Login</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs text-white/50 bg-white/[0.04] border border-white/[0.06] rounded px-3 py-2 truncate">
                      {loginUrl}
                    </code>
                    <button
                      onClick={() => copyToClipboard(loginUrl, project.id + "-login")}
                      className="px-3 py-2 text-xs rounded-lg bg-white/[0.08] text-white/60 hover:text-white/80 hover:bg-white/[0.12] transition-colors shrink-0"
                    >
                      {copiedId === project.id + "-login" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>

                {/* Client Credentials */}
                {clientCreds[project.id] && (
                  <div className="mt-3 space-y-2">
                    <div className="text-[0.6rem] uppercase tracking-widest text-white/30">Client Credentials</div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[0.6rem] text-white/30 w-14 shrink-0">Email</span>
                        <code className="flex-1 text-xs text-white/50 bg-white/[0.04] border border-white/[0.06] rounded px-3 py-1.5 truncate">
                          {clientCreds[project.id].email}
                        </code>
                        <button
                          onClick={() => copyToClipboard(clientCreds[project.id].email, project.id + "-cred-email")}
                          className="px-2.5 py-1.5 text-xs rounded-lg bg-white/[0.08] text-white/60 hover:text-white/80 hover:bg-white/[0.12] transition-colors shrink-0"
                        >
                          {copiedId === project.id + "-cred-email" ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[0.6rem] text-white/30 w-14 shrink-0">Password</span>
                        <code className="flex-1 text-xs text-white/50 bg-white/[0.04] border border-white/[0.06] rounded px-3 py-1.5 truncate">
                          {clientCreds[project.id].password}
                        </code>
                        <button
                          onClick={() => copyToClipboard(clientCreds[project.id].password, project.id + "-cred-pass")}
                          className="px-2.5 py-1.5 text-xs rounded-lg bg-white/[0.08] text-white/60 hover:text-white/80 hover:bg-white/[0.12] transition-colors shrink-0"
                        >
                          {copiedId === project.id + "-cred-pass" ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Deploy URL if available */}
                {project.deployUrl && (
                  <div className="mt-3 space-y-2">
                    <div className="text-[0.6rem] uppercase tracking-widest text-white/30">Deploy Preview</div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs text-green-400/70 bg-white/[0.04] border border-white/[0.06] rounded px-3 py-2 truncate">
                        {project.deployUrl}
                      </code>
                      <a
                        href={project.deployUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 text-xs rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 hover:text-green-300 transition-colors shrink-0"
                      >
                        Open
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

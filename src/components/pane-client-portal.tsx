"use client";

import { useState, useEffect } from "react";

type WorkspaceMembership = {
  workspaceId: string;
  role: string;
  workspace: { id: string; name: string; slug: string; clients: any[] };
};

type Props = {
  workspaces: WorkspaceMembership[];
  projectId?: string | null;
};

export function PaneClientView({ workspaces, projectId: projectIdProp }: Props) {
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

  const [selectedProjectId, setSelectedProjectId] = useState<string>(allProjects[0]?.id || "");
  useEffect(() => {
    if (projectIdProp) setSelectedProjectId(projectIdProp);
  }, [projectIdProp]);

  const project = allProjects.find((p) => p.id === selectedProjectId);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [clientCreds, setClientCreds] = useState<{ email: string; password: string } | null>(null);
  const [loadingCreds, setLoadingCreds] = useState(false);

  // Invite flow state
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<{
    inviteUrl: string;
    email: string;
    password: string;
    projectName: string;
  } | null>(null);
  const [inviteError, setInviteError] = useState("");

  // Create/load client access for selected project
  useEffect(() => {
    if (!selectedProjectId) return;
    setClientCreds(null);
    setLoadingCreds(true);
    fetch(`/api/projects/${selectedProjectId}/client-access`, { method: "POST" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data) setClientCreds({ email: data.email, password: data.password }); })
      .catch(() => {})
      .finally(() => setLoadingCreds(false));
  }, [selectedProjectId]);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const portalUrl = `${baseUrl}/portal/${selectedProjectId}`;
  const loginUrl = `${baseUrl}/portal/login`;

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function copyAll() {
    const lines = [
      `Here's your access to the ${project?.name || "project"} portal:`,
      ``,
      `Portal: ${portalUrl}`,
      `Login: ${loginUrl}`,
    ];
    if (clientCreds) {
      lines.push(`Email: ${clientCreds.email}`);
      lines.push(`Password: ${clientCreds.password}`);
    }
    if (project?.deployUrl) {
      lines.push(``, `Live Preview: ${project.deployUrl}`);
    }
    copy(lines.join("\n"), "all");
  }

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || !selectedProjectId) return;
    setInviteLoading(true);
    setInviteError("");
    setInviteResult(null);
    try {
      const res = await fetch(`/api/projects/${selectedProjectId}/invite-client`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setInviteError(data.error || "Failed to create invite");
        return;
      }
      const data = await res.json();
      setInviteResult(data);
    } catch {
      setInviteError("Failed to create invite");
    } finally {
      setInviteLoading(false);
    }
  }

  function copyInviteMessage() {
    if (!inviteResult) return;
    const lines = [
      `You've been invited to preview ${inviteResult.projectName}!`,
      ``,
      `Sign in here: ${inviteResult.inviteUrl}`,
      `Password: ${inviteResult.password}`,
    ];
    copy(lines.join("\n"), "invite-msg");
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-white/30">No project selected.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header with Copy All + Send Invite */}
      <div className="flex items-center gap-2 mb-6">
        <div className="flex-1" />
        <button
          onClick={() => { setShowInviteForm(!showInviteForm); setInviteResult(null); setInviteError(""); }}
          className="px-4 py-2 text-sm rounded-lg bg-white/[0.08] text-white/70 hover:text-white/90 font-medium transition-colors"
        >
          {showInviteForm ? "Cancel" : "Send Invite"}
        </button>
        <button
          onClick={copyAll}
          className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white font-medium hover:opacity-90 transition-opacity"
        >
          {copiedId === "all" ? "Copied!" : "Copy Client Access"}
        </button>
      </div>

      {/* Invite Form */}
      {showInviteForm && (
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5 mb-4 space-y-4">
          <div className="text-[0.6rem] uppercase tracking-widest text-white/30">Invite Client by Email</div>
          {!inviteResult ? (
            <form onSubmit={handleSendInvite} className="flex items-center gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="client@example.com"
                required
                className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20"
              />
              <button
                type="submit"
                disabled={inviteLoading}
                className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
              >
                {inviteLoading ? "Creating..." : "Create Invite"}
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-green-400/80">Invite created for {inviteResult.email}</div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[0.6rem] text-white/30 w-16 shrink-0">Link</span>
                  <code className="flex-1 text-xs text-blue-400 bg-white/[0.04] border border-white/[0.06] rounded px-3 py-1.5 truncate">
                    {inviteResult.inviteUrl}
                  </code>
                  <button
                    onClick={() => copy(inviteResult.inviteUrl, "invite-url")}
                    className="px-2.5 py-1.5 text-xs rounded-lg bg-white/[0.08] text-white/60 hover:text-white/80 transition-colors shrink-0"
                  >
                    {copiedId === "invite-url" ? "Copied!" : "Copy"}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[0.6rem] text-white/30 w-16 shrink-0">Password</span>
                  <code className="flex-1 text-xs text-white/50 bg-white/[0.04] border border-white/[0.06] rounded px-3 py-1.5 truncate">
                    {inviteResult.password}
                  </code>
                  <button
                    onClick={() => copy(inviteResult.password, "invite-pass")}
                    className="px-2.5 py-1.5 text-xs rounded-lg bg-white/[0.08] text-white/60 hover:text-white/80 transition-colors shrink-0"
                  >
                    {copiedId === "invite-pass" ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
              <button
                onClick={copyInviteMessage}
                className="w-full py-2 text-sm rounded-lg bg-white/[0.06] text-white/60 hover:text-white/80 transition-colors"
              >
                {copiedId === "invite-msg" ? "Copied!" : "Copy Full Invite Message"}
              </button>
            </div>
          )}
          {inviteError && <p className="text-xs text-red-400">{inviteError}</p>}
        </div>
      )}

      {/* Single card with all info */}
      <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-6 space-y-5">
        {/* Project header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-white/80">{project.name}</h3>
            <p className="text-[0.65rem] text-white/30">{project.clientName}</p>
          </div>
          {project.deployStatus === "running" ? (
            <span className="text-[0.6rem] px-2 py-1 rounded-full bg-green-500/10 text-green-400 font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Live
            </span>
          ) : (
            <span className="text-[0.6rem] px-2 py-1 rounded-full bg-white/[0.06] text-white/30 font-medium">
              {project.deployStatus || "Stopped"}
            </span>
          )}
        </div>

        {/* Portal Link */}
        <div>
          <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-1.5">Portal Link</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-blue-400 bg-white/[0.04] border border-white/[0.06] rounded px-3 py-2 truncate">
              {portalUrl}
            </code>
            <button
              onClick={() => copy(portalUrl, "portal")}
              className="px-3 py-2 text-xs rounded-lg bg-white/[0.08] text-white/60 hover:text-white/80 transition-colors shrink-0"
            >
              {copiedId === "portal" ? "Copied!" : "Copy"}
            </button>
            <a
              href={portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 text-xs rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors shrink-0"
            >
              Open
            </a>
          </div>
        </div>

        {/* Login + Credentials */}
        <div>
          <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-1.5">Client Login</div>
          <div className="flex items-center gap-2 mb-2">
            <code className="flex-1 text-xs text-white/50 bg-white/[0.04] border border-white/[0.06] rounded px-3 py-2 truncate">
              {loginUrl}
            </code>
            <button
              onClick={() => copy(loginUrl, "login")}
              className="px-3 py-2 text-xs rounded-lg bg-white/[0.08] text-white/60 hover:text-white/80 transition-colors shrink-0"
            >
              {copiedId === "login" ? "Copied!" : "Copy"}
            </button>
          </div>
          {loadingCreds ? (
            <div className="text-[0.6rem] text-white/20">Loading credentials...</div>
          ) : clientCreds ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[0.6rem] text-white/30 w-14 shrink-0">Email</span>
                <code className="flex-1 text-xs text-white/50 bg-white/[0.04] border border-white/[0.06] rounded px-3 py-1.5 truncate">
                  {clientCreds.email}
                </code>
                <button
                  onClick={() => copy(clientCreds.email, "email")}
                  className="px-2.5 py-1.5 text-xs rounded-lg bg-white/[0.08] text-white/60 hover:text-white/80 transition-colors shrink-0"
                >
                  {copiedId === "email" ? "Copied!" : "Copy"}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[0.6rem] text-white/30 w-14 shrink-0">Password</span>
                <code className="flex-1 text-xs text-white/50 bg-white/[0.04] border border-white/[0.06] rounded px-3 py-1.5 truncate">
                  {clientCreds.password}
                </code>
                <button
                  onClick={() => copy(clientCreds.password, "pass")}
                  className="px-2.5 py-1.5 text-xs rounded-lg bg-white/[0.08] text-white/60 hover:text-white/80 transition-colors shrink-0"
                >
                  {copiedId === "pass" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Deploy Preview */}
        {project.deployUrl && (
          <div>
            <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-1.5">Live Preview</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs text-green-400/70 bg-white/[0.04] border border-white/[0.06] rounded px-3 py-2 truncate">
                {project.deployUrl}
              </code>
              <button
                onClick={() => copy(project.deployUrl, "deploy")}
                className="px-3 py-2 text-xs rounded-lg bg-white/[0.08] text-white/60 hover:text-white/80 transition-colors shrink-0"
              >
                {copiedId === "deploy" ? "Copied!" : "Copy"}
              </button>
              <a
                href={project.deployUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 text-xs rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors shrink-0"
              >
                Open
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

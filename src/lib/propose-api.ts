async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  const contentType = res.headers.get("Content-Type") ?? "";
  if (contentType.includes("json")) return res.json();
  return res.text() as any;
}

// Ensure user exists in Scoper DB
export const ensureUser = (email?: string) =>
  request<{ userId: string }>("/api/propose/auth/ensure-user", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

// Projects
export const listProposeProjects = () =>
  request<any[]>("/api/propose/projects");

export const createProposeProject = (name: string, clientName?: string) =>
  request<any>("/api/propose/projects", {
    method: "POST",
    body: JSON.stringify({ name, clientName }),
  });

export const getProposeProject = (id: string) =>
  request<any>(`/api/propose/projects/${id}`);

// Inputs
export const addInput = (projectId: string, content: string, source?: string) =>
  request<any>(`/api/propose/projects/${projectId}/inputs`, {
    method: "POST",
    body: JSON.stringify({ content, source }),
  });

export const listInputs = (projectId: string) =>
  request<any[]>(`/api/propose/projects/${projectId}/inputs`);

// Scoping
export const startScoping = (projectId: string) =>
  request<any>(`/api/propose/scoping/${projectId}/start`, { method: "POST" });

export const getScopeState = (scopeId: string) =>
  request<any>(`/api/propose/scoping/${scopeId}/state`);

export const listScopes = (projectId: string) =>
  request<any[]>(`/api/propose/scoping/${projectId}/scopes`);

export const answerQuestion = (questionId: string, answer?: string, skipped?: boolean) =>
  request<any>(`/api/propose/scoping/questions/${questionId}/answer`, {
    method: "POST",
    body: JSON.stringify({ answer, skipped }),
  });

export const completeScope = (scopeId: string, answers: { questionId: string; answer: string }[]) =>
  request<{ ok: boolean }>(`/api/propose/scoping/${scopeId}/complete`, {
    method: "POST",
    body: JSON.stringify({ answers }),
  });

export const updateScopeItem = (itemId: string, data: {
  optimisticHours?: number;
  likelyHours?: number;
  pessimisticHours?: number;
  phase?: string;
  deliverable?: string;
  sortOrder?: number;
}) =>
  request<any>(`/api/propose/scoping/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

export const addScopeItem = (scopeId: string, phase: string, deliverable: string, hours?: { optimistic?: number; likely?: number; pessimistic?: number }) =>
  request<any>(`/api/propose/scoping/items`, {
    method: "POST",
    body: JSON.stringify({ scopeId, phase, deliverable, optimisticHours: hours?.optimistic ?? 0, likelyHours: hours?.likely ?? 0, pessimisticHours: hours?.pessimistic ?? 0 }),
  });

export const deleteScopeItem = (itemId: string) =>
  request<any>(`/api/propose/scoping/items/${itemId}`, { method: "DELETE" });

export const renamePhase = (scopeId: string, oldName: string, newName: string) =>
  request<any>(`/api/propose/scoping/${scopeId}/rename-phase`, {
    method: "PATCH",
    body: JSON.stringify({ oldName, newName }),
  });

// Assumptions
export const addAssumption = (scopeId: string, content: string, status?: string) =>
  request<any>(`/api/propose/scoping/assumptions`, {
    method: "POST",
    body: JSON.stringify({ scopeId, content, status }),
  });

export const updateAssumption = (id: string, data: { content?: string; status?: string }) =>
  request<any>(`/api/propose/scoping/assumptions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

export const deleteAssumption = (id: string) =>
  request<any>(`/api/propose/scoping/assumptions/${id}`, { method: "DELETE" });

// Risks
export const addRisk = (scopeId: string, content: string, severity: string, mitigation?: string) =>
  request<any>(`/api/propose/scoping/risks`, {
    method: "POST",
    body: JSON.stringify({ scopeId, content, severity, mitigation }),
  });

export const updateRisk = (id: string, data: { content?: string; severity?: string; mitigation?: string }) =>
  request<any>(`/api/propose/scoping/risks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

export const deleteRisk = (id: string) =>
  request<any>(`/api/propose/scoping/risks/${id}`, { method: "DELETE" });

// Proposals
export async function generateProposal(
  projectId: string,
  pricingMode: "per_phase" | "retainer" = "per_phase",
  retainerMonths?: number
): Promise<Blob> {
  const res = await fetch(`/api/propose/proposals/${projectId}/generate`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pricingMode, retainerMonths }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.blob();
}

// Export
export const exportMarkdown = (projectId: string) =>
  request<string>(`/api/propose/export/${projectId}/markdown`);

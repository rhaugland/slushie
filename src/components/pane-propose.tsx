"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import * as api from "@/lib/propose-api";

interface Question {
  id: string;
  content: string;
  answer: string | null;
  skipped: boolean;
  scopeImpact: string;
  riskLevel: string;
  forClient: boolean;
}

interface ScopeItem {
  id: string;
  phase: string;
  deliverable: string;
  optimisticHours: number;
  likelyHours: number;
  pessimisticHours: number;
  confidence: number;
}

interface Assumption {
  id: string;
  content: string;
  status: string;
}

interface Risk {
  id: string;
  content: string;
  severity: string;
  mitigation: string | null;
}

type WorkspaceMembership = {
  workspaceId: string;
  role: string;
  workspace: { id: string; name: string; slug: string; clients: any[] };
};

type Props = {
  workspaces: WorkspaceMembership[];
  projectId?: string | null;
  onStartBilling?: (data: { monthlyAmount: number; totalMonths: number }) => void;
};

type ProjectInfo = {
  id: string;
  name: string;
  clientName: string;
  slushieProjectId: string;
};

export function PanePropose({ workspaces, projectId, onStartBilling }: Props) {
  const allProjects = workspaces.flatMap((m) =>
    m.workspace.clients.flatMap((c: any) =>
      (c.projects || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        clientName: c.name,
      }))
    )
  );

  // View state
  const [selectedSlushieProject, setSelectedSlushieProject] = useState<string>("");

  const autoSelectedRef = useRef(false);

  const [scoperProject, setScoperProject] = useState<any>(null);
  const [phase, setPhase] = useState<"select" | "input" | "scoping" | "complete">("select");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userSynced, setUserSynced] = useState(false);

  // Input state
  const [inputs, setInputs] = useState<any[]>([]);
  const [inputText, setInputText] = useState("");
  const [inputSource, setInputSource] = useState("call_notes");
  const [notesSynced, setNotesSynced] = useState(0);
  const [syncingNotes, setSyncingNotes] = useState(false);

  // Scoping state
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [scopeItems, setScopeItems] = useState<ScopeItem[]>([]);
  const [assumptions, setAssumptions] = useState<Assumption[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [summary, setSummary] = useState("");
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const answerInputRef = useRef<HTMLTextAreaElement>(null);

  // Editing state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editHours, setEditHours] = useState({ optimistic: 0, likely: 0, pessimistic: 0 });
  const [editingDeliverable, setEditingDeliverable] = useState<string | null>(null);
  const [editDeliverableName, setEditDeliverableName] = useState("");
  const [editingPhase, setEditingPhase] = useState<string | null>(null);
  const [editPhaseName, setEditPhaseName] = useState("");
  const [addingItemToPhase, setAddingItemToPhase] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({ deliverable: "", optimistic: 0, likely: 0, pessimistic: 0 });

  // Assumptions editing
  const [editingAssumptionId, setEditingAssumptionId] = useState<string | null>(null);
  const [editAssumption, setEditAssumption] = useState({ content: "", status: "unresolved" });
  const [addingAssumption, setAddingAssumption] = useState(false);
  const [newAssumption, setNewAssumption] = useState("");

  // Risks editing
  const [editingRiskId, setEditingRiskId] = useState<string | null>(null);
  const [editRisk, setEditRisk] = useState({ content: "", severity: "medium", mitigation: "" });
  const [addingRisk, setAddingRisk] = useState(false);
  const [newRisk, setNewRisk] = useState({ content: "", severity: "medium", mitigation: "" });

  // Section toggles
  const [scopeOpen, setScopeOpen] = useState(true);
  const [assumptionsOpen, setAssumptionsOpen] = useState(true);
  const [risksOpen, setRisksOpen] = useState(true);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);

  // Cost
  const [costPerHour, setCostPerHour] = useState(150);
  const [retainerMonths, setRetainerMonths] = useState(6);

  // Proposal
  const [generatingProposal, setGeneratingProposal] = useState(false);

  // Change order detection
  const [newNotesCount, setNewNotesCount] = useState(0);
  const [updatingScope, setUpdatingScope] = useState(false);
  const [lastScopeInputCount, setLastScopeInputCount] = useState(0);


  // Ensure user exists in Scoper on mount
  useEffect(() => {
    if (userSynced) return;
    api.ensureUser().then(() => setUserSynced(true)).catch(() => setUserSynced(true));
  }, [userSynced]);

  // Select a slushie project -> create/find scoper project, sync notes
  async function handleSelectProject(slushieProjectId: string) {
    setSelectedSlushieProject(slushieProjectId);
    setError("");
    setLoading(true);

    const proj = allProjects.find((p) => p.id === slushieProjectId);
    if (!proj) { setLoading(false); return; }

    try {
      // Check if a Scoper project already exists for this
      const existing = await api.listProposeProjects();
      let scoper = existing.find((p: any) => p.name === proj.name && p.clientName === proj.clientName);

      if (!scoper) {
        scoper = await api.createProposeProject(proj.name, proj.clientName);
      }

      setScoperProject(scoper);

      // Load existing inputs
      const existingInputs = await api.listInputs(scoper.id);
      setInputs(existingInputs);

      // Check for existing scopes
      const scopes = await api.listScopes(scoper.id);
      const hasExistingScope = scopes.length > 0;

      // Remember input count before syncing (this is what the last scope was based on)
      const inputCountBeforeSync = existingInputs.length;

      // Sync slushie notes as Scoper inputs
      const newlySynced = await syncNotes(slushieProjectId, scoper.id, existingInputs);

      if (hasExistingScope) {
        const activeScope = scopes[0];
        setScopeId(activeScope.id);
        const state = await api.getScopeState(activeScope.id);
        setScopeItems(state.scopeItems || []);
        setAssumptions(state.assumptions || []);
        setRisks(state.risks || []);
        setQuestions(state.questions || []);
        setSummary(state.draft?.summary || "");
        setLastScopeInputCount(inputCountBeforeSync);

        // If new notes were synced, show the change order banner
        if (newlySynced > 0) {
          setNewNotesCount(newlySynced);
        }

        if (scoper.status === "complete" || scoper.status === "delivered") {
          setPhase("complete");
        } else {
          setPhase("scoping");
        }
      } else {
        setPhase("input");
      }
    } catch (err: any) {
      setError(err.message || "Failed to set up project");
      setPhase("select");
    } finally {
      setLoading(false);
    }
  }

  // Auto-select the current project if projectId is provided
  useEffect(() => {
    if (projectId && !autoSelectedRef.current && phase === "select" && userSynced) {
      autoSelectedRef.current = true;
      handleSelectProject(projectId);
    }
  }, [projectId, phase, userSynced]);

  async function syncNotes(slushieProjectId: string, scoperProjectId: string, existingInputs: any[]): Promise<number> {
    setSyncingNotes(true);
    try {
      const res = await fetch(`/api/notes?projectId=${slushieProjectId}`, { cache: "no-store" });
      if (!res.ok) { setSyncingNotes(false); return 0; }
      const notes = await res.json();

      let synced = 0;
      for (const note of notes) {
        if (note.status !== "ready" && note.status !== "complete") continue;

        const parts: string[] = [];
        if (note.summary) parts.push(`## Summary\n${note.summary}`);
        if (note.transcript) parts.push(`## Transcript\n${note.transcript}`);
        if (note.textContent && !note.transcript) parts.push(`## Notes\n${note.textContent}`);

        if (parts.length === 0) continue;

        const content = parts.join("\n\n");
        // Skip if we already have an input with this exact content
        if (existingInputs.some((i: any) => i.content === content)) continue;

        await api.addInput(scoperProjectId, content, "call_notes");
        synced++;
      }

      if (synced > 0) {
        const updated = await api.listInputs(scoperProjectId);
        setInputs(updated);
      }
      setNotesSynced(synced);
      return synced;
    } catch {
      // Non-critical, continue
      return 0;
    } finally {
      setSyncingNotes(false);
    }
  }

  async function handleAddInput(e: React.FormEvent) {
    e.preventDefault();
    if (!inputText.trim() || !scoperProject) return;
    const input = await api.addInput(scoperProject.id, inputText, inputSource);
    setInputs([...inputs, input]);
    setInputText("");
  }

  async function handleStartScoping() {
    if (inputs.length === 0 || !scoperProject) return;
    setLoading(true);
    try {
      const result = await api.startScoping(scoperProject.id);
      setScopeId(result.scopeId);
      setSummary(result.draft?.summary || "");
      setPhase("scoping");
      setLastScopeInputCount(inputs.length);
      setNewNotesCount(0);

      const state = await api.getScopeState(result.scopeId);
      setScopeItems(state.scopeItems || []);
      setAssumptions(state.assumptions || []);
      setRisks(state.risks || []);
      setQuestions(state.questions || []);
    } catch (err: any) {
      setError(err.message || "Failed to start scoping");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateScope() {
    if (!scoperProject) return;
    setUpdatingScope(true);
    setError("");
    try {
      // Re-scope with all inputs (including the newly synced ones)
      const result = await api.startScoping(scoperProject.id);
      setScopeId(result.scopeId);
      setSummary(result.draft?.summary || "");
      setLastScopeInputCount(inputs.length);
      setNewNotesCount(0);

      const state = await api.getScopeState(result.scopeId);
      setScopeItems(state.scopeItems || []);
      setAssumptions(state.assumptions || []);
      setRisks(state.risks || []);
      setQuestions(state.questions || []);
      setPhase("scoping");
    } catch (err: any) {
      setError(err.message || "Failed to update scope");
    } finally {
      setUpdatingScope(false);
    }
  }

  async function handleAnswer(questionId: string, answer?: string, skipped?: boolean) {
    setLoading(true);
    try {
      const result = await api.answerQuestion(questionId, answer, skipped);
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === questionId ? { ...q, answer: answer ?? null, skipped: skipped ?? false } : q
        )
      );

      if (result.scopeComplete) setPhase("complete");

      if (scopeId) {
        const state = await api.getScopeState(scopeId);
        setScopeItems(state.scopeItems || []);
        setAssumptions(state.assumptions || []);
        setRisks(state.risks || []);
        const existingIds = new Set(questions.map((q) => q.id));
        const newQuestions = (state.questions || []).filter((q: Question) => !existingIds.has(q.id));
        if (newQuestions.length > 0) {
          setQuestions((prev) => [
            ...prev.map((q) =>
              q.id === questionId ? { ...q, answer: answer ?? null, skipped: skipped ?? false } : q
            ),
            ...newQuestions,
          ]);
        }
      }
    } finally {
      setLoading(false);
      setCurrentAnswer("");
    }
  }

  async function handleAnswerAllAndFinish() {
    if (!scopeId) return;
    setLoading(true);
    try {
      const unanswered = questions.filter((q) => !q.answer && !q.skipped);
      const answers = unanswered.map((q) => ({
        questionId: q.id,
        answer: "Standard approach is fine. Use reasonable defaults.",
      }));

      await api.completeScope(scopeId, answers);

      setQuestions((prev) =>
        prev.map((q) => {
          const filled = answers.find((a) => a.questionId === q.id);
          return filled ? { ...q, answer: filled.answer, skipped: false } : q;
        })
      );

      const state = await api.getScopeState(scopeId);
      setScopeItems(state.scopeItems || []);
      setAssumptions(state.assumptions || []);
      setRisks(state.risks || []);
      setPhase("complete");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveHours(itemId: string, hours?: { optimistic: number; likely: number; pessimistic: number }) {
    const h = hours ?? editHours;
    if (scopeId !== "dummy-scope") {
      await api.updateScopeItem(itemId, {
        optimisticHours: h.optimistic,
        likelyHours: h.likely,
        pessimisticHours: h.pessimistic,
      });
    }
    setScopeItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, optimisticHours: h.optimistic, likelyHours: h.likely, pessimisticHours: h.pessimistic }
          : item
      )
    );
    if (!hours) setEditingItemId(null);
  }

  const isDummy = scopeId === "dummy-scope";

  async function handleRenamePhase(oldName: string) {
    if (!editPhaseName.trim() || editPhaseName === oldName || !scopeId) return;
    if (!isDummy) await api.renamePhase(scopeId, oldName, editPhaseName);
    setScopeItems((prev) => prev.map((item) => item.phase === oldName ? { ...item, phase: editPhaseName } : item));
    setEditingPhase(null);
  }

  async function handleSaveDeliverable(itemId: string) {
    if (!editDeliverableName.trim()) return;
    if (!isDummy) await api.updateScopeItem(itemId, { deliverable: editDeliverableName });
    setScopeItems((prev) => prev.map((item) => item.id === itemId ? { ...item, deliverable: editDeliverableName } : item));
    setEditingDeliverable(null);
  }

  async function handleAddScopeItem(phaseName: string) {
    if (!newItem.deliverable.trim() || !scopeId) return;
    let id = `si-${Date.now()}`;
    if (!isDummy) {
      const created = await api.addScopeItem(scopeId, phaseName, newItem.deliverable, {
        optimistic: newItem.optimistic,
        likely: newItem.likely,
        pessimistic: newItem.pessimistic,
      });
      id = created.id;
    }
    setScopeItems((prev) => [...prev, { id, phase: phaseName, deliverable: newItem.deliverable, optimisticHours: newItem.optimistic, likelyHours: newItem.likely, pessimisticHours: newItem.pessimistic, confidence: 50 }]);
    setNewItem({ deliverable: "", optimistic: 0, likely: 0, pessimistic: 0 });
    setAddingItemToPhase(null);
  }

  async function handleDeleteScopeItem(itemId: string) {
    if (!isDummy) await api.deleteScopeItem(itemId);
    setScopeItems((prev) => prev.filter((item) => item.id !== itemId));
  }

  // Assumption handlers
  async function handleSaveAssumption(id: string) {
    if (!isDummy) await api.updateAssumption(id, editAssumption);
    setAssumptions((prev) => prev.map((a) => a.id === id ? { ...a, ...editAssumption } : a));
    setEditingAssumptionId(null);
  }
  async function handleAddAssumption() {
    if (!newAssumption.trim() || !scopeId) return;
    const id = isDummy ? `a-${Date.now()}` : (await api.addAssumption(scopeId, newAssumption, "unresolved")).id;
    setAssumptions((prev) => [...prev, { id, content: newAssumption, status: "unresolved" }]);
    setNewAssumption("");
    setAddingAssumption(false);
  }
  async function handleDeleteAssumption(id: string) {
    if (!isDummy) await api.deleteAssumption(id);
    setAssumptions((prev) => prev.filter((a) => a.id !== id));
  }

  // Risk handlers
  async function handleSaveRisk(id: string) {
    if (!isDummy) await api.updateRisk(id, editRisk);
    setRisks((prev) => prev.map((r) => r.id === id ? { ...r, content: editRisk.content, severity: editRisk.severity, mitigation: editRisk.mitigation || null } : r));
    setEditingRiskId(null);
  }
  async function handleAddRisk() {
    if (!newRisk.content.trim() || !scopeId) return;
    const id = isDummy ? `r-${Date.now()}` : (await api.addRisk(scopeId, newRisk.content, newRisk.severity, newRisk.mitigation || undefined)).id;
    setRisks((prev) => [...prev, { id, content: newRisk.content, severity: newRisk.severity, mitigation: newRisk.mitigation || null }]);
    setNewRisk({ content: "", severity: "medium", mitigation: "" });
    setAddingRisk(false);
  }
  async function handleDeleteRisk(id: string) {
    if (!isDummy) await api.deleteRisk(id);
    setRisks((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleExportMarkdown() {
    if (!scoperProject) return;
    try {
      const md = await api.exportMarkdown(scoperProject.id);
      const blob = new Blob([md], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${scoperProject.name ?? "scope"}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || "Export failed");
    }
  }

  async function handleGenerateProposal() {
    if (!scoperProject || scopeItems.length === 0) return;
    setGeneratingProposal(true);
    try {
      // Try Scoper API first (if real project)
      if (!isDummy) {
        try {
          const blob = await api.generateProposal(scoperProject.id);
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${scoperProject.name}-proposal.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          return;
        } catch {
          // Fall through to local generation
        }
      }

      // Local HTML-to-PDF generation
      const projectName = scoperProject.name || "Project";
      const totalOpt = scopeItems.reduce((s, i) => s + i.optimisticHours, 0);
      const totalLikely = scopeItems.reduce((s, i) => s + i.likelyHours, 0);
      const totalPess = scopeItems.reduce((s, i) => s + i.pessimisticHours, 0);

      const phaseRows = Array.from(phases).map(([name, items]) => {
        const po = items.reduce((s, i) => s + i.optimisticHours, 0);
        const pl = items.reduce((s, i) => s + i.likelyHours, 0);
        const pp = items.reduce((s, i) => s + i.pessimisticHours, 0);
        return { name, items, po, pl, pp };
      });

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${projectName} — Proposal</title>
<style>
  @page { size: A4; margin: 40px 50px; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1a1a2e; font-size: 11px; line-height: 1.5; }
  .cover { height: 100vh; display: flex; flex-direction: column; justify-content: center; padding: 80px; page-break-after: always; }
  .cover h1 { font-size: 36px; font-weight: 700; margin-bottom: 8px; color: #0f172a; }
  .cover .subtitle { font-size: 14px; color: #64748b; margin-bottom: 40px; }
  .cover .meta { font-size: 11px; color: #94a3b8; }
  .cover .meta span { display: block; margin-bottom: 4px; }
  .section { margin-bottom: 28px; }
  .section-title { font-size: 16px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 14px; }
  .summary { font-size: 12px; color: #475569; line-height: 1.7; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
  th.num { text-align: right; }
  td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; font-size: 11px; color: #334155; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .phase-header td { font-weight: 700; color: #0f172a; background: #f8fafc; font-size: 11px; }
  .subtotal td { font-weight: 600; color: #475569; border-top: 1px solid #e2e8f0; background: #f8fafc; font-size: 10px; }
  .grand-total td { font-weight: 700; color: #0f172a; border-top: 2px solid #cbd5e1; font-size: 12px; padding: 10px; }
  .cost-row td { font-weight: 700; color: #0f172a; font-size: 13px; padding: 10px; background: #f0f9ff; }
  .retainer-section { margin-top: 24px; border: 2px solid #e2e8f0; border-radius: 8px; padding: 20px; text-align: center; }
  .retainer-section .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 12px; }
  .retainer-grid { display: flex; justify-content: space-around; }
  .retainer-col { text-align: center; }
  .retainer-col .tier { font-size: 9px; text-transform: uppercase; color: #94a3b8; margin-bottom: 4px; }
  .retainer-col .amount { font-size: 22px; font-weight: 800; color: #0f172a; }
  .retainer-col .per { font-size: 10px; color: #94a3b8; }
  .assumption, .risk { padding: 6px 0; border-bottom: 1px solid #f1f5f9; font-size: 11px; }
  .assumption .status { font-size: 9px; text-transform: uppercase; font-weight: 600; margin-right: 8px; }
  .risk .severity { font-size: 9px; text-transform: uppercase; font-weight: 700; margin-right: 8px; padding: 2px 6px; border-radius: 3px; }
  .risk .severity.high { background: #fef2f2; color: #dc2626; }
  .risk .severity.medium { background: #fffbeb; color: #d97706; }
  .risk .severity.low { background: #f0fdf4; color: #16a34a; }
  .risk .mitigation { color: #94a3b8; font-style: italic; margin-top: 2px; font-size: 10px; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
</style></head><body>
<div class="cover">
  <h1>${projectName}</h1>
  <div class="subtitle">Project Proposal</div>
  <div class="meta">
    <span>Prepared: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
    <span>Rate: $${costPerHour}/hr</span>
  </div>
</div>

${summary ? `<div class="section"><div class="section-title">Executive Summary</div><div class="summary">${summary}</div></div>` : ""}

<div class="section">
  <div class="section-title">Scope of Work</div>
  <table>
    <thead><tr><th>Deliverable</th><th class="num">Optimistic</th><th class="num">Likely</th><th class="num">Pessimistic</th></tr></thead>
    <tbody>
      ${phaseRows.map(({ name, items, po, pl, pp }) => `
        <tr class="phase-header"><td colspan="4">${name}</td></tr>
        ${items.map(i => `<tr><td style="padding-left:24px">${i.deliverable}</td><td class="num">${i.optimisticHours}h</td><td class="num">${i.likelyHours}h</td><td class="num">${i.pessimisticHours}h</td></tr>`).join("")}
        <tr class="subtotal"><td>Subtotal</td><td class="num">${po}h</td><td class="num">${pl}h</td><td class="num">${pp}h</td></tr>
      `).join("")}
      <tr class="grand-total"><td>Total Hours</td><td class="num">${totalOpt}h</td><td class="num">${totalLikely}h</td><td class="num">${totalPess}h</td></tr>
      <tr class="cost-row"><td>Estimated Cost</td><td class="num">$${(totalOpt * costPerHour).toLocaleString()}</td><td class="num">$${(totalLikely * costPerHour).toLocaleString()}</td><td class="num">$${(totalPess * costPerHour).toLocaleString()}</td></tr>
    </tbody>
  </table>
  <div class="retainer-section">
    <div class="label">Monthly Retainer &middot; ${retainerMonths} months</div>
    <div class="retainer-grid">
      <div class="retainer-col"><div class="tier">Low</div><div class="amount">$${Math.ceil((totalOpt * costPerHour) / retainerMonths).toLocaleString()}</div><div class="per">/month</div></div>
      <div class="retainer-col"><div class="tier">Expected</div><div class="amount">$${Math.ceil((totalLikely * costPerHour) / retainerMonths).toLocaleString()}</div><div class="per">/month</div></div>
      <div class="retainer-col"><div class="tier">High</div><div class="amount">$${Math.ceil((totalPess * costPerHour) / retainerMonths).toLocaleString()}</div><div class="per">/month</div></div>
    </div>
  </div>
</div>

${assumptions.length > 0 ? `<div class="section">
  <div class="section-title">Assumptions</div>
  ${assumptions.map(a => `<div class="assumption"><span class="status" style="color:${a.status === "accepted" ? "#16a34a" : a.status === "rejected" ? "#dc2626" : "#d97706"}">${a.status}</span>${a.content}</div>`).join("")}
</div>` : ""}

${risks.length > 0 ? `<div class="section">
  <div class="section-title">Risks</div>
  ${risks.map(r => `<div class="risk"><span class="severity ${r.severity}">${r.severity}</span>${r.content}${r.mitigation ? `<div class="mitigation">Mitigation: ${r.mitigation}</div>` : ""}</div>`).join("")}
</div>` : ""}

<div class="footer">Generated by slushie</div>
</body></html>`;

      // Open in new window for printing to PDF
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 500);
      }
    } catch (err: any) {
      setError(err.message || "Failed to generate proposal");
    } finally {
      setGeneratingProposal(false);
    }
  }


  function loadDummyData() {
    const proj = allProjects.find((p) => p.id === projectId) || allProjects[0];
    setScoperProject({ id: "dummy", name: proj?.name || "Test CRM", clientName: proj?.clientName || "Acme Corp" });
    setSelectedSlushieProject(proj?.id || "");
    setScopeId("dummy-scope");
    setSummary("A CRM platform with contact management, deal pipeline tracking, email integration, and reporting dashboards. The system will support role-based access, custom fields, and third-party integrations via webhooks.");
    setScopeItems([
      { id: "si-1", phase: "Foundation", deliverable: "Database schema & migrations", optimisticHours: 8, likelyHours: 12, pessimisticHours: 20, confidence: 80 },
      { id: "si-2", phase: "Foundation", deliverable: "Auth system (JWT + RBAC)", optimisticHours: 6, likelyHours: 10, pessimisticHours: 16, confidence: 75 },
      { id: "si-3", phase: "Foundation", deliverable: "API scaffolding & middleware", optimisticHours: 4, likelyHours: 6, pessimisticHours: 10, confidence: 85 },
      { id: "si-4", phase: "Core Features", deliverable: "Contact management CRUD", optimisticHours: 10, likelyHours: 16, pessimisticHours: 24, confidence: 70 },
      { id: "si-5", phase: "Core Features", deliverable: "Deal pipeline & kanban board", optimisticHours: 14, likelyHours: 22, pessimisticHours: 32, confidence: 65 },
      { id: "si-6", phase: "Core Features", deliverable: "Activity timeline & notes", optimisticHours: 6, likelyHours: 10, pessimisticHours: 14, confidence: 75 },
      { id: "si-7", phase: "Integrations", deliverable: "Email sync (IMAP/SMTP)", optimisticHours: 12, likelyHours: 20, pessimisticHours: 30, confidence: 55 },
      { id: "si-8", phase: "Integrations", deliverable: "Webhook system for third-party apps", optimisticHours: 8, likelyHours: 12, pessimisticHours: 18, confidence: 70 },
      { id: "si-9", phase: "Reporting", deliverable: "Dashboard with KPI widgets", optimisticHours: 10, likelyHours: 16, pessimisticHours: 22, confidence: 65 },
      { id: "si-10", phase: "Reporting", deliverable: "Export to CSV/PDF", optimisticHours: 4, likelyHours: 6, pessimisticHours: 10, confidence: 80 },
    ]);
    setAssumptions([
      { id: "a-1", content: "Client will provide SMTP credentials for email integration", status: "unresolved" },
      { id: "a-2", content: "No more than 5 user roles needed at launch", status: "accepted" },
      { id: "a-3", content: "Existing contact data will be imported via CSV", status: "unresolved" },
      { id: "a-4", content: "Mobile-responsive web app is sufficient (no native app needed)", status: "accepted" },
    ]);
    setRisks([
      { id: "r-1", content: "Email integration complexity may increase if OAuth2 is required for Gmail/Outlook", severity: "high", mitigation: "Start with SMTP, add OAuth in phase 2" },
      { id: "r-2", content: "Custom field system could add significant complexity to DB queries", severity: "medium", mitigation: "Use JSONB column with indexed virtual columns" },
      { id: "r-3", content: "Deal pipeline drag-and-drop may have performance issues with large datasets", severity: "low", mitigation: "Implement virtual scrolling if >500 deals" },
    ]);
    setQuestions([
      { id: "q-1", content: "Should the CRM support multi-currency for international deals?", answer: "Yes, USD and EUR at minimum", skipped: false, scopeImpact: "Adds currency conversion layer to deal values and reporting", riskLevel: "medium", forClient: true },
      { id: "q-2", content: "Is there a preferred email provider (Gmail, Outlook, generic SMTP)?", answer: null, skipped: false, scopeImpact: "Determines OAuth vs SMTP integration approach", riskLevel: "high", forClient: true },
      { id: "q-3", content: "How many concurrent users are expected at launch?", answer: null, skipped: true, scopeImpact: "Affects infrastructure sizing and caching strategy", riskLevel: "low", forClient: false },
      { id: "q-4", content: "Should contacts be deduplicated automatically on import?", answer: "Yes, match on email address", skipped: false, scopeImpact: "Requires fuzzy matching logic in import pipeline", riskLevel: "medium", forClient: false },
    ]);
    setInputs([
      { id: "inp-1", content: "## Summary\nClient wants a CRM to replace their spreadsheet-based tracking. Key needs: contact management, deal pipeline, basic reporting.", source: "call_notes" },
      { id: "inp-2", content: "## Summary\nFollow-up call. Client confirmed they need email integration and webhook support for Zapier.", source: "call_notes" },
    ]);
    setNewNotesCount(2);
    setLastScopeInputCount(2);
    setPhase("scoping");
    setError("");
  }

  // Build phases map
  const phases = new Map<string, ScopeItem[]>();
  for (const item of scopeItems) {
    const existing = phases.get(item.phase) ?? [];
    existing.push(item);
    phases.set(item.phase, existing);
  }

  // Back to project list
  function handleBack() {
    setScoperProject(null);
    setPhase("select");
    setSelectedSlushieProject("");
    setScopeId(null);
    setScopeItems([]);
    setAssumptions([]);
    setRisks([]);
    setQuestions([]);
    setInputs([]);
    setSummary("");
    setError("");
    setNotesSynced(0);
    setNewNotesCount(0);
    setLastScopeInputCount(0);
  }

  // =========== RENDER ===========

  // Project selection view
  if (phase === "select") {
    return (
      <div>
        <h1 className="text-xl font-semibold text-[#f1f5f9] mb-6">Propose</h1>
        <p className="text-sm text-white/40 mb-4">
          Select a project to start scoping. Your meeting notes will be pulled in automatically.
        </p>
        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
        <button
          onClick={loadDummyData}
          className="mb-4 px-3 py-1.5 text-xs rounded-lg border border-dashed border-white/[0.1] text-white/30 hover:text-white/50 hover:border-white/20 transition"
        >
          Load dummy data
        </button>
        {loading ? (
          <p className="text-sm text-white/30">Loading...</p>
        ) : allProjects.length === 0 ? (
          <p className="text-sm text-white/30">No projects yet. Create a project first.</p>
        ) : (
          <div className="space-y-2">
            {allProjects.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelectProject(p.id)}
                className="w-full text-left p-4 rounded-lg border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.15] transition"
              >
                <span className="text-sm text-white/80 font-medium">{p.name}</span>
                <span className="text-xs text-white/30 ml-2">— {p.clientName}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Input collection view
  if (phase === "input") {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={handleBack} className="text-white/30 hover:text-white/60 transition">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <h1 className="text-xl font-semibold text-[#f1f5f9]">Propose</h1>
          <span className="text-xs text-white/30">— {scoperProject?.name}</span>
          <div className="flex-1" />
          <button onClick={loadDummyData} className="px-3 py-1.5 text-xs rounded-lg border border-dashed border-white/[0.08] text-white/25 hover:text-white/50 hover:border-white/15 transition">
            Load demo
          </button>
        </div>

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        {syncingNotes && (
          <div className="text-sm text-white/40 mb-4 flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            Syncing notes from meetings...
          </div>
        )}

        {notesSynced > 0 && (
          <div className="text-sm text-green-400/70 mb-4">
            Synced {notesSynced} note{notesSynced !== 1 ? "s" : ""} from meetings
          </div>
        )}

        <p className="text-sm text-white/40 mb-4">
          {inputs.length > 0
            ? `${inputs.length} input${inputs.length !== 1 ? "s" : ""} ready. Add more or start scoping.`
            : "Paste requirements, call notes, or any raw client input. Add as many as you have, then start scoping."}
        </p>

        {inputs.length > 0 && (
          <div className="mb-4 space-y-2">
            {inputs.map((input, i) => (
              <div key={input.id} className="p-3 rounded-lg border border-white/[0.08] bg-white/[0.02]">
                <div className="text-[0.6rem] text-white/30 mb-1">Input {i + 1} — {input.source}</div>
                <p className="text-xs text-white/50 line-clamp-3">{input.content}</p>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAddInput} className="space-y-3 mb-6">
          <select
            value={inputSource}
            onChange={(e) => setInputSource(e.target.value)}
            className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/20"
          >
            <option value="call_notes" className="bg-[#0c1120]">Call notes</option>
            <option value="email" className="bg-[#0c1120]">Email</option>
            <option value="transcript" className="bg-[#0c1120]">Transcript</option>
            <option value="other" className="bg-[#0c1120]">Other</option>
          </select>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste raw client input here..."
            rows={6}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 resize-y font-mono"
          />
          <button type="submit" disabled={!inputText.trim()} className="px-4 py-2 text-xs rounded-lg bg-white/[0.08] text-white/60 hover:text-white/80 hover:bg-white/[0.12] transition disabled:opacity-40">
            Add input
          </button>
        </form>

        <button
          onClick={handleStartScoping}
          disabled={inputs.length === 0 || loading}
          className="w-full px-4 py-3 bg-gradient-to-r from-red-500 to-blue-500 text-white rounded-lg font-bold hover:opacity-90 transition disabled:opacity-50"
        >
          {loading ? "Analyzing..." : "Start scoping"}
        </button>
      </div>
    );
  }

  // Scoping / complete workspace view
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={handleBack} className="text-white/30 hover:text-white/60 transition">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <h1 className="text-xl font-semibold text-[#f1f5f9]">Propose</h1>
        <span className="text-xs text-white/30">— {scoperProject?.name}</span>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <button onClick={loadDummyData} className="px-3 py-1.5 text-xs rounded-lg border border-dashed border-white/[0.08] text-white/25 hover:text-white/50 hover:border-white/15 transition">
            Load demo
          </button>
          <button onClick={handleExportMarkdown} className="px-3 py-1.5 text-xs rounded-lg bg-white/[0.06] text-white/40 hover:text-white/60 hover:bg-white/[0.1] transition">
            Export MD
          </button>
          {scopeItems.length > 0 && (
            <button
              onClick={handleGenerateProposal}
              disabled={generatingProposal}
              className="px-3 py-1.5 text-xs rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white hover:opacity-90 transition disabled:opacity-50"
            >
              {generatingProposal ? "Generating..." : "Download Proposal"}
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {newNotesCount > 0 && (
        <div className="mb-4 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            <span className="text-sm text-yellow-300/80">
              {newNotesCount} new note{newNotesCount !== 1 ? "s" : ""} since last scope
            </span>
          </div>
          <button
            onClick={handleUpdateScope}
            disabled={updatingScope}
            className="px-3 py-1.5 text-xs rounded-lg bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 transition disabled:opacity-50"
          >
            {updatingScope ? "Updating..." : "Update proposal"}
          </button>
        </div>
      )}

      <div className="flex gap-4">
        {/* Left: Questions */}
        {leftPanelOpen && (
          <div className="w-1/2 space-y-4 rounded-xl border border-white/[0.08] bg-white/[0.015] p-5">
            {/* Summary */}
            {summary && (
              <div>
                <h3 className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-2">Draft Summary</h3>
                <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
                  <p className="text-xs text-white/60 leading-relaxed">{summary}</p>
                </div>
              </div>
            )}

            {/* Questions */}
            {questions.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[0.6rem] uppercase tracking-widest text-white/30">AI Suggested Questions</h3>
                  <span className="text-xs text-white/20">
                    {questions.filter((q) => q.answer || q.skipped).length}/{questions.length} answered
                  </span>
                </div>

                {phase === "scoping" && questions.some((q) => !q.answer && !q.skipped) && (
                  <button
                    onClick={handleAnswerAllAndFinish}
                    disabled={loading}
                    className="w-full px-4 py-2 mb-3 text-xs rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition disabled:opacity-50"
                  >
                    {loading ? "Finishing up..." : "Skip remaining & finish"}
                  </button>
                )}

                <div className="space-y-2">
                  {[...questions].sort((a, b) => {
                    const aAnswered = a.answer || a.skipped ? 1 : 0;
                    const bAnswered = b.answer || b.skipped ? 1 : 0;
                    return aAnswered - bAnswered;
                  }).map((q) => {
                    const isActive = activeQuestionId === q.id;
                    const isAnswered = !!q.answer;
                    const isSkipped = !!q.skipped;

                    return (
                      <div key={q.id} className={`rounded-lg border p-3 transition ${isAnswered ? "bg-blue-500/5 border-blue-500/20" : isSkipped ? "bg-white/[0.01] border-white/[0.06]" : "bg-white/[0.02] border-white/[0.08]"}`}>
                        <div className="flex items-start gap-2 mb-1">
                          <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${isAnswered ? "bg-blue-400" : isSkipped ? "bg-white/20" : "bg-yellow-400"}`} />
                          <p className="text-xs text-white/70">{q.content}</p>
                        </div>

                        {q.forClient && (
                          <span className="inline-block text-[0.55rem] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 ml-3.5 mb-1">Ask client</span>
                        )}

                        {isAnswered && (
                          <div className="ml-3.5 mt-1 text-xs text-white/40 italic">{q.answer}</div>
                        )}

                        {isSkipped && (
                          <div className="ml-3.5 mt-1 text-[0.6rem] text-white/20 italic">Skipped</div>
                        )}

                        {!isAnswered && !isSkipped && phase === "scoping" && (
                          <div className="ml-3.5 mt-2">
                            {isActive ? (
                              <div onClick={(e) => e.stopPropagation()}>
                                <textarea
                                  ref={answerInputRef}
                                  value={currentAnswer}
                                  onChange={(e) => setCurrentAnswer(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey && currentAnswer.trim()) {
                                      e.preventDefault();
                                      handleAnswer(q.id, currentAnswer);
                                      setActiveQuestionId(null);
                                    }
                                  }}
                                  placeholder="Type your answer..."
                                  disabled={loading}
                                  rows={2}
                                  className="w-full px-3 py-2 rounded border border-white/[0.08] bg-white/[0.04] text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/20 resize-none"
                                />
                                <div className="flex items-center justify-end gap-2 mt-1">
                                  <button
                                    onClick={async () => {
                                      await handleAnswer(q.id, undefined, true);
                                      setActiveQuestionId(null);
                                    }}
                                    disabled={loading}
                                    className="px-3 py-1 text-[0.6rem] text-white/20 hover:text-white/40 transition"
                                  >
                                    Skip
                                  </button>
                                  <button
                                    onClick={() => {
                                      handleAnswer(q.id, currentAnswer);
                                      setActiveQuestionId(null);
                                    }}
                                    disabled={!currentAnswer.trim() || loading}
                                    className="px-3 py-1 text-[0.6rem] bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition disabled:opacity-50"
                                  >
                                    {loading ? "Saving..." : "Submit"}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <input
                                type="text"
                                readOnly
                                placeholder="Click to answer..."
                                className="w-full px-3 py-1.5 rounded border border-white/[0.06] bg-white/[0.02] text-xs text-white/20 cursor-pointer hover:border-white/[0.12] transition"
                                onClick={() => {
                                  setActiveQuestionId(q.id);
                                  setCurrentAnswer("");
                                  setTimeout(() => answerInputRef.current?.focus(), 50);
                                }}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {phase === "complete" && (
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 text-center">
                <p className="text-blue-400 text-sm font-medium">Scoping complete</p>
                <p className="text-xs text-white/40 mt-1">Review your scope, assumptions, and risks.</p>
              </div>
            )}
          </div>
        )}

        {/* Right: Scope view */}
        <div className={`${leftPanelOpen ? "w-1/2" : "flex-1"} space-y-4 rounded-xl border border-white/[0.08] bg-white/[0.015] p-5`}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLeftPanelOpen(!leftPanelOpen)}
              className="text-white/20 hover:text-white/40 transition"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {leftPanelOpen
                  ? <polyline points="15 18 9 12 15 6" />
                  : <polyline points="9 18 15 12 9 6" />
                }
              </svg>
            </button>
          </div>

          {/* Scope items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => setScopeOpen(!scopeOpen)} className="flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className={`text-white/20 transition-transform ${scopeOpen ? "rotate-90" : ""}`}>
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
                <h2 className="text-sm font-bold text-white/80">Scope</h2>
                <span className="text-[0.6rem] text-white/20">({scopeItems.length} items)</span>
              </button>
              <button
                onClick={() => { setScopeOpen(true); setAddingItemToPhase(Array.from(phases.keys())[0] ?? "New Phase"); }}
                className="text-[0.6rem] text-white/20 hover:text-white/40 transition"
              >
                + Add item
              </button>
            </div>

            {scopeOpen && (
              <>
                {scopeItems.length === 0 && (
                  <p className="text-xs text-white/20 italic mb-4">No scope items yet. Start scoping to generate them.</p>
                )}

                {Array.from(phases).map(([phaseName, items]) => {
                  const phaseOptimistic = items.reduce((s, i) => s + i.optimisticHours, 0);
                  const phaseLikely = items.reduce((s, i) => s + i.likelyHours, 0);
                  const phasePessimistic = items.reduce((s, i) => s + i.pessimisticHours, 0);

                  return (
                    <div key={phaseName} className="mb-3 rounded-lg border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                      {/* Phase header */}
                      <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.03] border-b border-white/[0.06]">
                        {editingPhase === phaseName ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              value={editPhaseName}
                              onChange={(e) => setEditPhaseName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") handleRenamePhase(phaseName); if (e.key === "Escape") setEditingPhase(null); }}
                              autoFocus
                              className="text-xs text-white/80 px-2 py-0.5 border border-white/[0.08] rounded bg-white/[0.04] focus:outline-none focus:border-white/20 flex-1"
                            />
                            <button onClick={() => handleRenamePhase(phaseName)} className="text-[0.6rem] text-blue-400">Save</button>
                            <button onClick={() => setEditingPhase(null)} className="text-[0.6rem] text-white/20">Cancel</button>
                          </div>
                        ) : (
                          <>
                            <h3
                              className="text-xs font-semibold text-white/80 cursor-pointer hover:text-white transition"
                              onClick={() => { setEditingPhase(phaseName); setEditPhaseName(phaseName); }}
                            >
                              {phaseName}
                            </h3>
                            <span className="text-[0.6rem] text-white/30 font-mono">
                              {phaseOptimistic} / {phaseLikely} / {phasePessimistic}h
                            </span>
                          </>
                        )}
                      </div>

                      {/* Phase items */}
                      <div className="divide-y divide-white/[0.04]">
                        {items.map((item) => (
                          <div key={item.id}>
                            <div className="flex items-center justify-between text-xs py-2 px-4 hover:bg-white/[0.02] group">
                              {editingDeliverable === item.id ? (
                                <div className="flex items-center gap-2 flex-1 mr-2">
                                  <input
                                    value={editDeliverableName}
                                    onChange={(e) => setEditDeliverableName(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveDeliverable(item.id); if (e.key === "Escape") setEditingDeliverable(null); }}
                                    autoFocus
                                    className="text-xs text-white/60 px-2 py-0.5 border border-white/[0.08] rounded bg-white/[0.04] focus:outline-none focus:border-white/20 flex-1"
                                  />
                                  <button onClick={() => handleSaveDeliverable(item.id)} className="text-[0.6rem] text-blue-400">Save</button>
                                </div>
                              ) : (
                                <span
                                  className="text-white/50 cursor-pointer hover:text-white/70 transition flex-1"
                                  onClick={() => { setEditingDeliverable(item.id); setEditDeliverableName(item.deliverable); }}
                                >
                                  {item.deliverable}
                                </span>
                              )}
                              <div className="flex items-center gap-3 flex-shrink-0">
                                <span
                                  className="text-[0.6rem] text-white/25 font-mono cursor-pointer hover:text-white/50 transition"
                                  onClick={() => {
                                    setEditingItemId(editingItemId === item.id ? null : item.id);
                                    setEditHours({ optimistic: item.optimisticHours, likely: item.likelyHours, pessimistic: item.pessimisticHours });
                                  }}
                                >
                                  {item.optimisticHours}/{item.likelyHours}/{item.pessimisticHours}h
                                </span>
                                <button
                                  onClick={() => handleDeleteScopeItem(item.id)}
                                  className="opacity-0 group-hover:opacity-100 text-white/15 hover:text-red-400 transition-opacity text-[0.6rem]"
                                >
                                  x
                                </button>
                              </div>
                            </div>

                            {editingItemId === item.id && (
                              <div className="mx-4 mb-2 p-3 rounded-lg border border-white/[0.08] bg-white/[0.03] space-y-2">
                                <div className="grid grid-cols-3 gap-2">
                                  {(["optimistic", "likely", "pessimistic"] as const).map((key) => (
                                    <div key={key}>
                                      <label className="text-[0.55rem] text-white/20 block mb-0.5 capitalize">{key}</label>
                                      <input
                                        type="number"
                                        min={0}
                                        value={editHours[key]}
                                        onChange={(e) => setEditHours({ ...editHours, [key]: parseInt(e.target.value) || 0 })}
                                        className="w-full px-2 py-1 text-xs border border-white/[0.08] rounded bg-white/[0.04] text-white/60 focus:outline-none focus:border-white/20"
                                      />
                                    </div>
                                  ))}
                                </div>
                                <div className="flex justify-end gap-2">
                                  <button onClick={() => setEditingItemId(null)} className="text-[0.6rem] text-white/20">Cancel</button>
                                  <button onClick={() => handleSaveHours(item.id)} className="text-[0.6rem] text-blue-400">Save</button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}

                        {addingItemToPhase === phaseName && (
                          <div className="mx-4 my-2 p-3 rounded-lg border border-white/[0.08] bg-white/[0.03] space-y-2">
                            <input
                              value={newItem.deliverable}
                              onChange={(e) => setNewItem({ ...newItem, deliverable: e.target.value })}
                              placeholder="Deliverable name..."
                              autoFocus
                              onKeyDown={(e) => { if (e.key === "Enter" && newItem.deliverable.trim()) handleAddScopeItem(phaseName); if (e.key === "Escape") setAddingItemToPhase(null); }}
                              className="w-full px-2 py-1 text-xs border border-white/[0.08] rounded bg-white/[0.04] text-white/60 placeholder:text-white/15 focus:outline-none focus:border-white/20"
                            />
                            <div className="grid grid-cols-3 gap-2">
                              {(["optimistic", "likely", "pessimistic"] as const).map((key) => (
                                <div key={key}>
                                  <label className="text-[0.55rem] text-white/20 block mb-0.5 capitalize">{key} hrs</label>
                                  <input type="number" min={0} value={newItem[key] || ""} onChange={(e) => setNewItem({ ...newItem, [key]: parseInt(e.target.value) || 0 })} className="w-full px-2 py-1 text-xs border border-white/[0.08] rounded bg-white/[0.04] text-white/60 focus:outline-none focus:border-white/20" />
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-end gap-2">
                              <button onClick={() => { setAddingItemToPhase(null); setNewItem({ deliverable: "", optimistic: 0, likely: 0, pessimistic: 0 }); }} className="text-[0.6rem] text-white/20">Cancel</button>
                              <button onClick={() => handleAddScopeItem(phaseName)} disabled={!newItem.deliverable.trim()} className="text-[0.6rem] text-blue-400 disabled:opacity-50">Add</button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Phase subtotal footer */}
                      <div className="flex justify-between text-[0.6rem] text-white/20 px-4 py-2 bg-white/[0.02] border-t border-white/[0.06]">
                        <span>Subtotal</span>
                        <span className="font-mono">{phaseOptimistic} / {phaseLikely} / {phasePessimistic}h &middot; ${(phaseLikely * costPerHour).toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}

                {/* Totals */}
                {scopeItems.length > 0 && (() => {
                  const totals = {
                    optimistic: scopeItems.reduce((s, item) => s + item.optimisticHours, 0),
                    likely: scopeItems.reduce((s, item) => s + item.likelyHours, 0),
                    pessimistic: scopeItems.reduce((s, item) => s + item.pessimisticHours, 0),
                  };
                  const totalCost = { optimistic: totals.optimistic * costPerHour, likely: totals.likely * costPerHour, pessimistic: totals.pessimistic * costPerHour };
                  const monthly = { optimistic: Math.ceil(totalCost.optimistic / retainerMonths), likely: Math.ceil(totalCost.likely / retainerMonths), pessimistic: Math.ceil(totalCost.pessimistic / retainerMonths) };

                  return (
                    <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                      {/* Hours totals */}
                      <div className="px-4 py-3 bg-white/[0.03] border-b border-white/[0.06]">
                        <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-2">Total Hours</div>
                        <div className="grid grid-cols-3 gap-4 text-center">
                          {(["optimistic", "likely", "pessimistic"] as const).map((key, i) => (
                            <div key={key}>
                              <div className="text-[0.55rem] text-white/20 mb-0.5">{["Optimistic", "Realistic", "Pessimistic"][i]}</div>
                              <div className="text-sm font-semibold text-white/70">{totals[key]}h</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Rate + project cost */}
                      <div className="px-4 py-3 border-b border-white/[0.06]">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[0.6rem] uppercase tracking-widest text-white/30">Rate</span>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-white/30">$</span>
                            <input
                              type="number"
                              min={0}
                              value={costPerHour}
                              onChange={(e) => setCostPerHour(parseInt(e.target.value) || 0)}
                              className="w-20 px-2 py-1 text-xs text-right border border-white/[0.08] rounded bg-white/[0.04] text-white/70 focus:outline-none focus:border-white/20"
                            />
                            <span className="text-xs text-white/30">/hr</span>
                          </div>
                        </div>
                        <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-2">Project Cost</div>
                        <div className="grid grid-cols-3 gap-4 text-center">
                          {(["optimistic", "likely", "pessimistic"] as const).map((key, i) => (
                            <div key={key}>
                              <div className="text-[0.55rem] text-white/20 mb-0.5">{["Low", "Expected", "High"][i]}</div>
                              <div className="text-sm font-bold text-white/80">
                                ${totalCost[key].toLocaleString()}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Monthly retainer */}
                      <div className="px-4 py-3">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[0.6rem] uppercase tracking-widest text-white/30">Monthly Retainer</span>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={1}
                              value={retainerMonths}
                              onChange={(e) => setRetainerMonths(Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-14 px-2 py-1 text-xs text-right border border-white/[0.08] rounded bg-white/[0.04] text-white/70 focus:outline-none focus:border-white/20"
                            />
                            <span className="text-xs text-white/30">months</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-center">
                          {(["optimistic", "likely", "pessimistic"] as const).map((key, i) => (
                            <div key={key}>
                              <div className="text-[0.55rem] text-white/20 mb-0.5">{["Low", "Expected", "High"][i]}</div>
                              <div className="text-lg font-bold text-white/90">
                                ${monthly[key].toLocaleString()}
                              </div>
                              <div className="text-[0.55rem] text-white/20">/month</div>
                            </div>
                          ))}
                        </div>
                        {onStartBilling && (
                          <button
                            onClick={() => onStartBilling({ monthlyAmount: monthly.likely, totalMonths: retainerMonths })}
                            className="w-full mt-4 px-4 py-2.5 text-sm rounded-lg bg-green-500/20 text-green-400 font-semibold hover:bg-green-500/30 transition"
                          >
                            Start Billing at ${monthly.likely.toLocaleString()}/mo
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          {/* Assumptions */}
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.03] border-b border-white/[0.06]">
              <button onClick={() => setAssumptionsOpen(!assumptionsOpen)} className="flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className={`text-white/20 transition-transform ${assumptionsOpen ? "rotate-90" : ""}`}>
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
                <h2 className="text-xs font-semibold text-white/80">Assumptions</h2>
                <span className="text-[0.6rem] text-white/30">({assumptions.length})</span>
              </button>
              <button onClick={() => { setAssumptionsOpen(true); setAddingAssumption(true); }} className="text-[0.6rem] text-white/25 hover:text-white/50 transition">
                + Add
              </button>
            </div>
            {assumptionsOpen && (
              <div className="divide-y divide-white/[0.04]">
                {assumptions.map((a) => (
                  <div key={a.id}>
                    {editingAssumptionId === a.id ? (
                      <div className="p-3 space-y-2">
                        <input
                          value={editAssumption.content}
                          onChange={(e) => setEditAssumption({ ...editAssumption, content: e.target.value })}
                          className="w-full px-2 py-1 text-xs border border-white/[0.08] rounded bg-white/[0.04] text-white/60 focus:outline-none focus:border-white/20"
                        />
                        <div className="flex items-center gap-2">
                          <select
                            value={editAssumption.status}
                            onChange={(e) => setEditAssumption({ ...editAssumption, status: e.target.value })}
                            className="px-2 py-1 text-[0.6rem] border border-white/[0.08] rounded bg-white/[0.04] text-white/50"
                          >
                            <option value="unresolved">Unresolved</option>
                            <option value="accepted">Accepted</option>
                            <option value="rejected">Rejected</option>
                          </select>
                          <div className="flex-1" />
                          <button onClick={() => handleDeleteAssumption(a.id)} className="text-[0.6rem] text-red-400/60 hover:text-red-400">Delete</button>
                          <button onClick={() => setEditingAssumptionId(null)} className="text-[0.6rem] text-white/20">Cancel</button>
                          <button onClick={() => handleSaveAssumption(a.id)} className="text-[0.6rem] text-blue-400">Save</button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="flex items-center gap-2 text-xs py-2.5 px-4 cursor-pointer hover:bg-white/[0.02] transition"
                        onClick={() => { setEditingAssumptionId(a.id); setEditAssumption({ content: a.content, status: a.status }); }}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          a.status === "accepted" ? "bg-green-500" : a.status === "rejected" ? "bg-red-500" : "bg-yellow-500"
                        }`} />
                        <span className="text-white/50 flex-1">{a.content}</span>
                        <span className="text-[0.55rem] text-white/20 capitalize">{a.status}</span>
                      </div>
                    )}
                  </div>
                ))}
                {addingAssumption && (
                  <div className="p-3 space-y-2">
                    <input
                      value={newAssumption}
                      onChange={(e) => setNewAssumption(e.target.value)}
                      placeholder="New assumption..."
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter" && newAssumption.trim()) handleAddAssumption(); }}
                      className="w-full px-2 py-1 text-xs border border-white/[0.08] rounded bg-white/[0.04] text-white/60 placeholder:text-white/15 focus:outline-none focus:border-white/20"
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setAddingAssumption(false); setNewAssumption(""); }} className="text-[0.6rem] text-white/20">Cancel</button>
                      <button onClick={handleAddAssumption} disabled={!newAssumption.trim()} className="text-[0.6rem] text-blue-400 disabled:opacity-50">Add</button>
                    </div>
                  </div>
                )}
                {assumptions.length === 0 && !addingAssumption && (
                  <p className="text-xs text-white/20 italic p-4">No assumptions yet</p>
                )}
              </div>
            )}
          </div>

          {/* Risks */}
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.03] border-b border-white/[0.06]">
              <button onClick={() => setRisksOpen(!risksOpen)} className="flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className={`text-white/20 transition-transform ${risksOpen ? "rotate-90" : ""}`}>
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
                <h2 className="text-xs font-semibold text-white/80">Risks</h2>
                <span className="text-[0.6rem] text-white/30">({risks.length})</span>
              </button>
              <button onClick={() => { setRisksOpen(true); setAddingRisk(true); }} className="text-[0.6rem] text-white/25 hover:text-white/50 transition">
                + Add
              </button>
            </div>
            {risksOpen && (
              <div className="divide-y divide-white/[0.04]">
                {risks.map((r) => (
                  <div key={r.id}>
                    {editingRiskId === r.id ? (
                      <div className="p-3 space-y-2">
                        <input
                          value={editRisk.content}
                          onChange={(e) => setEditRisk({ ...editRisk, content: e.target.value })}
                          className="w-full px-2 py-1 text-xs border border-white/[0.08] rounded bg-white/[0.04] text-white/60 focus:outline-none focus:border-white/20"
                        />
                        <div className="flex gap-2">
                          <select
                            value={editRisk.severity}
                            onChange={(e) => setEditRisk({ ...editRisk, severity: e.target.value })}
                            className="px-2 py-1 text-[0.6rem] border border-white/[0.08] rounded bg-white/[0.04] text-white/50"
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                          </select>
                          <input
                            value={editRisk.mitigation}
                            onChange={(e) => setEditRisk({ ...editRisk, mitigation: e.target.value })}
                            placeholder="Mitigation"
                            className="flex-1 px-2 py-1 text-[0.6rem] border border-white/[0.08] rounded bg-white/[0.04] text-white/50 placeholder:text-white/15 focus:outline-none focus:border-white/20"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1" />
                          <button onClick={() => handleDeleteRisk(r.id)} className="text-[0.6rem] text-red-400/60 hover:text-red-400">Delete</button>
                          <button onClick={() => setEditingRiskId(null)} className="text-[0.6rem] text-white/20">Cancel</button>
                          <button onClick={() => handleSaveRisk(r.id)} className="text-[0.6rem] text-blue-400">Save</button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="py-2.5 px-4 cursor-pointer hover:bg-white/[0.02] transition"
                        onClick={() => { setEditingRiskId(r.id); setEditRisk({ content: r.content, severity: r.severity, mitigation: r.mitigation ?? "" }); }}
                      >
                        <div className="flex items-center text-xs">
                          <span className={`text-[0.6rem] font-semibold mr-2 px-1.5 py-0.5 rounded flex-shrink-0 ${
                            r.severity === "high" ? "text-red-400 bg-red-500/10" : r.severity === "medium" ? "text-yellow-400 bg-yellow-500/10" : "text-white/40 bg-white/[0.04]"
                          }`}>
                            {r.severity.toUpperCase()}
                          </span>
                          <span className="text-white/50 flex-1">{r.content}</span>
                        </div>
                        {r.mitigation && (
                          <div className="ml-12 mt-1 text-[0.6rem] text-white/25 italic">
                            Mitigation: {r.mitigation}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {addingRisk && (
                  <div className="p-3 space-y-2">
                    <input
                      value={newRisk.content}
                      onChange={(e) => setNewRisk({ ...newRisk, content: e.target.value })}
                      placeholder="Risk description..."
                      autoFocus
                      className="w-full px-2 py-1 text-xs border border-white/[0.08] rounded bg-white/[0.04] text-white/60 placeholder:text-white/15 focus:outline-none focus:border-white/20"
                    />
                    <div className="flex gap-2">
                      <select
                        value={newRisk.severity}
                        onChange={(e) => setNewRisk({ ...newRisk, severity: e.target.value })}
                        className="px-2 py-1 text-[0.6rem] border border-white/[0.08] rounded bg-white/[0.04] text-white/50"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                      <input
                        value={newRisk.mitigation}
                        onChange={(e) => setNewRisk({ ...newRisk, mitigation: e.target.value })}
                        placeholder="Mitigation"
                        className="flex-1 px-2 py-1 text-[0.6rem] border border-white/[0.08] rounded bg-white/[0.04] text-white/50 placeholder:text-white/15 focus:outline-none focus:border-white/20"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setAddingRisk(false); setNewRisk({ content: "", severity: "medium", mitigation: "" }); }} className="text-[0.6rem] text-white/20">Cancel</button>
                      <button onClick={handleAddRisk} disabled={!newRisk.content.trim()} className="text-[0.6rem] text-blue-400 disabled:opacity-50">Add</button>
                    </div>
                  </div>
                )}
                {risks.length === 0 && !addingRisk && (
                  <p className="text-xs text-white/20 italic p-4">No risks flagged yet</p>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

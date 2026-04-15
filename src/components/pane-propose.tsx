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
};

type ProjectInfo = {
  id: string;
  name: string;
  clientName: string;
  slushieProjectId: string;
};

export function PanePropose({ workspaces, projectId }: Props) {
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

  useEffect(() => {
    if (projectId) setSelectedSlushieProject(projectId);
  }, [projectId]);

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

  // Proposal
  const [generatingProposal, setGeneratingProposal] = useState(false);

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

      // Sync slushie notes as Scoper inputs
      await syncNotes(slushieProjectId, scoper.id, existingInputs);

      // Check for existing scopes
      const scopes = await api.listScopes(scoper.id);
      if (scopes.length > 0) {
        const activeScope = scopes[0];
        setScopeId(activeScope.id);
        const state = await api.getScopeState(activeScope.id);
        setScopeItems(state.scopeItems || []);
        setAssumptions(state.assumptions || []);
        setRisks(state.risks || []);
        setQuestions(state.questions || []);
        setSummary(state.draft?.summary || "");

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

  async function syncNotes(slushieProjectId: string, scoperProjectId: string, existingInputs: any[]) {
    setSyncingNotes(true);
    try {
      const res = await fetch(`/api/notes?projectId=${slushieProjectId}`, { cache: "no-store" });
      if (!res.ok) { setSyncingNotes(false); return; }
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
    } catch {
      // Non-critical, continue
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
    await api.updateScopeItem(itemId, {
      optimisticHours: h.optimistic,
      likelyHours: h.likely,
      pessimisticHours: h.pessimistic,
    });
    setScopeItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, optimisticHours: h.optimistic, likelyHours: h.likely, pessimisticHours: h.pessimistic }
          : item
      )
    );
    if (!hours) setEditingItemId(null);
  }

  async function handleRenamePhase(oldName: string) {
    if (!editPhaseName.trim() || editPhaseName === oldName || !scopeId) return;
    await api.renamePhase(scopeId, oldName, editPhaseName);
    setScopeItems((prev) => prev.map((item) => item.phase === oldName ? { ...item, phase: editPhaseName } : item));
    setEditingPhase(null);
  }

  async function handleSaveDeliverable(itemId: string) {
    if (!editDeliverableName.trim()) return;
    await api.updateScopeItem(itemId, { deliverable: editDeliverableName });
    setScopeItems((prev) => prev.map((item) => item.id === itemId ? { ...item, deliverable: editDeliverableName } : item));
    setEditingDeliverable(null);
  }

  async function handleAddScopeItem(phaseName: string) {
    if (!newItem.deliverable.trim() || !scopeId) return;
    const created = await api.addScopeItem(scopeId, phaseName, newItem.deliverable, {
      optimistic: newItem.optimistic,
      likely: newItem.likely,
      pessimistic: newItem.pessimistic,
    });
    setScopeItems((prev) => [...prev, { id: created.id, phase: phaseName, deliverable: newItem.deliverable, optimisticHours: newItem.optimistic, likelyHours: newItem.likely, pessimisticHours: newItem.pessimistic, confidence: 50 }]);
    setNewItem({ deliverable: "", optimistic: 0, likely: 0, pessimistic: 0 });
    setAddingItemToPhase(null);
  }

  async function handleDeleteScopeItem(itemId: string) {
    await api.deleteScopeItem(itemId);
    setScopeItems((prev) => prev.filter((item) => item.id !== itemId));
  }

  // Assumption handlers
  async function handleSaveAssumption(id: string) {
    await api.updateAssumption(id, editAssumption);
    setAssumptions((prev) => prev.map((a) => a.id === id ? { ...a, ...editAssumption } : a));
    setEditingAssumptionId(null);
  }
  async function handleAddAssumption() {
    if (!newAssumption.trim() || !scopeId) return;
    const created = await api.addAssumption(scopeId, newAssumption, "unresolved");
    setAssumptions((prev) => [...prev, created]);
    setNewAssumption("");
    setAddingAssumption(false);
  }
  async function handleDeleteAssumption(id: string) {
    await api.deleteAssumption(id);
    setAssumptions((prev) => prev.filter((a) => a.id !== id));
  }

  // Risk handlers
  async function handleSaveRisk(id: string) {
    await api.updateRisk(id, editRisk);
    setRisks((prev) => prev.map((r) => r.id === id ? { ...r, content: editRisk.content, severity: editRisk.severity, mitigation: editRisk.mitigation || null } : r));
    setEditingRiskId(null);
  }
  async function handleAddRisk() {
    if (!newRisk.content.trim() || !scopeId) return;
    const created = await api.addRisk(scopeId, newRisk.content, newRisk.severity, newRisk.mitigation || undefined);
    setRisks((prev) => [...prev, created]);
    setNewRisk({ content: "", severity: "medium", mitigation: "" });
    setAddingRisk(false);
  }
  async function handleDeleteRisk(id: string) {
    await api.deleteRisk(id);
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
    if (!scoperProject) return;
    setGeneratingProposal(true);
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
    } catch (err: any) {
      setError(err.message || "Failed to generate proposal");
    } finally {
      setGeneratingProposal(false);
    }
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
          <button onClick={handleExportMarkdown} className="px-3 py-1.5 text-xs rounded-lg bg-white/[0.06] text-white/40 hover:text-white/60 hover:bg-white/[0.1] transition">
            Export MD
          </button>
          {phase === "complete" && (
            <button
              onClick={handleGenerateProposal}
              disabled={generatingProposal}
              className="px-3 py-1.5 text-xs rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white hover:opacity-90 transition disabled:opacity-50"
            >
              {generatingProposal ? "Generating..." : "Generate Proposal"}
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      <div className="flex gap-6">
        {/* Left: Questions */}
        {leftPanelOpen && (
          <div className="w-1/2 space-y-4">
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
        <div className={`${leftPanelOpen ? "w-1/2" : "flex-1"} space-y-4`}>
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
                    <div key={phaseName} className="mb-4">
                      <div className="flex items-center justify-between mb-1">
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
                              className="text-xs font-medium text-white/70 cursor-pointer hover:text-white/90 transition"
                              onClick={() => { setEditingPhase(phaseName); setEditPhaseName(phaseName); }}
                            >
                              {phaseName}
                            </h3>
                            <span className="text-[0.6rem] text-white/20">
                              {phaseOptimistic} — {phaseLikely} — {phasePessimistic}h
                            </span>
                          </>
                        )}
                      </div>

                      <div className="space-y-0.5">
                        {items.map((item) => (
                          <div key={item.id}>
                            <div className="flex items-center justify-between text-xs py-1.5 px-2 rounded hover:bg-white/[0.03] group">
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
                                  className="text-white/50 cursor-pointer hover:text-white/70 transition"
                                  onClick={() => { setEditingDeliverable(item.id); setEditDeliverableName(item.deliverable); }}
                                >
                                  {item.deliverable}
                                </span>
                              )}
                              <div className="flex items-center gap-1.5 text-[0.6rem] text-white/20 flex-shrink-0">
                                <button
                                  onClick={() => {
                                    setEditingItemId(item.id);
                                    setEditHours({ optimistic: item.optimisticHours, likely: item.likelyHours, pessimistic: item.pessimisticHours });
                                  }}
                                  className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-blue-400 transition-opacity"
                                >
                                  edit
                                </button>
                                <button
                                  onClick={() => handleDeleteScopeItem(item.id)}
                                  className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 transition-opacity"
                                >
                                  x
                                </button>
                              </div>
                            </div>

                            {editingItemId === item.id && (
                              <div className="mx-2 mb-2 p-3 rounded-lg border border-white/[0.08] bg-white/[0.02] space-y-2">
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
                          <div className="mx-2 p-3 rounded-lg border border-white/[0.08] bg-white/[0.02] space-y-2">
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

                      <div className="flex justify-between text-[0.6rem] text-white/15 mt-1 px-2 pt-1 border-t border-white/[0.04]">
                        <span>{phaseName} subtotal</span>
                        <span>{phaseOptimistic} — {phaseLikely} — {phasePessimistic}h</span>
                      </div>
                    </div>
                  );
                })}

                {/* Totals */}
                {scopeItems.length > 0 && (
                  <div className="border-t border-white/[0.08] pt-3 mb-4">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      {(["optimisticHours", "likelyHours", "pessimisticHours"] as const).map((key, i) => (
                        <div key={key}>
                          <div className="text-[0.55rem] text-white/20 mb-0.5">{["Optimistic", "Realistic", "Pessimistic"][i]}</div>
                          <div className="text-sm font-semibold text-white/70">
                            {scopeItems.reduce((s, item) => s + item[key], 0)}h
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Assumptions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => setAssumptionsOpen(!assumptionsOpen)} className="flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className={`text-white/20 transition-transform ${assumptionsOpen ? "rotate-90" : ""}`}>
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
                <h2 className="text-sm font-bold text-white/80">Assumptions</h2>
                <span className="text-[0.6rem] text-white/20">({assumptions.length})</span>
              </button>
              <button onClick={() => { setAssumptionsOpen(true); setAddingAssumption(true); }} className="text-[0.6rem] text-white/20 hover:text-white/40 transition">
                + Add
              </button>
            </div>
            {assumptionsOpen && (
              <div className="space-y-1">
                {assumptions.map((a) => (
                  <div key={a.id}>
                    {editingAssumptionId === a.id ? (
                      <div className="p-2 rounded-lg border border-white/[0.08] bg-white/[0.02] space-y-2">
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
                        className="flex items-center gap-2 text-xs py-1.5 px-2 group cursor-pointer hover:bg-white/[0.03] rounded"
                        onClick={() => { setEditingAssumptionId(a.id); setEditAssumption({ content: a.content, status: a.status }); }}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          a.status === "accepted" ? "bg-green-500" : a.status === "rejected" ? "bg-red-500" : "bg-yellow-500"
                        }`} />
                        <span className="text-white/50 flex-1">{a.content}</span>
                      </div>
                    )}
                  </div>
                ))}
                {addingAssumption && (
                  <div className="p-2 rounded-lg border border-white/[0.08] bg-white/[0.02] space-y-2">
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
                  <p className="text-xs text-white/20 italic">No assumptions yet</p>
                )}
              </div>
            )}
          </div>

          {/* Risks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <button onClick={() => setRisksOpen(!risksOpen)} className="flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className={`text-white/20 transition-transform ${risksOpen ? "rotate-90" : ""}`}>
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
                <h2 className="text-sm font-bold text-white/80">Risks</h2>
                <span className="text-[0.6rem] text-white/20">({risks.length})</span>
              </button>
              <button onClick={() => { setRisksOpen(true); setAddingRisk(true); }} className="text-[0.6rem] text-white/20 hover:text-white/40 transition">
                + Add
              </button>
            </div>
            {risksOpen && (
              <div className="space-y-1">
                {risks.map((r) => (
                  <div key={r.id}>
                    {editingRiskId === r.id ? (
                      <div className="p-2 rounded-lg border border-white/[0.08] bg-white/[0.02] space-y-2">
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
                        className="py-1.5 px-2 group cursor-pointer hover:bg-white/[0.03] rounded"
                        onClick={() => { setEditingRiskId(r.id); setEditRisk({ content: r.content, severity: r.severity, mitigation: r.mitigation ?? "" }); }}
                      >
                        <div className="flex items-center text-xs">
                          <span className={`text-[0.6rem] font-medium mr-2 flex-shrink-0 ${
                            r.severity === "high" ? "text-red-400" : r.severity === "medium" ? "text-yellow-400" : "text-white/30"
                          }`}>
                            {r.severity.toUpperCase()}
                          </span>
                          <span className="text-white/50 flex-1">{r.content}</span>
                        </div>
                        {r.mitigation && (
                          <div className="ml-10 mt-0.5 text-[0.6rem] text-white/20 italic">
                            Mitigation: {r.mitigation}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {addingRisk && (
                  <div className="p-2 rounded-lg border border-white/[0.08] bg-white/[0.02] space-y-2">
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
                  <p className="text-xs text-white/20 italic">No risks flagged yet</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

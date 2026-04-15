"use client";

import { useState, useEffect, useCallback } from "react";
import { MoveToProductionModal } from "./move-to-production-modal";

type FeedbackItemData = {
  id: string;
  text: string;
  title: string | null;
  description: string | null;
  priority: string | null;
  featureType: string | null;
  source: string;
  status: string;
  wishlistItemId: string | null;
  projectId: string;
  createdAt: string;
  project: { id: string; name: string };
};

type WorkspaceMembership = {
  workspaceId: string;
  role: string;
  workspace: { id: string; name: string; slug: string; clients: any[] };
};

type Props = {
  workspaces: WorkspaceMembership[];
  onUpdate: () => void;
  projectId?: string | null;
};

type Tab = "view" | "suggestions";

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-400 bg-red-500/10",
  medium: "text-yellow-400 bg-yellow-500/10",
  low: "text-white/40 bg-white/[0.06]",
};

export function PaneFeedback({ workspaces, onUpdate, projectId: projectIdProp }: Props) {
  const allProjects = workspaces.flatMap((m) =>
    m.workspace.clients.flatMap((c: any) =>
      (c.projects || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        clientId: c.id,
        clientName: c.name,
        features: p.features || [],
      }))
    )
  );

  const [selectedProjectId, setSelectedProjectId] = useState<string>(allProjects[0]?.id || "");
  useEffect(() => {
    if (projectIdProp) setSelectedProjectId(projectIdProp);
  }, [projectIdProp]);

  const selectedProject = allProjects.find((p) => p.id === selectedProjectId);

  const [tab, setTab] = useState<Tab>("view");
  const [items, setItems] = useState<FeedbackItemData[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [movingItem, setMovingItem] = useState<FeedbackItemData | null>(null);

  // Embed widget state
  const [embedCode, setEmbedCode] = useState<string | null>(null);
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const [previewEmbed, setPreviewEmbed] = useState(false);

  const loadItems = useCallback(async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/feedback?projectId=${selectedProjectId}`, { cache: "no-store" });
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // Poll while any items are pending
  useEffect(() => {
    const anyPending = items.some((i) => i.status === "pending");
    if (!anyPending) return;
    const interval = setInterval(loadItems, 3000);
    return () => clearInterval(interval);
  }, [items, loadItems]);

  // Load embed code for selected project
  useEffect(() => {
    if (!selectedProjectId) return;
    setEmbedCode(null);
    fetch(`/api/projects/${selectedProjectId}/embed-key`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data) setEmbedCode(data.embedCode); });
  }, [selectedProjectId]);

  function copyEmbed() {
    if (!embedCode) return;
    navigator.clipboard.writeText(embedCode);
    setCopiedEmbed(true);
    setTimeout(() => setCopiedEmbed(false), 2000);
  }

  async function handleDismiss(id: string) {
    await fetch(`/api/feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    });
    loadItems();
  }

  async function handleRestore(id: string) {
    await fetch(`/api/feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "reviewed" }),
    });
    loadItems();
  }

  // Split items
  const allFeedback = items.filter((i) => i.status !== "dismissed");
  const pendingProcessing = items.filter((i) => i.status === "pending");
  const reviewedWithFeatures = items.filter((i) => i.status === "reviewed" && i.title && i.description);
  const dismissed = items.filter((i) => i.status === "dismissed");

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-6">
        <button
          onClick={() => setTab("view")}
          className={`px-4 py-2 text-sm rounded-lg transition-colors ${
            tab === "view"
              ? "bg-white/[0.08] text-white/80"
              : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
          }`}
        >
          View Feedback
        </button>
        <button
          onClick={() => setTab("suggestions")}
          className={`px-4 py-2 text-sm rounded-lg transition-colors flex items-center gap-2 ${
            tab === "suggestions"
              ? "bg-white/[0.08] text-white/80"
              : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
          }`}
        >
          Review Feature Suggestions
          {reviewedWithFeatures.length > 0 && (
            <span className="text-[0.6rem] bg-yellow-400/20 text-yellow-400 px-1.5 py-0.5 rounded-full">
              {reviewedWithFeatures.length}
            </span>
          )}
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setShowEmbed(!showEmbed)}
          className="px-4 py-2 text-sm rounded-lg bg-white/[0.06] text-white/40 hover:text-white/60 transition-colors"
        >
          {showEmbed ? "Hide Widget" : "Embed Widget"}
        </button>
      </div>

      {/* Embed widget section */}
      {showEmbed && (
        <div className="mb-6 rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-white/60">Feedback Widget for {selectedProject?.clientName} / {selectedProject?.name}</span>
            <div className="flex gap-1.5">
              <button
                onClick={() => setPreviewEmbed(!previewEmbed)}
                className="px-2.5 py-1 text-[0.65rem] rounded-md bg-white/[0.08] text-white/60 hover:text-white/80 transition-colors"
              >
                {previewEmbed ? "Hide Preview" : "Preview"}
              </button>
              {embedCode && (
                <button
                  onClick={copyEmbed}
                  className="px-2.5 py-1 text-[0.65rem] rounded-md bg-white/[0.08] text-white/60 hover:text-white/80 transition-colors"
                >
                  {copiedEmbed ? "Copied!" : "Copy Code"}
                </button>
              )}
            </div>
          </div>
          {embedCode ? (
            <code className="block text-[0.65rem] text-blue-400/70 bg-white/[0.03] px-3 py-2 rounded-md break-all leading-relaxed">
              {embedCode}
            </code>
          ) : (
            <div className="text-[0.6rem] text-white/20">Loading...</div>
          )}
          {previewEmbed && (
            <div className="mt-3">
              <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-1.5">Widget Preview</div>
              <div className="rounded-lg border border-white/[0.08] overflow-hidden" style={{ height: 220 }}>
                <iframe
                  srcDoc={`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f9fafb;}
.slushie-fb-bar{position:fixed;top:0;left:0;right:0;z-index:999;background:#0c1120;border-bottom:1px solid rgba(255,255,255,0.08);padding:8px 16px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;color:rgba(255,255,255,0.5)}
.slushie-fb-bar a{color:rgba(255,255,255,0.8);cursor:pointer;text-decoration:underline;text-underline-offset:2px}
.slushie-fb-bar a:hover{color:#fff}
.slushie-fb-form{position:fixed;top:0;left:0;right:0;z-index:999;background:#0c1120;border-bottom:1px solid rgba(255,255,255,0.08);padding:12px 16px;display:none}
.slushie-fb-form textarea{width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:8px 12px;color:rgba(255,255,255,0.8);font-size:13px;font-family:inherit;resize:none;outline:none;margin-bottom:8px;box-sizing:border-box}
.slushie-fb-form textarea::placeholder{color:rgba(255,255,255,0.2)}
.slushie-fb-btns{display:flex;gap:8px;justify-content:flex-end}
.slushie-fb-submit{background:#ef4444;color:#fff;border:none;padding:6px 16px;border-radius:8px;font-size:12px;cursor:pointer}
.slushie-fb-submit:disabled{opacity:0.4}
.slushie-fb-cancel{background:none;color:rgba(255,255,255,0.3);border:none;padding:6px 12px;font-size:12px;cursor:pointer}
</style>
</head>
<body>
<div class="slushie-fb-bar" id="bar">What could be better? <a id="open">Let us know</a></div>
<div class="slushie-fb-form" id="form">
<textarea rows="3" placeholder="Tell us what could be better..." id="ta"></textarea>
<div class="slushie-fb-btns"><button class="slushie-fb-cancel" id="cancel">Cancel</button><button class="slushie-fb-submit" disabled id="submit">Submit</button></div>
</div>
<div style="margin-top:37px;padding:30px 20px;text-align:center;color:#6b7280;font-size:14px;">Your app content here</div>
<script>
var bar=document.getElementById('bar'),form=document.getElementById('form'),ta=document.getElementById('ta'),submit=document.getElementById('submit');
document.getElementById('open').onclick=function(){bar.style.display='none';form.style.display='block';ta.focus()};
document.getElementById('cancel').onclick=function(){form.style.display='none';bar.style.display='flex';ta.value='';submit.disabled=true};
ta.oninput=function(){submit.disabled=!ta.value.trim()};
submit.onclick=function(){form.innerHTML='<div style="text-align:center;color:rgba(255,255,255,0.6);font-size:13px;padding:4px 0">Thanks for your feedback!</div>';setTimeout(function(){form.style.display="none";bar.style.display="flex"},1500)};
</script>
</body>
</html>`}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts"
                  title="Feedback widget preview"
                />
              </div>
              <p className="text-[0.55rem] text-white/20 mt-1">This is how the feedback bar appears to your users.</p>
            </div>
          )}
        </div>
      )}

      {/* View Feedback tab */}
      {tab === "view" && (
        <>
          {loading && items.length === 0 ? (
            <p className="text-sm text-white/30">Loading...</p>
          ) : allFeedback.length === 0 && pendingProcessing.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-white/30 mb-2">No feedback yet.</p>
              <p className="text-xs text-white/20">Embed the widget on your client&apos;s site to start collecting feedback.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Processing items */}
              {pendingProcessing.map((item) => (
                <div key={item.id} className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                  <div className="text-xs text-white/50">{item.text}</div>
                  <div className="flex items-center gap-1.5 text-[0.6rem] text-yellow-400/60 mt-1.5">
                    <span className="w-2 h-2 border border-yellow-400/40 border-t-yellow-400 rounded-full animate-spin" />
                    Analyzing...
                  </div>
                </div>
              ))}

              {/* All feedback as clean read-only cards */}
              {allFeedback.filter((i) => i.status !== "pending").map((item) => (
                <div key={item.id} className="rounded-lg border border-white/[0.08] bg-white/[0.02]">
                  <button
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3"
                  >
                    {/* Source badge */}
                    <span className={`text-[0.6rem] px-2 py-1 rounded-md shrink-0 ${
                      (item.source || "internal") === "client"
                        ? "bg-orange-400/10 text-orange-400"
                        : "bg-white/[0.06] text-white/40"
                    }`}>
                      {(item.source || "internal") === "client" ? "Client" : "Internal"}
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-white/60 truncate">{item.text}</div>
                      <div className="text-[0.6rem] text-white/25 mt-0.5">
                        {new Date(item.createdAt).toLocaleDateString("en-US", {
                          month: "short", day: "numeric", year: "numeric",
                        })}
                      </div>
                    </div>

                    {/* Has suggestion indicator */}
                    {item.title && item.description && (
                      <span className="text-[0.5rem] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 shrink-0">
                        Feature extracted
                      </span>
                    )}

                    <svg
                      className={`text-white/20 transition-transform shrink-0 ${expandedId === item.id ? "rotate-180" : ""}`}
                      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {expandedId === item.id && (
                    <div className="border-t border-white/[0.06] px-4 py-3 space-y-3">
                      <div>
                        <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-1">Full Feedback</div>
                        <div className="text-xs text-white/50 whitespace-pre-wrap">{item.text}</div>
                      </div>
                      {item.title && item.description && (
                        <div>
                          <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-1">AI Analysis</div>
                          <div className="text-xs text-white/60">
                            <span className="font-medium text-white/70">{item.title}</span>
                            {" — "}{item.description}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
                            {item.priority && (
                              <span className={`text-[0.55rem] px-1.5 py-0.5 rounded ${PRIORITY_COLORS[item.priority] || ""}`}>
                                {item.priority}
                              </span>
                            )}
                            {item.featureType && (
                              <span className={`text-[0.55rem] px-1.5 py-0.5 rounded ${
                                item.featureType === "major" ? "text-emerald-400 bg-emerald-500/10" : "text-sky-400 bg-sky-500/10"
                              }`}>
                                {item.featureType === "major" ? "Major" : "Minor"}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Dismissed section */}
              {dismissed.length > 0 && (
                <div className="pt-2">
                  <button
                    onClick={() => setExpandedId(expandedId === "dismissed" ? null : "dismissed")}
                    className="text-[0.6rem] uppercase tracking-widest text-white/20 hover:text-white/30 transition-colors"
                  >
                    Dismissed ({dismissed.length}) {expandedId === "dismissed" ? "\u25B2" : "\u25BC"}
                  </button>
                  {expandedId === "dismissed" && (
                    <div className="space-y-2 mt-2">
                      {dismissed.map((item) => (
                        <div key={item.id} className="rounded-lg border border-white/[0.06] bg-white/[0.01] px-4 py-3 flex items-center justify-between">
                          <div className="min-w-0">
                            <span className="text-xs text-white/30">{item.title || item.text.slice(0, 60)}</span>
                          </div>
                          <button
                            onClick={() => handleRestore(item.id)}
                            className="text-[0.6rem] text-white/20 hover:text-white/40 transition-colors shrink-0 ml-3"
                          >
                            Restore
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Review Feature Suggestions tab */}
      {tab === "suggestions" && (
        <>
          {reviewedWithFeatures.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-white/30 mb-1">All caught up</p>
              <p className="text-xs text-white/20">No pending feature suggestions to review.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {reviewedWithFeatures.map((item) => (
                <div key={item.id} className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white/80 font-medium">{item.title}</span>
                        {item.priority && (
                          <span className={`text-[0.6rem] px-1.5 py-0.5 rounded ${PRIORITY_COLORS[item.priority] || ""}`}>
                            {item.priority}
                          </span>
                        )}
                        {item.featureType && (
                          <span className={`text-[0.6rem] px-1.5 py-0.5 rounded ${
                            item.featureType === "major" ? "text-emerald-400 bg-emerald-500/10" : "text-sky-400 bg-sky-500/10"
                          }`}>
                            {item.featureType === "major" ? "Major" : "Minor"}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-xs text-white/40 mt-1">{item.description}</p>
                      )}
                      <button
                        onClick={() => {
                          setTab("view");
                          setExpandedId(item.id);
                        }}
                        className="text-[0.6rem] text-blue-400/60 hover:text-blue-400 mt-1.5 transition-colors"
                      >
                        Source: &ldquo;{item.text.slice(0, 60)}{item.text.length > 60 ? "..." : ""}&rdquo;
                      </button>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setMovingItem(item)}
                        className="px-3 py-1.5 text-xs rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                      >
                        + Wishlist
                      </button>
                      <button
                        onClick={() => handleDismiss(item.id)}
                        className="px-3 py-1.5 text-xs rounded-lg text-white/20 hover:text-white/40 hover:bg-white/[0.04] transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Move to Production Modal */}
      {movingItem && selectedProject && (
        <MoveToProductionModal
          item={{
            id: movingItem.wishlistItemId || movingItem.id,
            title: movingItem.title || "",
            description: movingItem.description || "",
            priority: movingItem.priority,
          }}
          projects={allProjects}
          onClose={() => { setMovingItem(null); loadItems(); onUpdate(); }}
        />
      )}
    </div>
  );
}

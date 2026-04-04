"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";

type Tab = "preview" | "wishlist" | "feedback";

interface WishlistItem {
  id: string;
  title: string;
  description: string;
  priority: string | null;
  status: string;
  voteCount: number;
  clientVote: number | null;
}

interface FeedbackItem {
  id: string;
  text: string;
  title: string | null;
  priority: string | null;
  featureType: string | null;
  status: string;
  createdAt: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-400 bg-red-400/10",
  medium: "text-yellow-400 bg-yellow-400/10",
  low: "text-green-400 bg-green-400/10",
};

export default function PortalProjectPage() {
  const [tab, setTab] = useState<Tab>("preview");
  const [deployUrl, setDeployUrl] = useState<string | null>(null);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;

  // Load project info
  useEffect(() => {
    async function load() {
      const res = await fetch("/api/portal/projects");
      if (res.status === 401) {
        router.push("/portal/login");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        const project = data.projects.find((p: { id: string }) => p.id === projectId);
        if (!project) {
          router.push("/portal");
          return;
        }
        setProjectName(project.name);
      }
      setLoading(false);
    }
    load();
  }, [projectId, router]);

  // Load preview URL
  useEffect(() => {
    if (tab !== "preview") return;
    async function loadPreview() {
      const res = await fetch(`/api/portal/projects/${projectId}/preview`);
      if (res.ok) {
        const data = await res.json();
        setDeployUrl(data.deployUrl);
      }
    }
    loadPreview();
  }, [tab, projectId]);

  // Load wishlist
  const loadWishlist = useCallback(async () => {
    const res = await fetch(`/api/portal/projects/${projectId}/wishlist`);
    if (res.ok) {
      const data = await res.json();
      setWishlistItems(data.items);
    }
  }, [projectId]);

  useEffect(() => {
    if (tab === "wishlist") loadWishlist();
  }, [tab, loadWishlist]);

  // Load feedback
  const loadFeedback = useCallback(async () => {
    const res = await fetch(`/api/portal/projects/${projectId}/feedback`);
    if (res.ok) {
      const data = await res.json();
      setFeedbackItems(data.items);
    }
  }, [projectId]);

  useEffect(() => {
    if (tab === "feedback") loadFeedback();
  }, [tab, loadFeedback]);

  // Poll feedback while pending items exist
  useEffect(() => {
    if (tab !== "feedback") return;
    const hasPending = feedbackItems.some((f) => f.status === "pending");
    if (!hasPending) return;
    const interval = setInterval(loadFeedback, 3000);
    return () => clearInterval(interval);
  }, [tab, feedbackItems, loadFeedback]);

  async function handleVote(itemId: string, vote: number) {
    const res = await fetch(`/api/portal/wishlist/${itemId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vote }),
    });
    if (res.ok) {
      const data = await res.json();
      setWishlistItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? { ...item, voteCount: data.voteCount, clientVote: data.clientVote }
            : item
        )
      );
    }
  }

  async function handleSubmitFeedback(e: React.FormEvent) {
    e.preventDefault();
    if (!feedbackText.trim()) return;
    setSubmitting(true);
    const res = await fetch(`/api/portal/projects/${projectId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: feedbackText }),
    });
    if (res.ok) {
      setFeedbackText("");
      setFeedbackSent(true);
      setTimeout(() => setFeedbackSent(false), 2000);
      loadFeedback();
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/40 text-sm">Loading...</p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "preview", label: "Preview" },
    { key: "wishlist", label: "Wishlist" },
    { key: "feedback", label: "Feedback" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/portal")}
            className="text-sm font-bold bg-gradient-to-r from-red-500 to-blue-500 bg-clip-text text-transparent"
          >
            slushie.machine
          </button>
          <span className="text-white/20">|</span>
          <span className="text-sm font-medium text-white/70">{projectName}</span>
        </div>
        <button
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            router.push("/portal/login");
          }}
          className="text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          Sign out
        </button>
      </div>

      {/* Tab bar */}
      <div className="border-b border-white/[0.06] px-6 flex gap-1 shrink-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              tab === t.key
                ? "text-white"
                : "text-white/30 hover:text-white/60"
            }`}
          >
            {t.label}
            {tab === t.key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-red-500 to-blue-500" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {/* Preview tab */}
        {tab === "preview" && (
          <div className="h-full flex flex-col">
            {deployUrl ? (
              <>
                <iframe
                  src={`${deployUrl}?isolate=true`}
                  className="flex-1 w-full border-0"
                  title="Project Preview"
                />
                <div className="px-6 py-2 border-t border-white/[0.06]">
                  <a
                    href={`${deployUrl}?isolate=true`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Open in new tab
                  </a>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-white/30">Preview not available yet</p>
              </div>
            )}
          </div>
        )}

        {/* Wishlist tab */}
        {tab === "wishlist" && (
          <div className="max-w-2xl mx-auto px-6 py-6">
            {wishlistItems.length === 0 ? (
              <p className="text-sm text-white/30 text-center py-10">No wishlist items yet</p>
            ) : (
              <div className="space-y-2">
                {wishlistItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4"
                  >
                    <div className="flex items-start gap-3">
                      {/* Vote buttons */}
                      <div className="flex flex-col items-center gap-0.5 pt-0.5">
                        <button
                          onClick={() =>
                            handleVote(item.id, item.clientVote === 1 ? 0 : 1)
                          }
                          className={`text-lg leading-none transition-colors ${
                            item.clientVote === 1
                              ? "text-blue-400"
                              : "text-white/20 hover:text-white/50"
                          }`}
                        >
                          ▲
                        </button>
                        <span className="text-xs font-medium text-white/50">
                          {item.voteCount}
                        </span>
                        <button
                          onClick={() =>
                            handleVote(item.id, item.clientVote === -1 ? 0 : -1)
                          }
                          className={`text-lg leading-none transition-colors ${
                            item.clientVote === -1
                              ? "text-red-400"
                              : "text-white/20 hover:text-white/50"
                          }`}
                        >
                          ▼
                        </button>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium text-white">{item.title}</h3>
                          {item.priority && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                PRIORITY_COLORS[item.priority] || "text-white/40 bg-white/5"
                              }`}
                            >
                              {item.priority}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-white/40 mt-1 line-clamp-2">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Feedback tab */}
        {tab === "feedback" && (
          <div className="max-w-2xl mx-auto px-6 py-6">
            {/* Submit form */}
            <form onSubmit={handleSubmitFeedback} className="mb-6">
              <label className="block text-sm font-medium text-white/50 mb-2">
                What could be better?
              </label>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Tell us what you think..."
                rows={3}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 resize-none"
              />
              <div className="flex items-center gap-3 mt-2">
                <button
                  type="submit"
                  disabled={submitting || !feedbackText.trim()}
                  className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {submitting ? "Sending..." : "Send feedback"}
                </button>
                {feedbackSent && (
                  <span className="text-xs text-green-400">Thanks for your feedback!</span>
                )}
              </div>
            </form>

            {/* Previous feedback */}
            {feedbackItems.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-white/50 mb-3">Your feedback</h3>
                <div className="space-y-2">
                  {feedbackItems.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4"
                    >
                      <p className="text-xs text-white/40 mb-1.5">
                        {new Date(item.createdAt).toLocaleDateString()}
                        {item.status === "pending" && (
                          <span className="ml-2 text-yellow-400">Analyzing...</span>
                        )}
                      </p>
                      <p className="text-sm text-white/70">{item.text}</p>
                      {item.title && (
                        <div className="mt-2 pt-2 border-t border-white/[0.06]">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-medium text-white/50">{item.title}</p>
                            {item.priority && (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                  PRIORITY_COLORS[item.priority] || "text-white/40 bg-white/5"
                                }`}
                              >
                                {item.priority}
                              </span>
                            )}
                            {item.featureType && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-blue-400 bg-blue-400/10">
                                {item.featureType}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

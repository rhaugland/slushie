"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type ActivityLog = {
  id: string;
  category: string;
  description: string;
  action: string;
  userName: string | null;
  createdAt: string;
  projectId: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

const LAST_SEEN_KEY = "slushie_notifications_last_seen";

function getLastSeen(): number {
  if (typeof window === "undefined") return 0;
  const v = localStorage.getItem(LAST_SEEN_KEY);
  return v ? parseInt(v, 10) : 0;
}

function setLastSeen(ts: number) {
  localStorage.setItem(LAST_SEEN_KEY, String(ts));
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function CategoryIcon({ category }: { category: string }) {
  const cls = "w-4 h-4 shrink-0";
  switch (category) {
    case "build":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      );
    case "feature":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
      );
    case "team":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
    case "variant":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      );
    default:
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
  }
}

const CATEGORY_COLORS: Record<string, string> = {
  build: "text-blue-400",
  feature: "text-yellow-400",
  team: "text-green-400",
  variant: "text-purple-400",
  general: "text-white/40",
};

export function useUnreadCount() {
  const [unread, setUnread] = useState(false);
  const checkRef = useRef<ReturnType<typeof setInterval>>();

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/activity?page=1");
      if (!res.ok) return;
      const data = await res.json();
      const logs: ActivityLog[] = data.logs || [];
      if (logs.length === 0) {
        setUnread(false);
        return;
      }
      const lastSeen = getLastSeen();
      const newest = new Date(logs[0].createdAt).getTime();
      setUnread(newest > lastSeen);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    check();
    checkRef.current = setInterval(check, 30_000);
    return () => clearInterval(checkRef.current);
  }, [check]);

  return { unread, recheck: check };
}

export function NotificationDropdown({ open, onClose }: Props) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/activity?page=1")
      .then((r) => r.json())
      .then((data) => {
        setLogs((data.logs || []).slice(0, 15));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Delay listener to avoid the opening click from immediately closing
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open, onClose]);

  function markAllRead() {
    if (logs.length > 0) {
      setLastSeen(new Date(logs[0].createdAt).getTime());
    } else {
      setLastSeen(Date.now());
    }
    onClose();
  }

  if (!open) return null;

  const lastSeen = getLastSeen();

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 w-80 max-h-[28rem] bg-[#0c1120] border border-white/[0.08] rounded-xl shadow-2xl flex flex-col z-50 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <span className="text-sm font-semibold text-white/80">Activity</span>
        <button
          onClick={markAllRead}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          Mark all read
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-10 text-center text-white/30 text-sm">
            No activity yet
          </div>
        ) : (
          logs.map((log) => {
            const isUnread = new Date(log.createdAt).getTime() > lastSeen;
            return (
              <div
                key={log.id}
                className={`px-4 py-3 flex gap-3 items-start border-b border-white/[0.04] last:border-0 ${
                  isUnread ? "bg-white/[0.03]" : ""
                }`}
              >
                <div className={`mt-0.5 ${CATEGORY_COLORS[log.category] || CATEGORY_COLORS.general}`}>
                  <CategoryIcon category={log.category} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/70 leading-snug line-clamp-2">
                    {log.description}
                  </p>
                  <p className="text-xs text-white/30 mt-1">
                    {relativeTime(log.createdAt)}
                  </p>
                </div>
                {isUnread && (
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

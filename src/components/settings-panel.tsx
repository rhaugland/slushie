"use client";

import { useState, useRef, useEffect } from "react";

type Props = {
  workspaceId: string | null;
  clientId: string | null;
  projectId: string | null;
  workspaceName: string;
  clientName: string;
  projectName: string;
  onWorkspaceSettings: () => void;
  onClientSettings: () => void;
  onProjectSettings: () => void;
};

export function SettingsPanel({
  workspaceId,
  clientId,
  projectId,
  workspaceName,
  clientName,
  projectName,
  onWorkspaceSettings,
  onClientSettings,
  onProjectSettings,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-colors"
        title="Settings"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1 right-0 w-56 bg-[#111827] border border-white/[0.1] rounded-lg shadow-xl z-50">
          {workspaceId && (
            <button
              onClick={() => { onWorkspaceSettings(); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 text-sm text-white/60 hover:bg-white/[0.04] hover:text-white/80 transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
              </svg>
              <span>Workspace: {workspaceName}</span>
            </button>
          )}
          {clientId && (
            <button
              onClick={() => { onClientSettings(); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 text-sm text-white/60 hover:bg-white/[0.04] hover:text-white/80 transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>Client: {clientName}</span>
            </button>
          )}
          {projectId && (
            <button
              onClick={() => { onProjectSettings(); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 text-sm text-white/60 hover:bg-white/[0.04] hover:text-white/80 transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span>Project: {projectName}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

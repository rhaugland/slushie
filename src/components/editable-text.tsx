"use client";

import { useState, useRef, useEffect } from "react";

type Props = {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  inputClassName?: string;
};

export function EditableText({ value, onSave, className = "", inputClassName = "" }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function handleSave() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    } else {
      setDraft(value);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className={`bg-transparent border border-white/20 rounded px-1 -mx-1 focus:outline-none focus:border-blue-500/50 ${inputClassName}`}
      />
    );
  }

  return (
    <span
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className={`cursor-pointer hover:bg-white/[0.06] rounded px-1 -mx-1 transition-colors group/edit inline-flex items-center gap-1.5 ${className}`}
      title="Click to edit"
    >
      {value}
      <svg className="w-3 h-3 opacity-0 group-hover/edit:opacity-40 transition-opacity shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
      </svg>
    </span>
  );
}

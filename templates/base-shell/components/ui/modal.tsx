"use client";

import { useEffect, useRef } from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
};

export function Modal({ open, onClose, title, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="rounded-xl border border-gray-200 bg-white p-6 shadow-xl backdrop:bg-black/30 max-w-md w-full"
    >
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      {children}
    </dialog>
  );
}

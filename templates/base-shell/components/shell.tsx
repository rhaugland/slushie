"use client";

import { SidebarNav } from "./sidebar-nav";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <SidebarNav />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

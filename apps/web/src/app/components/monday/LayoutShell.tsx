"use client";

import { Sidebar, SIDEBAR_WIDTH_PX } from "./Sidebar";

interface LayoutShellProps {
  children: React.ReactNode;
}

export function LayoutShell({ children }: LayoutShellProps) {
  return (
    <div className="monday-board-wrap flex min-h-screen">
      <Sidebar />
      <div
        className="flex flex-col flex-1 min-w-0"
        style={{ marginLeft: SIDEBAR_WIDTH_PX }}
      >
        {children}
      </div>
    </div>
  );
}

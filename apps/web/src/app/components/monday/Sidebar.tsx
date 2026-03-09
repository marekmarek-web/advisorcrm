"use client";

import Link from "next/link";

export const SIDEBAR_WIDTH_PX = 260;

export function Sidebar() {
  return (
    <aside
      className="fixed left-0 top-0 bottom-0 z-20 flex flex-col bg-monday-surface border-r border-monday-border shrink-0"
      style={{ width: SIDEBAR_WIDTH_PX }}
    >
      <div className="p-3 border-b border-monday-border">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="w-8 h-8 rounded-md bg-monday-blue flex items-center justify-center text-white text-sm font-semibold">A</div>
          <span className="text-monday-text font-semibold text-sm">Advisor</span>
        </div>
        <nav className="mt-2 space-y-0.5">
          <Link href="/board" className="block px-3 py-2 rounded-[6px] text-monday-text text-[13px] hover:bg-monday-row-hover">Home</Link>
          <Link href="/board" className="block px-3 py-2 rounded-[6px] text-monday-text text-[13px] hover:bg-monday-row-hover">My work</Link>
          <Link href="/board" className="block px-3 py-2 rounded-[6px] text-monday-text text-[13px] hover:bg-monday-row-hover">More</Link>
        </nav>
      </div>
      <div className="flex-1 overflow-auto p-3">
        <p className="text-monday-text-muted text-[11px] font-semibold uppercase tracking-wider px-2 py-1.5">Workspace</p>
        <ul className="mt-1 space-y-0.5">
          <li><Link href="/board" className="flex items-center gap-2 px-3 py-2 rounded-[6px] text-monday-text text-[13px] hover:bg-monday-row-hover">Contacts</Link></li>
          <li><Link href="/board" className="flex items-center gap-2 px-3 py-2 rounded-[6px] text-monday-text text-[13px] font-medium bg-monday-row-hover">Plán rozděleno</Link></li>
        </ul>
      </div>
    </aside>
  );
}

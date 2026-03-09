import { Suspense } from "react";
import { getDashboardKpis } from "@/app/actions/dashboard";
import { getMeetingNotesForBoard } from "@/app/actions/meeting-notes";
import { DashboardEditable } from "./DashboardEditable";
import { LinesAndDotsLoader } from "@/app/components/LinesAndDotsLoader";

function DashboardLoader() {
  return (
    <div className="flex-1 flex items-center justify-center" style={{ minHeight: "60vh" }}>
      <div className="flex flex-col items-center gap-4">
        <LinesAndDotsLoader />
        <p style={{ color: "var(--wp-text-muted)", fontSize: "var(--wp-fs-sm)" }}>Načítám nástěnku…</p>
      </div>
    </div>
  );
}

async function DashboardContent() {
  const [kpis, notes] = await Promise.all([
    getDashboardKpis(),
    getMeetingNotesForBoard().catch(() => []),
  ]);
  return <DashboardEditable kpis={kpis} initialNotes={notes} />;
}

export default function TodayPage() {
  return (
    <Suspense fallback={<DashboardLoader />}>
      <DashboardContent />
    </Suspense>
  );
}

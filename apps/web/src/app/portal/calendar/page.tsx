import dynamic from "next/dynamic";

const PortalCalendarView = dynamic(
  () => import("../PortalCalendarView").then((m) => ({ default: m.PortalCalendarView })),
  {
    loading: () => (
      <div className="flex flex-1 min-h-[40vh] items-center justify-center text-[color:var(--wp-text-secondary)] text-sm p-6">
        Načítám kalendář…
      </div>
    ),
  }
);

export default function CalendarPage() {
  return (
    <div className="wp-cal-route-shell flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <PortalCalendarView />
    </div>
  );
}

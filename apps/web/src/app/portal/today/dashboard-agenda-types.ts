/** Řádek časové osy v postranním kalendářovém panelu (sdílený typ pro nástěnku). */
export type DashboardAgendaTimelineRow = {
  id: string;
  kind: "event" | "task";
  time: string;
  title: string;
  sub?: string;
  /** Krátké datum v češtině (např. „2. 4.“). */
  dateShort: string;
  /** „dnes“, „zítra“, „za N dní“. */
  relativeLabel: string;
};

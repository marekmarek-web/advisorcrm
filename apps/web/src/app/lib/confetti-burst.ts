/**
 * Jednorázový CSS konfeti burst (20 částic, 2s, auto-odstranění z DOM).
 */

const CONFETTI_COLORS = [
  "#00c875",
  "#6366f1",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
  "#ef4444",
  "#22c55e",
  "#a855f7",
  "#14b8a6",
];

export function triggerConfettiBurstFromRect(
  rect: DOMRectReadOnly | DOMRect | null | undefined,
): void {
  if (typeof window === "undefined" || !rect || rect.width < 0) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const root = document.createElement("div");
  root.setAttribute("aria-hidden", "true");
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  root.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:0;height:0;pointer-events:none;z-index:99999;overflow:visible;`;

  for (let i = 0; i < 20; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 70 + Math.random() * 110;
    const tx = Math.round(Math.cos(angle) * dist);
    const ty = Math.round(Math.sin(angle) * dist + 52 + Math.random() * 48);
    const rot = Math.round(Math.random() * 720 - 360);
    const p = document.createElement("span");
    p.className = "confetti-particle";
    p.style.setProperty("--confetti-x", `${tx}px`);
    p.style.setProperty("--confetti-y", `${ty}px`);
    p.style.setProperty("--confetti-rot", `${rot}deg`);
    p.style.setProperty("--confetti-delay", `${Math.random() * 0.12}s`);
    p.style.backgroundColor = CONFETTI_COLORS[i % CONFETTI_COLORS.length] ?? "#00c875";
    if (i % 2 === 0) p.style.borderRadius = "50%";
    root.appendChild(p);
  }

  document.body.appendChild(root);
  window.setTimeout(() => {
    root.remove();
  }, 2000);
}

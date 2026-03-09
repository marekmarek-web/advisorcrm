"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
      style={{ backgroundColor: "var(--brand-main)" }}
    >
      Tisk / Export do PDF
    </button>
  );
}

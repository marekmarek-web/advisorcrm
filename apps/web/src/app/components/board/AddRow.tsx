"use client";

interface AddRowProps {
  onAddItem: () => void;
  visibleColumnsCount: number;
}

export function AddRow({ onAddItem, visibleColumnsCount }: AddRowProps) {
  return (
    <div className="b-row b-add-row">
      <div className="b-cell b-cell-sticky">
        <button type="button" className="b-add-trigger" onClick={onAddItem}>
          + Přidat klienta
        </button>
      </div>
      {Array.from({ length: visibleColumnsCount - 1 }).map((_, i) => (
        <div key={i} className="b-cell" />
      ))}
      <div className="b-cell" />
    </div>
  );
}

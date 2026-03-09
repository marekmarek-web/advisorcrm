"use client";

interface GroupRowProps {
  name: string;
  color?: string;
  colSpan: number;
}

export function GroupRow({ name, color = "#579bfc", colSpan }: GroupRowProps) {
  return (
    <tr className="bg-monday-surface">
      <td
        colSpan={colSpan}
        className="py-0 pr-0 align-middle"
      >
        <div className="flex items-center min-h-[36px] border-b border-monday-border bg-monday-surface">
          <div
            className="w-1 h-full min-h-[36px] shrink-0 rounded-l"
            style={{ backgroundColor: color }}
          />
          <span className="pl-3 text-sm font-semibold text-monday-text">{name}</span>
        </div>
      </td>
    </tr>
  );
}

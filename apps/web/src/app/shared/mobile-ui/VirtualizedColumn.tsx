"use client";

import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

type VirtualizedColumnProps = {
  count: number;
  estimateSize: number;
  children: (index: number) => ReactNode;
  className?: string;
  /** When false, skip virtualization (small lists). */
  enabled?: boolean;
  /** Rendered when enabled is false — typically a map of children(0..n). */
  fallback?: ReactNode;
};

/**
 * Vertical virtual list for long mobile lists (contacts, tasks).
 */
export function VirtualizedColumn({
  count,
  estimateSize,
  children,
  className = "max-h-[min(70vh,640px)] overflow-auto",
  enabled = true,
  fallback,
}: VirtualizedColumnProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 6,
  });

  if (!enabled || count === 0) {
    return <>{fallback}</>;
  }

  return (
    <div ref={parentRef} className={className}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {children(virtualRow.index)}
          </div>
        ))}
      </div>
    </div>
  );
}

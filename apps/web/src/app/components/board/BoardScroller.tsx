"use client";

import React, { useRef, useMemo } from "react";
import type { Column } from "@/app/components/monday/types";

type BoardScrollerProps = {
  children: React.ReactNode;
  visibleColumns: Column[];
  actionColumnWidth?: number;
};

export function BoardScroller({
  children,
  visibleColumns,
  actionColumnWidth = 48,
}: BoardScrollerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { totalWidth, gridCols } = useMemo(() => {
    const total = visibleColumns.reduce((s, c) => s + c.width, 0) + actionColumnWidth;
    const cols = visibleColumns.map((c) => c.width + "px").join(" ") + " " + actionColumnWidth + "px";
    return { totalWidth: total, gridCols: cols };
  }, [visibleColumns, actionColumnWidth]);

  const handleScroll = () => {
    if (scrollRef.current) {
      scrollRef.current.setAttribute("data-scroll", String(scrollRef.current.scrollLeft));
    }
  };

  return (
    <div
      ref={scrollRef}
      className="b-scroller"
      data-scroll="0"
      onScroll={handleScroll}
    >
      <div
        style={
          {
            width: totalWidth,
            "--board-columns": gridCols,
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}

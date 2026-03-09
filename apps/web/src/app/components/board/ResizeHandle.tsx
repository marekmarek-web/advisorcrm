"use client";

import { useCallback, useRef } from "react";

interface ResizeHandleProps {
  columnId: string;
  width: number;
  minWidth: number;
  maxWidth: number;
  onResize: (columnId: string, newWidth: number) => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function ResizeHandle({ columnId, width, minWidth, maxWidth, onResize }: ResizeHandleProps) {
  const startRef = useRef<{ x: number; w: number } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startRef.current = { x: e.clientX, w: width };
      document.body.classList.add("b-resizing");
      const handleMouseMove = (ev: MouseEvent) => {
        if (!startRef.current) return;
        const newW = clamp(startRef.current.w + (ev.clientX - startRef.current.x), minWidth, maxWidth);
        onResize(columnId, newW);
      };
      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.classList.remove("b-resizing");
        startRef.current = null;
      };
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [columnId, width, minWidth, maxWidth, onResize]
  );

  return (
    <div className="b-resize" onMouseDown={handleMouseDown}>
      <div className="b-resize-line" />
    </div>
  );
}

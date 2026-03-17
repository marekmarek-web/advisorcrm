"use client";

import { useRef, useCallback, useState, useEffect } from "react";

const DELETE_THRESHOLD = 0.3;
const REVEAL_WIDTH = 92;

interface SwipeTaskItemProps {
  id: string;
  title: string;
  subtitle?: string;
  onDelete: (id: string) => void;
  /** Optional left slot (e.g. checkbox) – use onPointerDown stopPropagation to avoid triggering swipe */
  leftSlot?: React.ReactNode;
  /** Called when user taps the row (without swiping). Use for mobile edit. */
  onEdit?: () => void;
}

const TAP_THRESHOLD_PX = 10;

export function SwipeTaskItem({ id, title, subtitle, onDelete, leftSlot, onEdit }: SwipeTaskItemProps) {
  const deleteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeAwayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasTapRef = useRef(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [offset, setOffset] = useState(0);
  const startXRef = useRef(0);
  const currentOffsetRef = useRef(0);

  const deleteBtnStyle: React.CSSProperties = { width: `${REVEAL_WIDTH}px` };
  const contentStyle: React.CSSProperties = { transform: `translateX(${offset}px)` };

  const triggerDelete = useCallback(() => {
    setIsDeleting(true);
    deleteRef.current = setTimeout(() => onDelete(id), 300);
  }, [id, onDelete]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setIsDragging(true);
    startXRef.current = e.clientX;
    (e.target as Element).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      const diff = e.clientX - startXRef.current;
      const newOffset = diff > 0 ? 0 : diff;
      currentOffsetRef.current = newOffset;
      setOffset(newOffset);
    },
    [isDragging],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const rawOffset = currentOffsetRef.current;
      const distance = Math.abs(rawOffset);
      if (distance < TAP_THRESHOLD_PX && rawOffset >= 0) {
        wasTapRef.current = true;
      }
      setIsDragging(false);
      const elementWidth = (e.currentTarget as HTMLElement).offsetWidth;

      if (rawOffset < 0) {
        if (distance > elementWidth * DELETE_THRESHOLD) {
          setOffset(-elementWidth);
          swipeAwayRef.current = setTimeout(triggerDelete, 100);
          wasTapRef.current = false;
          (e.target as Element).releasePointerCapture(e.pointerId);
          return;
        }
        if (distance > REVEAL_WIDTH / 2) {
          setOffset(-REVEAL_WIDTH);
          currentOffsetRef.current = -REVEAL_WIDTH;
          wasTapRef.current = false;
        } else {
          setOffset(0);
          currentOffsetRef.current = 0;
        }
      } else {
        setOffset(0);
        currentOffsetRef.current = 0;
      }
      (e.target as Element).releasePointerCapture(e.pointerId);
    },
    [triggerDelete],
  );

  const handleContentClick = useCallback(() => {
    if (wasTapRef.current && onEdit) {
      wasTapRef.current = false;
      onEdit();
    }
  }, [onEdit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") triggerDelete();
    },
    [triggerDelete],
  );

  useEffect(() => {
    return () => {
      if (deleteRef.current != null) clearTimeout(deleteRef.current);
      if (swipeAwayRef.current != null) clearTimeout(swipeAwayRef.current);
    };
  }, []);

  return (
    <div
      className={`notification-item${isDeleting ? " notification-item--deleting" : ""}`}
    >
      <div className="notification-item__wrapper">
        <div className="notification-item__actions">
          <button
            className="notification-item__delete-btn"
            onClick={() => onDelete(id)}
            tabIndex={offset === 0 ? -1 : 0}
            aria-hidden={offset === 0}
            aria-label="Smazat"
            style={deleteBtnStyle}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          className={`notification-item__content${isDragging ? " notification-item__content--dragging" : ""}`}
          style={contentStyle}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
          onClick={handleContentClick}
        >
          {leftSlot && (
            <span
              className="notification-item__left-slot"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {leftSlot}
            </span>
          )}
          <span>
            <span className="notification-item__title">{title}</span>
            {subtitle && <span className="notification-item__message">{subtitle}</span>}
            <span className="notification-item__sr">Swipe doleva nebo Backspace pro smazání.</span>
          </span>
        </button>
      </div>
    </div>
  );
}

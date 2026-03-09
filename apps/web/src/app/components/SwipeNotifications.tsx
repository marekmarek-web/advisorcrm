"use client";

import { useRef, useCallback, useState, useEffect } from "react";

export interface NotificationData {
  id: string;
  title: string;
  message: string;
  icon?: React.ReactNode;
  iconColor?: string;
  timestamp: Date;
}

interface SwipeNotificationItemProps {
  data: NotificationData;
  onDelete: (id: string) => void;
  delay?: number;
}

interface SwipeNotificationListProps {
  notifications: NotificationData[];
  onDelete: (id: string) => void;
  emptyMessage?: string;
}

const DELETE_THRESHOLD = 0.3;
const REVEAL_WIDTH = 92;

function getRelativeTimeString(date: Date, lang = "en-US") {
  const timeMs = typeof date === "number" ? date : date.getTime();
  const deltaSeconds = Math.round((timeMs - Date.now()) / 1000);
  const cutoffs = [
    { type: "year" as const, value: 31536000 },
    { type: "month" as const, value: 2592000 },
    { type: "week" as const, value: 604800 },
    { type: "day" as const, value: 86400 },
    { type: "hour" as const, value: 3600 },
    { type: "minute" as const, value: 60 },
    { type: "second" as const, value: 1 },
  ];
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  for (const unit of cutoffs) {
    if (Math.abs(deltaSeconds) >= unit.value) {
      return rtf.format(Math.round(deltaSeconds / unit.value), unit.type);
    }
  }
  return "just now";
}

export function SwipeNotificationItem({
  data,
  onDelete,
  delay = 0,
}: SwipeNotificationItemProps) {
  const deleteRef = useRef<ReturnType<typeof setTimeout>>();
  const swipeAwayRef = useRef<ReturnType<typeof setTimeout>>();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [offset, setOffset] = useState(0);
  const startXRef = useRef(0);
  const currentOffsetRef = useRef(0);

  const delayStyle: React.CSSProperties | undefined =
    delay > 0 ? { animationDelay: `${delay}ms` } : undefined;
  const deleteBtnStyle: React.CSSProperties = { width: `${REVEAL_WIDTH}px` };
  const contentStyle: React.CSSProperties = { transform: `translateX(${offset}px)` };

  const triggerDelete = useCallback(() => {
    setIsDeleting(true);
    deleteRef.current = setTimeout(() => onDelete(data.id), 300);
  }, [data.id, onDelete]);

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
      setIsDragging(false);
      const elementWidth = (e.currentTarget as HTMLElement).offsetWidth;
      const rawOffset = currentOffsetRef.current;
      const distance = Math.abs(rawOffset);

      if (rawOffset < 0) {
        if (distance > elementWidth * DELETE_THRESHOLD) {
          setOffset(-elementWidth);
          swipeAwayRef.current = setTimeout(triggerDelete, 100);
          return;
        }
        if (distance > REVEAL_WIDTH / 2) {
          setOffset(-REVEAL_WIDTH);
          currentOffsetRef.current = -REVEAL_WIDTH;
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") triggerDelete();
    },
    [triggerDelete],
  );

  useEffect(() => {
    return () => {
      clearTimeout(deleteRef.current);
      clearTimeout(swipeAwayRef.current);
    };
  }, []);

  return (
    <div
      className={`notification-item${isDeleting ? " notification-item--deleting" : ""}`}
      style={delayStyle}
    >
      <div className="notification-item__wrapper">
        <div className="notification-item__actions">
          <button
            className="notification-item__delete-btn"
            onClick={() => onDelete(data.id)}
            tabIndex={offset === 0 ? -1 : 0}
            aria-hidden={offset === 0}
            aria-label="Delete"
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
        >
          {data.icon && (
            <span
              className="notification-item__icon-bg"
              style={{ backgroundColor: data.iconColor }}
            >
              {data.icon}
            </span>
          )}
          <span>
            <span className="notification-item__title">{data.title}</span>
            <span className="notification-item__message">{data.message}</span>
            <span className="notification-item__timestamp">
              {getRelativeTimeString(data.timestamp)}
            </span>
            <span className="notification-item__sr">
              Press Backspace or Delete to dismiss.
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}

export function SwipeNotificationList({
  notifications,
  onDelete,
  emptyMessage = "All caught up!",
}: SwipeNotificationListProps) {
  const sorted = [...notifications].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
  );
  const delayInc = 50;

  if (notifications.length === 0) {
    return (
      <div className="notification-center">
        <div className="notification-center__empty">
          <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: "0.75em" }}>
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9zM13.73 21a2 2 0 01-3.46 0" />
          </svg>
          <p>{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="notification-center">
      {sorted.map((n, i) => (
        <SwipeNotificationItem
          key={n.id}
          data={n}
          onDelete={onDelete}
          delay={delayInc * i}
        />
      ))}
    </div>
  );
}

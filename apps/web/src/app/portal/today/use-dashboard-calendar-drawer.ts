"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";

const STORAGE_USER = "aidvisora_dashboard_calendar_user_toggled";
const STORAGE_OPEN = "aidvisora_dashboard_calendar_open";

/** Tailwind 2xl – velký desktop: panel defaultně otevřený. */
const WIDE_MEDIA = "(min-width: 1536px)";

/** Šířka pravého panelu (slide-over) v px – zarovnáno s UX sidecalendar v2 (~420). */
export const DASHBOARD_CALENDAR_DRAWER_OPEN_PX = 420;

function readUserToggled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_USER) === "1";
  } catch {
    return false;
  }
}

function readStoredOpen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_OPEN) === "1";
  } catch {
    return false;
  }
}

function persistUserChoice(open: boolean) {
  try {
    localStorage.setItem(STORAGE_USER, "1");
    localStorage.setItem(STORAGE_OPEN, open ? "1" : "0");
  } catch {
    /* noop */
  }
}

/**
 * Default: otevřeno na 2xl+, zavřeno pod tím. Po ručním přepnutí se stav ukládá a resize už nemění.
 */
export function useDashboardCalendarDrawer(): {
  open: boolean;
  setOpen: (value: boolean) => void;
  toggle: () => void;
} {
  const [open, setOpenState] = useState(false);

  useLayoutEffect(() => {
    const userToggled = readUserToggled();
    if (userToggled) {
      setOpenState(readStoredOpen());
      return;
    }
    const mq = window.matchMedia(WIDE_MEDIA);
    setOpenState(mq.matches);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(WIDE_MEDIA);
    const onChange = () => {
      if (readUserToggled()) return;
      setOpenState(mq.matches);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setOpen = useCallback((value: boolean) => {
    persistUserChoice(value);
    setOpenState(value);
  }, []);

  const toggle = useCallback(() => {
    setOpenState((prev) => {
      const next = !prev;
      persistUserChoice(next);
      return next;
    });
  }, []);

  return { open, setOpen, toggle };
}

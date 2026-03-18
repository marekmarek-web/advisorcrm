"use client";

import { useEffect, useState } from "react";

type KeyboardAwareState = {
  keyboardInset: number;
  keyboardOpen: boolean;
};

export function useKeyboardAware(): KeyboardAwareState {
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;

    const viewport = window.visualViewport;
    const threshold = 80;

    const update = () => {
      const nextInset = Math.max(0, window.innerHeight - (viewport.height + viewport.offsetTop));
      setKeyboardInset(nextInset > threshold ? Math.round(nextInset) : 0);
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);

    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return {
    keyboardInset,
    keyboardOpen: keyboardInset > 0,
  };
}

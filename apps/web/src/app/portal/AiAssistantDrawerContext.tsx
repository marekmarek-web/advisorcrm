"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type AiAssistantDrawerContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const AiAssistantDrawerContext = createContext<AiAssistantDrawerContextValue | null>(null);

export function AiAssistantDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <AiAssistantDrawerContext.Provider value={{ open, setOpen }}>
      {children}
    </AiAssistantDrawerContext.Provider>
  );
}

export function useAiAssistantDrawer(): AiAssistantDrawerContextValue {
  const ctx = useContext(AiAssistantDrawerContext);
  if (!ctx) {
    throw new Error("useAiAssistantDrawer must be used within AiAssistantDrawerProvider");
  }
  return ctx;
}

/** V částech sdílených s legacy layoutem – v portálu vrací stejné jako hook výše, jinde null. */
export function useOptionalAiAssistantDrawer(): AiAssistantDrawerContextValue | null {
  return useContext(AiAssistantDrawerContext);
}

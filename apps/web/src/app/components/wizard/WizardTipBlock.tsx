"use client";

import { Sparkles } from "lucide-react";

export function WizardTipBlock({
  children,
  icon: Icon = Sparkles,
}: {
  children: React.ReactNode;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="mt-6 bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-start gap-3">
      <Icon size={18} className="text-indigo-500 mt-0.5 shrink-0" />
      <p className="text-sm font-medium text-indigo-900/80 leading-relaxed">
        {children}
      </p>
    </div>
  );
}

"use client";

import type { LucideIcon } from "lucide-react";
import { wizardInputWithIconClass } from "./wizard-styles";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function WizardInputWithIcon({
  icon: Icon,
  className = "",
  ...props
}: InputProps & { icon: LucideIcon }) {
  return (
    <div className="relative">
      <Icon
        size={18}
        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        aria-hidden
      />
      <input
        {...props}
        className={`${wizardInputWithIconClass} ${className}`.trim()}
      />
    </div>
  );
}

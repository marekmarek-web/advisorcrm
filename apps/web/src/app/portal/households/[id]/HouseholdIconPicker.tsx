"use client";

import { Home, Users, Heart, Building2, Sparkles, TreePine, UtensilsCrossed } from "lucide-react";

export const HOUSEHOLD_ICONS = [
  { id: "home", label: "Domov", Icon: Home },
  { id: "users", label: "Rodina", Icon: Users },
  { id: "heart", label: "Srdce", Icon: Heart },
  { id: "building", label: "Dům", Icon: Building2 },
  { id: "sparkles", label: "Hvězdy", Icon: Sparkles },
  { id: "tree", label: "Příroda", Icon: TreePine },
  { id: "utensils", label: "Jídlo", Icon: UtensilsCrossed },
] as const;

export type HouseholdIconId = (typeof HOUSEHOLD_ICONS)[number]["id"];

function getIconById(id: string | null) {
  if (!id) return HOUSEHOLD_ICONS[0];
  return HOUSEHOLD_ICONS.find((i) => i.id === id) ?? HOUSEHOLD_ICONS[0];
}

export function HouseholdIconDisplay({ iconId }: { iconId: string | null }) {
  const { Icon } = getIconById(iconId);
  return (
    <div
      className="w-14 h-14 md:w-16 md:h-16 rounded-[var(--wp-radius-sm)] bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0"
      aria-hidden
    >
      <Icon size={28} className="md:w-8 md:h-8" strokeWidth={1.8} />
    </div>
  );
}

export function HouseholdIconPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (iconId: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {HOUSEHOLD_ICONS.map(({ id, Icon }) => (
        <button
          key={id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value === id ? null : id)}
          className={`w-10 h-10 rounded-[var(--wp-radius-sm)] border flex items-center justify-center transition-all shrink-0 disabled:opacity-50 ${
            value === id
              ? "bg-indigo-100 border-indigo-300 text-indigo-700"
              : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
          }`}
          title={HOUSEHOLD_ICONS.find((i) => i.id === id)?.label}
          aria-label={HOUSEHOLD_ICONS.find((i) => i.id === id)?.label}
        >
          <Icon size={20} strokeWidth={1.8} />
        </button>
      ))}
    </div>
  );
}

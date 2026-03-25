"use client";

import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { MobileCard } from "@/app/shared/mobile-ui/primitives";

export function PlaceholderScreen({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  const router = useRouter();
  return (
    <div className="space-y-4 pt-2">
      <MobileCard className="p-6 text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 mx-auto flex items-center justify-center">
          <Icon size={28} className="text-indigo-600" />
        </div>
        <h2 className="text-lg font-black text-slate-900">{title}</h2>
        <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
        <p className="text-xs text-slate-500">
          Plná verze této sekce je dostupná v desktopovém prohlížeči. Mobilní rozhraní se doplňuje postupně.
        </p>
        <button
          type="button"
          onClick={() => router.push("/portal/today")}
          className="w-full min-h-[48px] rounded-xl bg-indigo-600 text-white text-sm font-black active:scale-[0.99] transition-transform"
        >
          Zpět na nástěnku
        </button>
      </MobileCard>
    </div>
  );
}

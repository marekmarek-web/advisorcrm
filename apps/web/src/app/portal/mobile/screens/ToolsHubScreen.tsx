"use client";

import { useRouter } from "next/navigation";
import {
  Calendar,
  MessageSquare,
  FileText,
  Home,
  TrendingUp,
  Target,
  BarChart2,
  Calculator,
  HardDrive,
  Mail,
  Bell,
  Settings,
  Users,
  Megaphone,
} from "lucide-react";
import { AiAssistantBrandIcon } from "@/app/components/AiAssistantBrandIcon";
import { MobileCard, MobileSection } from "@/app/shared/mobile-ui/primitives";
import type { DeviceClass } from "@/lib/ui/useDeviceClass";
import { isColdContactsEnabled } from "@/lib/portal/cold-contacts-enabled";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type ToolItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

type ToolSection = {
  title: string;
  items: ToolItem[];
  roleKey?: "teamOverview";
};

const TOOL_SECTIONS: ToolSection[] = [
  {
    title: "Přehled",
    items: [
      { label: "Kalendář", href: "/portal/calendar", icon: Calendar },
      { label: "Zprávy", href: "/portal/messages", icon: MessageSquare },
      { label: "Zápisky", href: "/portal/notes", icon: FileText },
    ],
  },
  {
    title: "AI Asistent",
    items: [
      { label: "AI Chat", href: "/portal/ai", icon: AiAssistantBrandIcon },
    ],
  },
  {
    title: "Klientská databáze",
    items: [
      { label: "Domácnosti", href: "/portal/households", icon: Home },
      ...(isColdContactsEnabled()
        ? ([{ label: "Studené kontakty", href: "/portal/cold-contacts", icon: Users }] as ToolItem[])
        : []),
      { label: "E-mail kampaně", href: "/portal/email-campaigns", icon: Megaphone },
    ],
  },
  {
    title: "Obchod a byznys",
    items: [
      { label: "Produkce", href: "/portal/production", icon: TrendingUp },
      { label: "Můj plán", href: "/portal/business-plan", icon: Target },
      { label: "Můj tým", href: "/portal/team-overview", icon: Users, },
    ],
    roleKey: "teamOverview",
  },
  {
    title: "Nástroje poradce",
    items: [
      { label: "AI smlouvy", href: "/portal/contracts/review", icon: AiAssistantBrandIcon },
      { label: "Dokumenty", href: "/portal/documents", icon: FileText },
      { label: "Finanční analýzy", href: "/portal/analyses", icon: BarChart2 },
      { label: "Kalkulačky", href: "/portal/calculators", icon: Calculator },
    ],
  },
  {
    title: "Integrace",
    items: [
      { label: "Google Disk", href: "/portal/tools/drive", icon: HardDrive },
      { label: "Gmail", href: "/portal/tools/gmail", icon: Mail },
    ],
  },
  {
    title: "Systém",
    items: [
      { label: "Klientské požadavky", href: "/portal/notifications", icon: Bell },
      { label: "Nastavení", href: "/portal/setup", icon: Settings },
    ],
  },
];

export function ToolsHubScreen({
  showTeamOverview = true,
  deviceClass = "phone",
}: {
  showTeamOverview?: boolean;
  deviceClass?: DeviceClass;
}) {
  const router = useRouter();

  const visibleSections = TOOL_SECTIONS.map((section) => {
    if (section.roleKey === "teamOverview" && !showTeamOverview) {
      return {
        ...section,
        items: section.items.filter((item) => item.href !== "/portal/team-overview"),
      };
    }
    return section;
  }).filter((section) => section.items.length > 0);

  return (
    <div className="space-y-4 pt-2 pb-4">
      {visibleSections.map((section) => (
        <MobileSection key={section.title} title={section.title}>
          <div
            className={cx(
              deviceClass === "tablet" ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"
            )}
          >
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <MobileCard key={item.href} className="p-0">
                  <button
                    type="button"
                    onClick={() => router.push(item.href)}
                    className="w-full text-left px-3 py-3.5 min-h-[56px] flex items-center gap-2.5"
                  >
                    <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                      <Icon size={16} className="text-indigo-600" />
                    </span>
                    <span className="text-sm font-bold text-[color:var(--wp-text)] leading-tight">{item.label}</span>
                  </button>
                </MobileCard>
              );
            })}
          </div>
        </MobileSection>
      ))}
    </div>
  );
}

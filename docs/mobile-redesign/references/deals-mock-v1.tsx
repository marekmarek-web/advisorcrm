import React, { useMemo, useRef, useState } from "react";

type ScreenKey = "dashboard" | "tasks" | "clients" | "deals";
type StageKey = "start" | "analysis" | "offer" | "preclose" | "execution";
type LoadState = "ready" | "loading" | "error";

type Deal = {
  id: string;
  title: string;
  category: string;
  client: string;
  value: number;
  stage: StageKey;
  nextStep: string;
  dueLabel?: string;
  risky?: boolean;
};

type IconName =
  | "menu"
  | "search"
  | "bell"
  | "plus"
  | "close"
  | "check"
  | "calendar"
  | "task"
  | "users"
  | "briefcase"
  | "grid"
  | "arrow"
  | "chevron"
  | "swap"
  | "money"
  | "trend"
  | "target"
  | "clock"
  | "spark"
  | "more"
  | "grip";

const cx = (...v: Array<string | false | null | undefined>) =>
  v.filter(Boolean).join(" ");

const ICONS: Record<IconName, string[]> = {
  menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
  search: [
    "M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z",
    "M21 21l-4.35-4.35",
  ],
  bell: [
    "M15 17h5l-1.45-1.45A2 2 0 0 1 18 14.14V11a6 6 0 0 0-12 0v3.14c0 .53-.21 1.04-.59 1.41L4 17h5",
    "M9.5 20a2.5 2.5 0 0 0 5 0",
  ],
  plus: ["M12 5v14", "M5 12h14"],
  close: ["M18 6 6 18", "M6 6l12 12"],
  check: ["M20 6L9 17l-5-5"],
  calendar: [
    "M8 3v4",
    "M16 3v4",
    "M4 9h16",
    "M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  ],
  task: [
    "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z",
    "M8 12l2.5 2.5L16 9",
  ],
  users: [
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    "M22 21v-2a4 4 0 0 0-3-3.87",
    "M16 3.13a4 4 0 0 1 0 7.75",
  ],
  briefcase: [
    "M8 7V5a4 4 0 0 1 8 0v2",
    "M4 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z",
    "M2 12h20",
  ],
  grid: [
    "M4 4h6v6H4z",
    "M14 4h6v6h-6z",
    "M4 14h6v6H4z",
    "M14 14h6v6h-6z",
  ],
  arrow: ["M5 12h14", "M13 6l6 6-6 6"],
  chevron: ["M9 18l6-6-6-6"],
  swap: [
    "M17 3l4 4-4 4",
    "M3 7h18",
    "M7 21l-4-4 4-4",
    "M21 17H3",
  ],
  money: [
    "M3 7h18v10H3z",
    "M7 12h.01",
    "M17 12h.01",
    "M12 12a2.5 2.5 0 1 0 0 .01Z",
  ],
  trend: ["M4 16l5-5 4 4 7-8", "M14 7h6v6"],
  target: [
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
    "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z",
    "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  ],
  clock: [
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
    "M12 7v5l3 2",
  ],
  spark: [
    "M12 3l1.85 5.45L19 10l-5.15 1.55L12 17l-1.85-5.45L5 10l5.15-1.55Z",
  ],
  more: ["M6 12h.01", "M12 12h.01", "M18 12h.01"],
  grip: [
    "M8 5h.01",
    "M8 12h.01",
    "M8 19h.01",
    "M16 5h.01",
    "M16 12h.01",
    "M16 19h.01",
  ],
};

const STAGES: Array<{
  key: StageKey;
  index: number;
  title: string;
  subtitle: string;
  gradient: string;
  shadow: string;
  dot: string;
}> = [
  {
    key: "start",
    index: 1,
    title: "Začínáme",
    subtitle: "K volání / domluvit",
    gradient: "from-emerald-500 via-teal-500 to-cyan-500",
    shadow: "shadow-[0_24px_60px_-26px_rgba(16,185,129,.62)]",
    dot: "bg-emerald-300",
  },
  {
    key: "analysis",
    index: 2,
    title: "Analýza potřeb",
    subtitle: "Schůzka / podklady",
    gradient: "from-sky-500 via-blue-500 to-indigo-500",
    shadow: "shadow-[0_24px_60px_-26px_rgba(14,165,233,.62)]",
    dot: "bg-sky-300",
  },
  {
    key: "offer",
    index: 3,
    title: "Šla nabídka",
    subtitle: "Modelace / nabídka",
    gradient: "from-violet-500 via-indigo-500 to-blue-900",
    shadow: "shadow-[0_24px_60px_-26px_rgba(99,102,241,.65)]",
    dot: "bg-violet-300",
  },
  {
    key: "preclose",
    index: 4,
    title: "Před uzavřením",
    subtitle: "Finalizace",
    gradient: "from-orange-400 via-orange-500 to-amber-700",
    shadow: "shadow-[0_24px_60px_-26px_rgba(249,115,22,.65)]",
    dot: "bg-orange-300",
  },
  {
    key: "execution",
    index: 5,
    title: "Realizace",
    subtitle: "Čeká na dokončení",
    gradient: "from-rose-500 via-pink-600 to-fuchsia-700",
    shadow: "shadow-[0_24px_60px_-26px_rgba(244,63,94,.68)]",
    dot: "bg-rose-300",
  },
];

const seedDeals: Deal[] = [
  {
    id: "d1",
    title: "Životní pojištění",
    category: "ŽP",
    client: "Marek Marek",
    value: 89000,
    stage: "start",
    nextStep: "Domluvit termín",
  },
  {
    id: "d2",
    title: "Míra Rudak - ŽP",
    category: "ŽP",
    client: "Miroslav Rudak",
    value: 42000,
    stage: "start",
    nextStep: "Zavolat klientovi",
  },
  {
    id: "d3",
    title: "Míra R. - Hypo",
    category: "Hypotéka",
    client: "Miroslav Rudak",
    value: 47000,
    stage: "start",
    nextStep: "Ověřit podklady",
  },
  {
    id: "d4",
    title: "Mráz hypotéka",
    category: "Hypotéka",
    client: "Břetislav Mráz",
    value: 48000,
    stage: "analysis",
    nextStep: "Sběr podkladů",
  },
  {
    id: "d5",
    title: "Havdan - Amundi + Atris",
    category: "Investice",
    client: "Ivan Havdan",
    value: 20000,
    stage: "analysis",
    nextStep: "Doplnit profil",
  },
  {
    id: "d6",
    title: "Lucie Opalecká - ŽP",
    category: "ŽP",
    client: "Lucie Opalecká",
    value: 50000,
    stage: "offer",
    nextStep: "Čeká na reakci",
  },
  {
    id: "d7",
    title: "Opalecká - ČS hypotéka",
    category: "Hypotéka",
    client: "Lucie Opalecká",
    value: 47000,
    stage: "offer",
    nextStep: "Nabídka odeslána",
  },
  {
    id: "d8",
    title: "Šebová úprava ŽP",
    category: "Úprava smlouvy",
    client: "Eva Šebová",
    value: 5000,
    stage: "offer",
    nextStep: "Doplnit dotazník",
  },
  {
    id: "d9",
    title: "Životní pojištění",
    category: "ŽP",
    client: "Kateřina Marková",
    value: 13000,
    stage: "execution",
    nextStep: "Urgovat podpis",
    dueLabel: "Prošlé",
    risky: true,
  },
  {
    id: "d10",
    title: "Refinancování hypotéky",
    category: "Hypotéka",
    client: "Marek Marek",
    value: 50000,
    stage: "execution",
    nextStep: "Čeká banka",
    dueLabel: "2 dny",
  },
];

function Icon({
  name,
  size = 20,
  strokeWidth = 2.25,
  className = "",
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {(ICONS[name] || ICONS.task).map((d, i) => (
        <path key={`${name}-${i}`} d={d} />
      ))}
    </svg>
  );
}

function moneyFull(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 Kč";
  return `${value.toLocaleString("cs-CZ")} Kč`;
}

function moneyShort(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 Kč";

  if (value >= 1_000_000) {
    const amount = value / 1_000_000;
    return `${amount.toLocaleString("cs-CZ", {
      maximumFractionDigits: amount >= 10 ? 0 : 1,
    })} mil. Kč`;
  }

  if (value >= 1000) {
    return `${Math.round(value / 1000).toLocaleString("cs-CZ")} tis. Kč`;
  }

  return `${value.toLocaleString("cs-CZ")} Kč`;
}

function stageMeta(stageKey: StageKey) {
  return STAGES.find((s) => s.key === stageKey) || STAGES[0];
}

function TextClamp({
  children,
  lines = 1,
  className = "",
}: {
  children: React.ReactNode;
  lines?: number;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: lines,
        overflow: "hidden",
      }}
    >
      {children}
    </span>
  );
}

function StatusBar() {
  return (
    <div className="relative z-30 flex h-12 items-end justify-between px-7 pb-2 text-[13px] font-black text-slate-950">
      <span>13:49</span>
      <div className="absolute left-1/2 top-3 h-8 w-32 -translate-x-1/2 rounded-full bg-black" />
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400/60" />
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400/60" />
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400/60" />
        <span className="h-3.5 w-6 rounded-[5px] border border-slate-700">
          <span className="m-[2px] block h-2 w-4 rounded-[3px] bg-slate-800" />
        </span>
      </div>
    </div>
  );
}

function TopNav({ onMenu }: { onMenu: () => void }) {
  return (
    <div className="relative z-30 px-6 pb-2 pt-2">
      <div className="flex h-[52px] items-center justify-between">
        <button
          onClick={onMenu}
          className="grid h-12 w-12 place-items-center rounded-[20px] border border-white/70 bg-white/45 text-slate-950 shadow-[0_12px_26px_rgba(15,23,42,.06)] ring-1 ring-slate-200/35 backdrop-blur-2xl active:scale-95"
          aria-label="Menu"
        >
          <Icon name="menu" size={24} strokeWidth={2.5} />
        </button>

        <div className="flex items-center gap-2">
          <button
            className="grid h-12 w-12 place-items-center rounded-[20px] border border-white/70 bg-white/45 text-slate-950 shadow-[0_12px_26px_rgba(15,23,42,.06)] ring-1 ring-slate-200/35 backdrop-blur-2xl active:scale-95"
            aria-label="Hledat"
          >
            <Icon name="search" size={22} strokeWidth={2.5} />
          </button>

          <button
            className="grid h-12 w-12 place-items-center rounded-[20px] border border-white/70 bg-white/45 shadow-[0_12px_26px_rgba(15,23,42,.06)] ring-1 ring-slate-200/35 backdrop-blur-2xl active:scale-95"
            aria-label="AI"
          >
            <span className="-mt-0.5 bg-gradient-to-br from-violet-800 via-violet-600 to-indigo-500 bg-clip-text text-[22px] font-black italic leading-none text-transparent">
              Ai
            </span>
          </button>

          <button
            className="relative grid h-12 w-12 place-items-center rounded-[20px] border border-white/70 bg-white/45 text-slate-950 shadow-[0_12px_26px_rgba(15,23,42,.06)] ring-1 ring-slate-200/35 backdrop-blur-2xl active:scale-95"
            aria-label="Notifikace"
          >
            <Icon name="bell" size={21} strokeWidth={2.45} />
            <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
          </button>
        </div>
      </div>
    </div>
  );
}

function PagePill({ hidden }: { hidden: boolean }) {
  return (
    <div
      className={cx(
        "pointer-events-none absolute inset-x-0 top-[118px] z-50 flex justify-center transition-all duration-300 ease-out",
        hidden
          ? "-translate-y-5 scale-95 opacity-0"
          : "translate-y-0 scale-100 opacity-100"
      )}
    >
      <span className="inline-flex h-8 items-center rounded-full border border-white/75 bg-white/72 px-5 text-[13px] font-black text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,.9),0_10px_26px_rgba(15,23,42,.06)] ring-1 ring-slate-200/40 backdrop-blur-xl">
        Obchody
      </span>
    </div>
  );
}

function BottomNav({
  hidden,
  screen,
  setScreen,
  onPlus,
}: {
  hidden: boolean;
  screen: ScreenKey;
  setScreen: (screen: ScreenKey) => void;
  onPlus: () => void;
}) {
  const items: Array<{
    id?: ScreenKey;
    label?: string;
    icon?: IconName;
    action?: boolean;
  }> = [
    { id: "dashboard", label: "Přehled", icon: "grid" },
    { id: "tasks", label: "Úkoly", icon: "task" },
    { action: true },
    { id: "clients", label: "Klienti", icon: "users" },
    { id: "deals", label: "Obchody", icon: "briefcase" },
  ];

  return (
    <div
      className={cx(
        "absolute inset-x-0 bottom-6 z-40 flex justify-center px-4 transition-all duration-500 ease-out",
        hidden ? "translate-y-32 opacity-0" : "translate-y-0 opacity-100"
      )}
    >
      <nav className="relative flex h-[68px] w-full max-w-[370px] items-center justify-between rounded-full border border-white/60 bg-white/72 px-3 shadow-[0_20px_40px_-10px_rgba(15,23,42,.22)] ring-1 ring-white/50 backdrop-blur-[22px]">
        <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-b from-white/70 to-transparent opacity-60" />
        <div className="pointer-events-none absolute inset-x-14 top-0 h-px bg-white" />

        {items.map((item, index) => {
          if (item.action) {
            return (
              <div key="plus" className="relative z-10 flex w-[58px] justify-center">
                <button
                  onClick={onPlus}
                  className="absolute -top-[43px] grid h-[64px] w-[64px] place-items-center rounded-full bg-slate-950 text-white shadow-[0_16px_32px_rgba(15,23,42,.42)] ring-[4px] ring-white/90 active:scale-95"
                  aria-label="Nový obchod"
                >
                  <Icon name="plus" size={30} strokeWidth={2.5} />
                </button>
              </div>
            );
          }

          const active = screen === item.id;

          return (
            <button
              key={`${item.id}-${index}`}
              onClick={() => item.id && setScreen(item.id)}
              className={cx(
                "relative z-10 flex h-[56px] min-w-[54px] items-center justify-center rounded-full px-2 transition-all duration-300 active:scale-95",
                active ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
              )}
              aria-label={item.label}
            >
              <span className="flex flex-col items-center gap-1">
                <span className="relative">
                  <Icon
                    name={item.icon || "grid"}
                    size={22}
                    strokeWidth={active ? 2.6 : 2.25}
                  />

                  {item.id === "tasks" && (
                    <span className="absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white ring-2 ring-white">
                      9+
                    </span>
                  )}
                </span>

                <span
                  className={cx(
                    "text-[10px] font-black leading-none",
                    active ? "text-indigo-600" : "text-slate-500"
                  )}
                >
                  {item.label}
                </span>
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function KpiBento({
  totalCount,
  totalValue,
  riskCount,
  focusCount,
}: {
  totalCount: number;
  totalValue: number;
  riskCount: number;
  focusCount: number;
}) {
  return (
    <section className="mb-7">
      <div className="grid grid-cols-2 gap-4">
        <div className="relative col-span-2 min-h-[238px] overflow-hidden rounded-[36px] bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700 p-6 text-white shadow-[0_28px_70px_-28px_rgba(37,99,235,.62)]">
          <div className="absolute -left-10 -top-12 h-44 w-44 rounded-full bg-white/10" />
          <div className="absolute -bottom-16 right-0 h-44 w-44 rounded-full bg-indigo-950/18 blur-[6px]" />
          <div className="absolute right-7 top-7 rounded-full border border-white/20 bg-white/14 px-4 py-2 text-[13px] font-black shadow-[inset_0_1px_0_rgba(255,255,255,.18)] backdrop-blur-md">
            {moneyShort(totalValue)}
          </div>

          <div className="relative">
            <span className="mb-8 grid h-[74px] w-[74px] place-items-center rounded-[28px] border border-white/20 bg-white/12 shadow-[inset_0_1px_0_rgba(255,255,255,.18)] backdrop-blur-md">
              <Icon name="trend" size={30} strokeWidth={2.5} />
            </span>

            <p className="text-[15px] font-black text-white/84">
              Potenciál pipeline
            </p>

            <div className="mt-2 flex items-end gap-3">
              <span className="text-[58px] font-black leading-none tracking-tight">
                {totalCount}
              </span>
              <span className="pb-2 text-[18px] font-bold text-white/72">
                případů
              </span>
            </div>

            <p className="mt-4 text-[14px] font-semibold text-white/74">
              aktivní obchodní příležitosti poradce
            </p>
          </div>
        </div>

        <div className="relative min-h-[176px] overflow-hidden rounded-[32px] bg-gradient-to-br from-orange-400 via-orange-500 to-amber-700 p-5 text-white shadow-[0_24px_58px_-26px_rgba(249,115,22,.62)]">
          <div className="absolute -left-8 -top-10 h-32 w-32 rounded-full bg-white/12" />
          <div className="absolute -bottom-12 right-0 h-28 w-28 rounded-full bg-black/10 blur-[2px]" />

          <div className="relative">
            <div className="mb-8 flex items-start justify-between gap-2">
              <span className="grid h-[56px] w-[56px] place-items-center rounded-[22px] border border-white/18 bg-white/12 backdrop-blur-md">
                <Icon name="clock" size={24} strokeWidth={2.5} />
              </span>

              <span className="rounded-full border border-white/18 bg-white/14 px-3 py-1.5 text-[11px] font-black backdrop-blur-md">
                riziko
              </span>
            </div>

            <p className="text-[14px] font-black text-white/84">Rizikové</p>
            <p className="mt-2 text-[48px] font-black leading-none">{riskCount}</p>
            <p className="mt-3 text-[14px] font-semibold text-white/72">
              ke kontrole
            </p>
          </div>
        </div>

        <div className="relative min-h-[176px] overflow-hidden rounded-[32px] bg-gradient-to-br from-violet-500 via-indigo-500 to-slate-950 p-5 text-white shadow-[0_24px_58px_-26px_rgba(99,102,241,.62)]">
          <div className="absolute -left-8 -top-10 h-32 w-32 rounded-full bg-white/12" />
          <div className="absolute -bottom-12 right-0 h-28 w-28 rounded-full bg-black/10 blur-[2px]" />

          <div className="relative">
            <div className="mb-8 flex items-start justify-between gap-2">
              <span className="grid h-[56px] w-[56px] place-items-center rounded-[22px] border border-white/18 bg-white/12 backdrop-blur-md">
                <Icon name="target" size={24} strokeWidth={2.5} />
              </span>

              <span className="rounded-full border border-white/18 bg-white/14 px-3 py-1.5 text-[11px] font-black backdrop-blur-md">
                fokus
              </span>
            </div>

            <p className="text-[14px] font-black text-white/84">Ve fokusu</p>
            <p className="mt-2 text-[48px] font-black leading-none">{focusCount}</p>
            <p className="mt-3 text-[14px] font-semibold text-white/72">
              prioritně
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function FocusDealCard({
  deal,
  riskCount,
}: {
  deal: Deal | undefined;
  riskCount: number;
}) {
  return (
    <section className="relative mb-7 overflow-hidden rounded-[34px] bg-slate-950 p-5 text-white shadow-[0_24px_64px_-22px_rgba(15,23,42,.48)]">
      <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-indigo-500/30 blur-[58px]" />
      <div className="absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-violet-500/20 blur-[58px]" />

      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[16px] bg-white/10 text-violet-100 ring-1 ring-white/15">
              <Icon name="spark" size={20} />
            </span>

            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/55">
                Fokus obchody
              </p>
              <p className="mt-1 text-[13px] font-semibold text-white/70">
                Priorita pro dnešek
              </p>
            </div>
          </div>

          {riskCount > 0 && (
            <span className="shrink-0 rounded-full bg-rose-500/16 px-3 py-1.5 text-[11px] font-black text-rose-100 ring-1 ring-rose-300/20">
              {riskCount} riziko
            </span>
          )}
        </div>

        <div className="mt-6">
          <TextClamp
            lines={2}
            className="text-[25px] font-black leading-[1.08] tracking-tight"
          >
            {deal?.title || "Pipeline bez rizika"}
          </TextClamp>

          <div className="mt-3 flex min-w-0 items-center gap-2 text-[13px] font-semibold text-white/64">
            <span className="min-w-0 overflow-hidden whitespace-nowrap">
              {deal?.client || "Žádný urgentní případ"}
            </span>
            <span className="shrink-0">•</span>
            <span className="shrink-0 whitespace-nowrap">
              {deal ? moneyFull(deal.value) : "0 Kč"}
            </span>
          </div>

          {deal?.nextStep && (
            <p className="mt-3 text-[13px] font-semibold text-white/52">
              Další krok: {deal.nextStep}
            </p>
          )}
        </div>

        <button className="mt-6 flex h-[52px] w-full items-center justify-center gap-2 rounded-[20px] bg-white text-[14px] font-black text-slate-950 shadow-[0_12px_30px_-16px_rgba(255,255,255,.8)] active:scale-[.98]">
          Otevřít detail
          <Icon name="arrow" size={18} />
        </button>
      </div>
    </section>
  );
}

function StageBentoCard({
  stage,
  count,
  total,
  active,
  large = false,
  onClick,
}: {
  stage: (typeof STAGES)[number];
  count: number;
  total: number;
  active: boolean;
  large?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "relative overflow-hidden rounded-[32px] bg-gradient-to-br p-5 text-left text-white transition-all active:scale-[.985]",
        stage.gradient,
        stage.shadow,
        large ? "col-span-2 min-h-[188px]" : "min-h-[172px]",
        active ? "ring-[3px] ring-white/95" : "ring-1 ring-white/18"
      )}
    >
      <div className="absolute -left-10 -top-10 h-36 w-36 rounded-full bg-white/12" />
      <div className="absolute -bottom-12 right-0 h-32 w-32 rounded-full bg-black/12 blur-[2px]" />

      <div className="relative">
        <div className="mb-7 flex items-start justify-between gap-3">
          <span
            className={cx(
              "grid place-items-center rounded-[22px] border border-white/18 bg-white/12 shadow-[inset_0_1px_0_rgba(255,255,255,.18)] backdrop-blur-md",
              large ? "h-[62px] w-[62px]" : "h-[54px] w-[54px]"
            )}
          >
            <span className={cx("font-black leading-none", large ? "text-[25px]" : "text-[22px]")}>
              {stage.index}
            </span>
          </span>

          <span className="shrink-0 rounded-full border border-white/18 bg-white/14 px-3 py-1.5 text-[11px] font-black shadow-[inset_0_1px_0_rgba(255,255,255,.16)] backdrop-blur-md">
            {moneyShort(total)}
          </span>
        </div>

        <p className={cx("font-black text-white/90", large ? "text-[18px]" : "text-[15px]")}>
          {stage.title}
        </p>

        <div className="mt-2 flex items-end gap-2">
          <span className={cx("font-black leading-none tracking-tight", large ? "text-[46px]" : "text-[38px]")}>
            {count}
          </span>
          <span className="pb-1 text-[14px] font-bold text-white/74">
            případů
          </span>
        </div>

        <p className="mt-3 text-[13px] font-semibold text-white/76">
          {stage.subtitle}
        </p>
      </div>
    </button>
  );
}

function PipelineStageBento({
  grouped,
  activeStage,
  setActiveStage,
}: {
  grouped: Array<
    (typeof STAGES)[number] & {
      items: Deal[];
      count: number;
      total: number;
      riskCount: number;
    }
  >;
  activeStage: StageKey | "all";
  setActiveStage: (stage: StageKey | "all") => void;
}) {
  const byKey = Object.fromEntries(grouped.map((g) => [g.key, g]));

  const ordered: Array<{ key: StageKey; large?: boolean }> = [
    { key: "start", large: true },
    { key: "analysis" },
    { key: "offer" },
    { key: "preclose" },
    { key: "execution" },
  ];

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[12px] font-black uppercase tracking-[0.16em] text-slate-500">
            Fáze pipeline
          </p>
          <p className="mt-1 text-[13px] font-semibold text-slate-500">
            Barevný přehled stavu obchodů
          </p>
        </div>

        <button
          onClick={() => setActiveStage("all")}
          className={cx(
            "rounded-full px-3 py-1.5 text-[12px] font-black active:scale-95",
            activeStage === "all"
              ? "bg-slate-950 text-white"
              : "bg-white/76 text-slate-500"
          )}
        >
          Vše
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {ordered.map(({ key, large }) => {
          const group = byKey[key];
          return (
            <StageBentoCard
              key={key}
              stage={group}
              count={group.count}
              total={group.total}
              large={large}
              active={activeStage === key}
              onClick={() => setActiveStage(activeStage === key ? "all" : key)}
            />
          );
        })}
      </div>
    </section>
  );
}

function DealCard({
  deal,
  dragging,
  onOpenMove,
  onDragStart,
  onDragEnd,
}: {
  deal: Deal;
  dragging: boolean;
  onOpenMove: (deal: Deal) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, dealId: string) => void;
  onDragEnd: () => void;
}) {
  const stage = stageMeta(deal.stage);

  return (
    <div
      draggable
      onDragStart={(event) => onDragStart(event, deal.id)}
      onDragEnd={onDragEnd}
      className={cx(
        "overflow-hidden rounded-[26px] border bg-white/96 shadow-[0_15px_34px_-26px_rgba(15,23,42,.28)] ring-1 ring-slate-200/50 backdrop-blur-xl transition-all",
        deal.risky ? "border-rose-200" : "border-white/80",
        dragging ? "scale-[.985] opacity-55 ring-2 ring-indigo-200" : "opacity-100"
      )}
    >
      <div className="grid grid-cols-[1fr_74px]">
        <button className="min-w-0 p-[18px] text-left active:bg-slate-50">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex min-w-0 items-center gap-2">
                <span
                  className={cx(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-[12px] bg-gradient-to-br text-white",
                    stage.gradient
                  )}
                >
                  <Icon name="briefcase" size={16} />
                </span>

                <TextClamp
                  lines={2}
                  className="text-[17px] font-black leading-[1.15] tracking-tight text-slate-950"
                >
                  {deal.title}
                </TextClamp>
              </div>

              <p className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">
                {deal.category}
              </p>
            </div>

            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-50 text-slate-400">
              <Icon name="chevron" size={17} />
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex max-w-[145px] items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1.5 text-[11px] font-black text-slate-600">
              <Icon name="users" size={13} />
              <span className="overflow-hidden whitespace-nowrap">{deal.client}</span>
            </span>

            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1.5 text-[11px] font-black text-emerald-700">
              <Icon name="money" size={13} />
              <span className="whitespace-nowrap">{moneyShort(deal.value)}</span>
            </span>

            {deal.dueLabel && (
              <span
                className={cx(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-black",
                  deal.risky
                    ? "bg-rose-50 text-rose-600"
                    : "bg-slate-50 text-slate-600"
                )}
              >
                <Icon name="calendar" size={13} />
                <span className="whitespace-nowrap">{deal.dueLabel}</span>
              </span>
            )}
          </div>

          <TextClamp
            lines={1}
            className="mt-3 text-[12px] font-semibold text-slate-500"
          >
            Další krok: {deal.nextStep}
          </TextClamp>
        </button>

        <button
          onClick={(event) => {
            event.stopPropagation();
            onOpenMove(deal);
          }}
          className="flex flex-col items-center justify-center gap-2 border-l border-slate-100 bg-white/80 text-slate-500 active:bg-slate-50"
          aria-label="Přesunout fázi"
        >
          <Icon name="swap" size={23} />
          <span className="text-[10px] font-black uppercase tracking-[0.12em]">
            Fáze
          </span>
        </button>
      </div>
    </div>
  );
}

function StageSection({
  stage,
  deals,
  draggingDealId,
  dragOverStage,
  onDragStart,
  onDragEnd,
  onDragOverStage,
  onDropStage,
  onOpenMove,
}: {
  stage: (typeof STAGES)[number];
  deals: Deal[];
  draggingDealId: string | null;
  dragOverStage: StageKey | null;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, dealId: string) => void;
  onDragEnd: () => void;
  onDragOverStage: (event: React.DragEvent<HTMLDivElement>, stage: StageKey) => void;
  onDropStage: (event: React.DragEvent<HTMLDivElement>, stage: StageKey) => void;
  onOpenMove: (deal: Deal) => void;
}) {
  const total = deals.reduce((sum, deal) => sum + deal.value, 0);
  const riskCount = deals.filter((deal) => deal.risky).length;
  const isDropActive = dragOverStage === stage.key && Boolean(draggingDealId);

  return (
    <section
      onDragOver={(event) => onDragOverStage(event, stage.key)}
      onDrop={(event) => onDropStage(event, stage.key)}
      className={cx(
        "rounded-[34px] border border-white/75 bg-white/54 p-3 shadow-[0_18px_42px_-32px_rgba(15,23,42,.24)] ring-1 ring-slate-200/40 backdrop-blur-xl transition-all",
        isDropActive && "bg-indigo-50/80 ring-2 ring-indigo-200"
      )}
    >
      <div
        className={cx(
          "relative mb-3 overflow-hidden rounded-[28px] bg-gradient-to-br p-4 text-white",
          stage.gradient,
          stage.shadow
        )}
      >
        <div className="absolute -left-9 -top-9 h-28 w-28 rounded-full bg-white/12" />
        <div className="absolute -bottom-10 right-0 h-28 w-28 rounded-full bg-black/10 blur-[2px]" />

        <div className="relative flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] border border-white/18 bg-white/12 backdrop-blur-md">
              <span className="text-[20px] font-black">{stage.index}</span>
            </span>

            <div className="min-w-0">
              <p className="text-[15px] font-black text-white">{stage.title}</p>
              <p className="mt-0.5 text-[12px] font-semibold text-white/70">
                {deals.length} případů
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="rounded-full border border-white/18 bg-white/14 px-3 py-1.5 text-[11px] font-black backdrop-blur-md">
              {moneyShort(total)}
            </span>

            {riskCount > 0 && (
              <span className="rounded-full border border-white/18 bg-white/14 px-3 py-1.5 text-[11px] font-black backdrop-blur-md">
                {riskCount} riziko
              </span>
            )}
          </div>
        </div>
      </div>

      {deals.length === 0 ? (
        <div
          className={cx(
            "rounded-[24px] border border-dashed px-5 py-8 text-center text-[14px] font-semibold transition-all",
            isDropActive
              ? "border-indigo-300 bg-white text-indigo-600"
              : "border-slate-200 bg-white/60 text-slate-400"
          )}
        >
          {isDropActive ? "Pustit sem" : "Prázdná fáze"}
        </div>
      ) : (
        <div className="space-y-3">
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              dragging={draggingDealId === deal.id}
              onOpenMove={onOpenMove}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function MoveStageSheet({
  deal,
  onClose,
  onMove,
}: {
  deal: Deal | null;
  onClose: () => void;
  onMove: (dealId: string, stage: StageKey) => void;
}) {
  if (!deal) return null;

  const current = stageMeta(deal.stage);

  return (
    <div className="absolute inset-0 z-[90] overflow-hidden">
      <style>{`
        @keyframes backdropIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes sheetUp { from { transform: translate3d(0,100%,0); } to { transform: translate3d(0,0,0); } }
      `}</style>

      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/34 backdrop-blur-md"
        style={{ animation: "backdropIn 180ms ease-out both" }}
      />

      <section
        className="absolute bottom-0 left-0 right-0 max-h-[78%] rounded-t-[36px] bg-white px-5 pb-8 pt-4 shadow-[0_-28px_80px_rgba(15,23,42,.24)]"
        style={{ animation: "sheetUp 280ms cubic-bezier(.16,1,.3,1) both" }}
      >
        <div className="mx-auto mb-5 h-1.5 w-14 rounded-full bg-slate-200" />

        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[19px] border border-indigo-200 bg-indigo-50 text-indigo-600">
              <Icon name="swap" size={24} />
            </span>

            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                Přesunout případ
              </p>

              <TextClamp
                lines={2}
                className="mt-1 text-[23px] font-black leading-[1.08] tracking-tight text-slate-950"
              >
                {deal.title}
              </TextClamp>

              <p className="mt-2 text-[14px] font-semibold text-slate-500">
                Aktuální fáze:{" "}
                <span className="font-black text-slate-800">{current.title}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 active:scale-95"
            aria-label="Zavřít"
          >
            <Icon name="close" size={22} />
          </button>
        </div>

        <p className="mb-3 text-[12px] font-black uppercase tracking-[0.16em] text-slate-400">
          Vyberte fázi
        </p>

        <div className="space-y-3">
          {STAGES.map((stage) => {
            const active = stage.key === deal.stage;

            return (
              <button
                key={stage.key}
                onClick={() => {
                  if (!active) onMove(deal.id, stage.key);
                  onClose();
                }}
                className={cx(
                  "flex w-full items-center justify-between rounded-[22px] border px-4 py-4 text-left shadow-sm active:scale-[.99]",
                  active
                    ? "border-indigo-200 bg-indigo-50"
                    : "border-slate-200 bg-white"
                )}
              >
                <span className="flex min-w-0 items-center gap-3.5">
                  <span
                    className={cx(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-[15px] bg-gradient-to-br text-white",
                      stage.gradient
                    )}
                  >
                    <span className="text-[14px] font-black">{stage.index}</span>
                  </span>

                  <span className="min-w-0">
                    <span
                      className={cx(
                        "block text-[16px] font-black",
                        active ? "text-indigo-600" : "text-slate-800"
                      )}
                    >
                      {stage.title}
                    </span>

                    <span className="mt-0.5 block text-[12px] font-semibold text-slate-500">
                      {stage.subtitle}
                    </span>
                  </span>
                </span>

                {active ? (
                  <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-indigo-600">
                    Aktuální
                  </span>
                ) : (
                  <Icon name="arrow" size={18} className="shrink-0 text-slate-400" />
                )}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function NewDealSheet({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (deal: Deal) => void;
}) {
  const [title, setTitle] = useState("");
  const [client, setClient] = useState("");
  const [category, setCategory] = useState("ŽP");
  const [value, setValue] = useState("");
  const [stage, setStage] = useState<StageKey>("start");

  if (!open) return null;

  const save = () => {
    onCreate({
      id: String(Date.now()),
      title: title.trim() || "Nový obchod",
      category: category.trim() || "Obchod",
      client: client.trim() || "Bez klienta",
      value: Number(value) || 0,
      stage,
      nextStep: "Doplnit další krok",
    });

    setTitle("");
    setClient("");
    setCategory("ŽP");
    setValue("");
    setStage("start");
    onClose();
  };

  return (
    <div className="absolute inset-0 z-[95] overflow-hidden">
      <style>{`
        @keyframes newBackdrop { from { opacity: 0; } to { opacity: 1; } }
        @keyframes newSheet { from { transform: translate3d(0,100%,0); } to { transform: translate3d(0,0,0); } }
      `}</style>

      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/36 backdrop-blur-md"
        style={{ animation: "newBackdrop 180ms ease-out both" }}
      />

      <section
        className="absolute bottom-0 left-0 right-0 h-[78%] rounded-t-[36px] bg-white text-slate-900 shadow-[0_-28px_80px_rgba(15,23,42,.24)]"
        style={{ animation: "newSheet 280ms cubic-bezier(.16,1,.3,1) both" }}
      >
        <div className="mx-auto mb-2 mt-4 h-1.5 w-14 rounded-full bg-slate-200" />

        <div className="flex items-center justify-between border-b border-slate-100 px-6 pb-4 pt-2">
          <div>
            <h2 className="text-[24px] font-black tracking-tight">Nový obchod</h2>
            <p className="mt-1 text-[13px] font-semibold text-slate-500">
              Přidat případ do pipeline
            </p>
          </div>

          <button
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-500 active:scale-95"
            aria-label="Zavřít"
          >
            <Icon name="close" size={21} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-6">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Název obchodu"
            className="w-full border-b border-slate-200 bg-transparent pb-3 text-[26px] font-black tracking-tight text-slate-950 outline-none placeholder:text-slate-300 focus:border-indigo-500"
          />

          <input
            value={client}
            onChange={(e) => setClient(e.target.value)}
            placeholder="Klient"
            className="w-full rounded-[20px] border border-slate-200 bg-slate-50/70 px-4 py-4 text-[14px] font-semibold text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white"
          />

          <div className="grid grid-cols-2 gap-3">
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Kategorie"
              className="w-full rounded-[20px] border border-slate-200 bg-slate-50/70 px-4 py-4 text-[14px] font-semibold text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white"
            />

            <input
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="Hodnota Kč"
              inputMode="numeric"
              className="w-full rounded-[20px] border border-slate-200 bg-slate-50/70 px-4 py-4 text-[14px] font-semibold text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {STAGES.map((item) => (
              <button
                key={item.key}
                onClick={() => setStage(item.key)}
                className={cx(
                  "rounded-[18px] border px-3 py-3 text-[13px] font-black active:scale-95",
                  stage === item.key
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-500"
                )}
              >
                {item.title}
              </button>
            ))}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between border-t border-slate-100 bg-white px-6 pb-8 pt-5">
          <button
            onClick={onClose}
            className="px-5 py-3 text-[14px] font-bold text-slate-500"
          >
            Zrušit
          </button>

          <button
            onClick={save}
            className="flex items-center gap-2 rounded-[18px] bg-slate-950 px-7 py-4 text-[15px] font-black text-white shadow-lg shadow-slate-900/20 active:scale-95"
          >
            <Icon name="check" size={18} />
            Vytvořit
          </button>
        </div>
      </section>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="px-6 pb-36 pt-10">
      <div className="space-y-4">
        <div className="h-9 w-40 animate-pulse rounded-2xl bg-slate-200/70" />
        <div className="h-[238px] animate-pulse rounded-[36px] bg-white/70" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-[176px] animate-pulse rounded-[32px] bg-white/70" />
          <div className="h-[176px] animate-pulse rounded-[32px] bg-white/70" />
        </div>
        <div className="h-[180px] animate-pulse rounded-[34px] bg-white/70" />
      </div>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="px-6 pb-36 pt-20">
      <div className="rounded-[30px] border border-rose-100 bg-white/84 p-6 text-center shadow-[0_16px_34px_-24px_rgba(15,23,42,.22)]">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-[20px] bg-rose-50 text-rose-600">
          <Icon name="clock" size={24} />
        </div>

        <h2 className="mt-4 text-[20px] font-black text-slate-950">
          Obchody se nepodařilo načíst
        </h2>

        <p className="mt-2 text-[14px] font-semibold text-slate-500">
          Zkuste obnovit stránku nebo otevřít pipeline později.
        </p>
      </div>
    </div>
  );
}

function EmptyPipelineState() {
  return (
    <div className="rounded-[30px] border border-dashed border-slate-200 bg-white/60 px-6 py-10 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-[20px] bg-indigo-50 text-indigo-600">
        <Icon name="briefcase" size={24} />
      </div>

      <h3 className="mt-4 text-[19px] font-black text-slate-950">
        Zatím žádné obchody
      </h3>

      <p className="mt-2 text-[14px] font-semibold text-slate-500">
        Vytvořte první obchod přes plus v dolní navigaci.
      </p>
    </div>
  );
}

function DealsScreenContent({
  deals,
  loadState,
  activeStage,
  setActiveStage,
  moveDeal,
  openMoveSheet,
}: {
  deals: Deal[];
  loadState: LoadState;
  activeStage: StageKey | "all";
  setActiveStage: (stage: StageKey | "all") => void;
  moveDeal: (dealId: string, nextStage: StageKey) => void;
  openMoveSheet: (deal: Deal) => void;
}) {
  const [draggingDealId, setDraggingDealId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<StageKey | null>(null);

  const grouped = useMemo(() => {
    return STAGES.map((stage) => {
      const items = deals.filter((deal) => deal.stage === stage.key);
      return {
        ...stage,
        items,
        count: items.length,
        total: items.reduce((sum, deal) => sum + deal.value, 0),
        riskCount: items.filter((deal) => deal.risky).length,
      };
    });
  }, [deals]);

  const totalCount = deals.length;
  const totalValue = deals.reduce((sum, deal) => sum + deal.value, 0);
  const riskCount = deals.filter((deal) => deal.risky).length;
  const focusCount = deals.filter(
    (deal) => deal.risky || deal.stage === "offer" || deal.stage === "execution"
  ).length;

  const focusDeal =
    deals.find((deal) => deal.risky) ||
    deals.find((deal) => deal.stage === "offer") ||
    deals[0];

  const visibleGroups =
    activeStage === "all"
      ? grouped
      : grouped.filter((group) => group.key === activeStage);

  const onDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    dealId: string
  ) => {
    setDraggingDealId(dealId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", dealId);
  };

  const onDragEnd = () => {
    setDraggingDealId(null);
    setDragOverStage(null);
  };

  const onDragOverStage = (
    event: React.DragEvent<HTMLDivElement>,
    stage: StageKey
  ) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverStage(stage);
  };

  const onDropStage = (
    event: React.DragEvent<HTMLDivElement>,
    nextStage: StageKey
  ) => {
    event.preventDefault();

    const dealId =
      event.dataTransfer.getData("text/plain") || draggingDealId || "";

    if (dealId) moveDeal(dealId, nextStage);

    setDraggingDealId(null);
    setDragOverStage(null);
  };

  if (loadState === "loading") return <LoadingState />;
  if (loadState === "error") return <ErrorState />;

  return (
    <div className="px-6 pb-40 pt-12">
      <section className="mb-5">
        <p className="text-[12px] font-black uppercase tracking-[0.16em] text-slate-500">
          Pipeline poradce
        </p>

        <h1 className="mt-1 text-[32px] font-black leading-tight tracking-tight text-slate-950">
          Obchody
        </h1>
      </section>

      <KpiBento
        totalCount={totalCount}
        totalValue={totalValue}
        riskCount={riskCount}
        focusCount={focusCount}
      />

      <FocusDealCard deal={focusDeal} riskCount={riskCount} />

      <PipelineStageBento
        grouped={grouped}
        activeStage={activeStage}
        setActiveStage={setActiveStage}
      />

      <section className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-[12px] font-black uppercase tracking-[0.16em] text-slate-500">
            Seznam obchodů
          </p>
          <p className="mt-1 text-[13px] font-semibold text-slate-500">
            {activeStage === "all"
              ? "Všechny fáze pipeline"
              : stageMeta(activeStage).title}
          </p>
        </div>
      </section>

      {deals.length === 0 ? (
        <EmptyPipelineState />
      ) : (
        <section className="space-y-7">
          {visibleGroups.map((group) => (
            <StageSection
              key={group.key}
              stage={group}
              deals={group.items}
              draggingDealId={draggingDealId}
              dragOverStage={dragOverStage}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOverStage={onDragOverStage}
              onDropStage={onDropStage}
              onOpenMove={openMoveSheet}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function PlaceholderScreen({ label }: { label: string }) {
  return (
    <div className="px-6 pb-36 pt-20">
      <div className="rounded-[32px] border border-white/80 bg-white/80 p-8 text-center shadow-[0_18px_36px_-24px_rgba(15,23,42,.24)] ring-1 ring-slate-200/50 backdrop-blur-xl">
        <p className="text-[24px] font-black text-slate-900">{label}</p>
        <p className="mt-2 text-[14px] font-semibold text-slate-500">
          Placeholder kvůli zachování stejné spodní navigace.
        </p>
      </div>
    </div>
  );
}

function SideDrawer({
  open,
  onClose,
  screen,
  setScreen,
}: {
  open: boolean;
  onClose: () => void;
  screen: ScreenKey;
  setScreen: (screen: ScreenKey) => void;
}) {
  if (!open) return null;

  const go = (next: ScreenKey) => {
    setScreen(next);
    onClose();
  };

  const itemClass = (active: boolean) =>
    cx(
      "flex w-full items-center gap-3 rounded-[20px] px-4 py-3.5 text-left active:scale-[.99]",
      active
        ? "bg-slate-950 text-white shadow-[0_16px_34px_rgba(15,23,42,.2)]"
        : "text-slate-700 hover:bg-slate-50"
    );

  return (
    <div className="absolute inset-0 z-[80] bg-slate-950/38 backdrop-blur-sm">
      <aside className="flex h-full w-[84%] max-w-[360px] flex-col rounded-r-[36px] bg-white p-6 shadow-[22px_0_80px_rgba(15,23,42,.24)]">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[20px] bg-slate-950 text-white">
              <span className="bg-gradient-to-br from-violet-300 to-white bg-clip-text text-[25px] font-black italic text-transparent">
                Ai
              </span>
            </span>

            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                Aidvisora
              </p>

              <p className="text-[18px] font-black text-slate-900">
                Marek Marek
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => go("dashboard")}
            className={itemClass(screen === "dashboard")}
          >
            <Icon name="grid" size={21} />
            <span className="text-[15px] font-black">Přehled</span>
          </button>

          <button
            onClick={() => go("tasks")}
            className={itemClass(screen === "tasks")}
          >
            <Icon name="task" size={21} />
            <span className="text-[15px] font-black">Úkoly</span>
          </button>

          <button
            onClick={() => go("clients")}
            className={itemClass(screen === "clients")}
          >
            <Icon name="users" size={21} />
            <span className="text-[15px] font-black">Klienti</span>
          </button>

          <button
            onClick={() => go("deals")}
            className={itemClass(screen === "deals")}
          >
            <Icon name="briefcase" size={21} />
            <span className="text-[15px] font-black">Obchody</span>
          </button>
        </div>
      </aside>
    </div>
  );
}

function DealsMobileApp() {
  const [screen, setScreen] = useState<ScreenKey>("deals");
  const [deals, setDeals] = useState<Deal[]>(seedDeals);
  const [activeStage, setActiveStage] = useState<StageKey | "all">("all");
  const [moveSheetDeal, setMoveSheetDeal] = useState<Deal | null>(null);
  const [newDealOpen, setNewDealOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loadState] = useState<LoadState>("ready");
  const [navHidden, setNavHidden] = useState(false);
  const [pillHidden, setPillHidden] = useState(true);
  const lastScrollTop = useRef(0);

  const overlayOpen = drawerOpen || newDealOpen || Boolean(moveSheetDeal);

  const moveDeal = (dealId: string, nextStage: StageKey) => {
    setDeals((previous) =>
      previous.map((deal) =>
        deal.id === dealId ? { ...deal, stage: nextStage } : deal
      )
    );
  };

  const createDeal = (deal: Deal) => {
    setDeals((previous) => [deal, ...previous]);
  };

  const handleScroll = (event: React.UIEvent<HTMLElement>) => {
    const y = event.currentTarget.scrollTop;
    const diff = y - lastScrollTop.current;

    setPillHidden(y < 8);

    if (diff > 5 && y > 80) setNavHidden(true);
    if (diff < -5 || y < 30) setNavHidden(false);

    lastScrollTop.current = y;
  };

  return (
    <div className="relative h-[844px] w-full max-w-[430px] overflow-hidden rounded-[40px] border-[8px] border-slate-900 bg-[#f6f8fb] shadow-[0_32px_96px_rgba(15,23,42,.3)] ring-1 ring-slate-800">
      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="pointer-events-none absolute -right-24 -top-20 h-64 w-64 rounded-full bg-indigo-200/44 blur-[80px]" />
      <div className="pointer-events-none absolute -left-28 top-72 h-72 w-72 rounded-full bg-emerald-100/48 blur-[80px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[132px] bg-gradient-to-b from-[#f7f9fd] via-[#f7f9fd]/92 to-[#f7f9fd]/0" />

      <StatusBar />
      <TopNav onMenu={() => setDrawerOpen(true)} />
      <PagePill hidden={pillHidden} />

      <main
        onScroll={handleScroll}
        className="hide-scrollbar absolute inset-x-0 bottom-0 top-[112px] z-10 overflow-y-auto"
      >
        {screen === "deals" && (
          <DealsScreenContent
            deals={deals}
            loadState={loadState}
            activeStage={activeStage}
            setActiveStage={setActiveStage}
            moveDeal={moveDeal}
            openMoveSheet={setMoveSheetDeal}
          />
        )}

        {screen === "dashboard" && <PlaceholderScreen label="Přehled" />}
        {screen === "tasks" && <PlaceholderScreen label="Úkoly" />}
        {screen === "clients" && <PlaceholderScreen label="Klienti" />}
      </main>

      <BottomNav
        hidden={navHidden || overlayOpen}
        screen={screen}
        setScreen={setScreen}
        onPlus={() => setNewDealOpen(true)}
      />

      <MoveStageSheet
        deal={moveSheetDeal}
        onClose={() => setMoveSheetDeal(null)}
        onMove={moveDeal}
      />

      <NewDealSheet
        open={newDealOpen}
        onClose={() => setNewDealOpen(false)}
        onCreate={createDeal}
      />

      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        screen={screen}
        setScreen={setScreen}
      />
    </div>
  );
}

export default function AidvisoraDealsScreenMock() {
  return (
    <div className="min-h-screen bg-slate-800 px-4 py-8 text-slate-950">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <DealsMobileApp />
      </div>
    </div>
  );
}
"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import nextDynamic from "next/dynamic";
import {
  ArrowRight,
  Bot,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Command,
  Lock,
  Mail,
  MessageSquare,
  PieChart,
  ShieldCheck,
  Sparkles,
  StickyNote,
  Users,
  XCircle,
  Check,
} from "lucide-react";

import { LANDING_FAQS } from "@/data/landing-faq";
import { LEGAL_PODPORA_EMAIL, LEGAL_SECURITY_EMAIL } from "@/app/legal/legal-meta";
import {
  ANNUAL_BILLING_DISCOUNT_PERCENT,
  annualSavingsVersusTwelveMonthly,
  effectiveMonthlyKcWhenBilledAnnually,
  formatPublicPriceKc,
  PUBLIC_MONTHLY_PRICE_KC,
  PUBLIC_TRIAL_DURATION_DAYS,
  yearlyTotalKcFromMonthlyList,
} from "@/lib/billing/public-pricing";
import {
  PUBLIC_PLAN_INCLUDES,
  PUBLIC_PLAN_START_EXCLUDES,
  PUBLIC_PLAN_TAGLINE,
} from "@/lib/billing/plan-public-marketing";

import { AiReviewDemo } from "@/app/components/landing/demos/AiReviewDemo";

/**
 * Těžké demo moduly lazy-loadujeme, aby initial bundle landing page zůstal
 * co nejmenší. První demo (AiReviewDemo) je v heru, takže jde přes normální
 * import kvůli rychlému visuálnímu důkazu produktu.
 */
const NotesBoardDemo = nextDynamic(
  () => import("@/app/components/landing/demos/NotesBoardDemo").then((m) => m.NotesBoardDemo),
  { ssr: false, loading: () => <DemoSkeleton /> },
);
const ClientRequestDemo = nextDynamic(
  () => import("@/app/components/landing/demos/ClientRequestDemo").then((m) => m.ClientRequestDemo),
  { ssr: false, loading: () => <DemoSkeleton /> },
);
const CalendarDemo = nextDynamic(
  () => import("@/app/components/landing/demos/CalendarDemo").then((m) => m.CalendarDemo),
  { ssr: false, loading: () => <DemoSkeleton /> },
);
const EmailCampaignDemo = nextDynamic(
  () => import("@/app/components/landing/demos/EmailCampaignDemo").then((m) => m.EmailCampaignDemo),
  { ssr: false, loading: () => <DemoSkeleton /> },
);
const ClientDetailDemo = nextDynamic(
  () => import("@/app/components/landing/demos/ClientDetailDemo").then((m) => m.ClientDetailDemo),
  { ssr: false, loading: () => <DemoSkeleton /> },
);
const ClientPortalDemo = nextDynamic(
  () => import("@/app/components/landing/demos/ClientPortalDemo").then((m) => m.ClientPortalDemo),
  { ssr: false, loading: () => <DemoSkeleton /> },
);

function DemoSkeleton() {
  return (
    <div
      className="rounded-[28px] border border-white/10 bg-[#060918]/70 min-h-[460px]"
      aria-busy="true"
      aria-label="Načítám interaktivní ukázku"
    />
  );
}

const DEMO_BOOKING_MAILTO = `mailto:${LEGAL_PODPORA_EMAIL}?subject=${encodeURIComponent(
  "Demo Aidvisora (cca 20 min)",
)}`;

const FAQS = LANDING_FAQS;

/**
 * Jemný scroll-reveal. IO + fallback pro elementy už ve viewportu.
 * Vyhovuje prefers-reduced-motion (pouze rychlý fade, žádný slide).
 */
function ScrollReveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const rect = node.getBoundingClientRect();
    const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
    if (inViewport) {
      const t = window.setTimeout(() => setVisible(true), delay);
      return () => window.clearTimeout(t);
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [delay]);

  return (
    <div
      ref={ref}
      className={`transition-all duration-500 ease-out motion-reduce:transition-none motion-reduce:transform-none ${className} ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6 motion-reduce:opacity-100 motion-reduce:translate-y-0"
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

type ShowcaseDef = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  Demo: React.ComponentType;
};

const SHOWCASE: ShowcaseDef[] = [
  {
    id: "ukazka-zapisky",
    eyebrow: "Zápisky",
    title: "Živý board poznámek napříč produkty.",
    description:
      "Strukturované zápisky u klienta i u celé domény — investice, životní pojištění, penzijní spoření. Rychlý zápis, rychlý zpětný přístup.",
    icon: StickyNote,
    Demo: NotesBoardDemo,
  },
  {
    id: "ukazka-pozadavek",
    eyebrow: "Požadavky z portálu",
    title: "Klient napíše — poradce vidí úkol.",
    description:
      "Žádné e-mailové řetězy. Když klient přes portál pošle podklady nebo dotaz, rovnou dostanete kartu s akcí a přílohami.",
    icon: MessageSquare,
    Demo: ClientRequestDemo,
  },
  {
    id: "ukazka-kalendar",
    eyebrow: "Kalendář",
    title: "Schůzky, telefonáty, úkoly — jedno místo.",
    description:
      "Týdenní přehled se všemi typy aktivit, rychlé zakládání z kliknutí a propojení s klientem. Bez přehazování mezi aplikacemi.",
    icon: Calendar,
    Demo: CalendarDemo,
  },
  {
    id: "ukazka-email",
    eyebrow: "E-mail kampaně",
    title: "Koncept vlevo, živý náhled vpravo.",
    description:
      "Šablony pro narozeniny, pozvánky na revizi, měsíční souhrny. Proměnné se doplňují z dat klienta, náhled pro desktop i mobil.",
    icon: Mail,
    Demo: EmailCampaignDemo,
  },
  {
    id: "ukazka-detail-klienta",
    eyebrow: "Detail klienta",
    title: "Cockpit, ne jen seznam smluv.",
    description:
      "Přehled produktů napříč životním pojištěním, investicemi, penzí, hypotékou a leasingem. Částky, čísla smluv, poznámky, platební údaje.",
    icon: Users,
    Demo: ClientDetailDemo,
  },
  {
    id: "ukazka-portal",
    eyebrow: "Klientský portál",
    title: "Klient se přihlásí a vidí svoje finance.",
    description:
      "Vlastní zóna s přehledem, portfoliem, platebními údaji, QR kódy, požadavky a chatem. V tarifu, bez platby za klienta.",
    icon: PieChart,
    Demo: ClientPortalDemo,
  },
];

export default function PremiumLandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [isAnnualPricing, setIsAnnualPricing] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const priceStart = PUBLIC_MONTHLY_PRICE_KC.starter;
  const pricePro = PUBLIC_MONTHLY_PRICE_KC.pro;
  const priceMgmt = PUBLIC_MONTHLY_PRICE_KC.team;
  const trialDaysLabel = `${PUBLIC_TRIAL_DURATION_DAYS} dní`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err === "auth_error" || err === "database_error") {
      window.location.replace(`/prihlaseni?error=${encodeURIComponent(err)}`);
    }
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0f29] font-inter text-slate-300 selection:bg-indigo-500 selection:text-white overflow-x-hidden relative">
      <style>{`
        .font-inter { font-family: var(--font-primary), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .font-jakarta { font-family: var(--font-jakarta), var(--font-primary), -apple-system, BlinkMacSystemFont, sans-serif; }

        .bg-grid-pattern {
          background-size: 50px 50px;
          background-image: linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
                            linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px);
          mask-image: radial-gradient(circle at center, black 30%, transparent 80%);
          -webkit-mask-image: radial-gradient(circle at center, black 30%, transparent 80%);
        }

        .glass-nav {
          background: rgba(10, 15, 41, 0.7);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }

        .hero-gradient-text {
          background: linear-gradient(135deg, #ffffff 0%, #e0e7ff 50%, #c7d2fe 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .pro-pricing-wrapper {
          position: relative;
          border-radius: 34px;
          padding: 2px;
          background: linear-gradient(135deg, #4f46e5 0%, #8b5cf6 50%, #ec4899 100%);
        }
        .pro-pricing-inner {
          position: relative;
          background: #0a0f29;
          border-radius: 31px;
          height: 100%;
        }

        @keyframes aidv-fade-up {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hero-anim { opacity: 0; animation: aidv-fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .delay-100 { animation-delay: 100ms; }
        .delay-200 { animation-delay: 200ms; }
        .delay-300 { animation-delay: 300ms; }

        html { scroll-behavior: smooth; }

        @media (prefers-reduced-motion: reduce) {
          html { scroll-behavior: auto; }
          .hero-anim { animation: none !important; opacity: 1 !important; }
        }
      `}</style>

      {/* === NAV === */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? "glass-nav py-3 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.6)]" : "bg-transparent py-5"
        }`}
      >
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 flex items-center justify-between">
          <Link href="/" className="flex items-center min-h-[44px] min-w-[44px]">
            <Image
              src="/logos/Aidvisora%20logo%20new.png"
              alt="Aidvisora"
              width={220}
              height={48}
              priority
              fetchPriority="high"
              sizes="(max-width: 640px) 55vw, 220px"
              className="h-9 w-auto max-w-[min(220px,55vw)] object-contain object-left brightness-0 invert sm:h-10"
            />
          </Link>

          <div className="hidden lg:flex items-center gap-8 font-inter font-medium text-sm text-slate-400">
            <a href="#showcase" className="hover:text-white transition-colors">Ukázky</a>
            <a href="#vyhody" className="hover:text-white transition-colors">Proč Aidvisora</a>
            <a href="#cenik" className="hover:text-white transition-colors">Ceník</a>
            <Link href="/bezpecnost" className="hover:text-white transition-colors">Bezpečnost</Link>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/prihlaseni?register=1"
              className="hidden sm:inline-flex items-center min-h-[40px] px-4 py-2 bg-indigo-600 text-white rounded-full text-sm font-bold hover:bg-indigo-500 transition-colors"
            >
              Založit účet
            </Link>
            <Link
              href="/prihlaseni"
              className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 bg-white text-[#0a0f29] rounded-full text-sm font-bold hover:bg-slate-200 transition-colors"
            >
              Přihlásit se <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </nav>

      {/* === HERO === */}
      <section className="relative pt-28 md:pt-36 pb-10 md:pb-16 px-5 md:px-8 overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern z-0 opacity-40" aria-hidden />
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[640px] h-[320px] bg-indigo-600/25 rounded-full blur-[100px] pointer-events-none z-0"
          aria-hidden
        />

        <div className="relative z-10 max-w-[1240px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-14 items-center">
            <div className="text-center lg:text-left">
              <div className="hero-anim inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-6">
                <Command size={13} className="text-slate-400" />
                <span className="text-[11px] font-bold text-slate-300 tracking-wide uppercase">
                  Pracovní systém pro finanční poradenství
                </span>
              </div>

              <h1 className="hero-anim delay-100 font-jakarta text-4xl sm:text-5xl lg:text-6xl xl:text-[68px] font-extrabold tracking-tight leading-[1.05] mb-5">
                <span className="hero-gradient-text">Klient, smlouvy a agenda</span>{" "}
                <span className="text-white">— v jedné aplikaci.</span>
              </h1>

              <p className="hero-anim delay-200 text-lg md:text-xl text-slate-400 max-w-xl mx-auto lg:mx-0 leading-relaxed mb-8">
                Aidvisora spojuje CRM, klientský portál, AI review smluv, kalendář a kampaně do jednoho
                pracovního prostoru. Méně přepisování, víc času na klienta.
              </p>

              <div className="hero-anim delay-200 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mb-5">
                <Link
                  href="/prihlaseni?register=1"
                  className="inline-flex items-center justify-center gap-2 min-h-[48px] px-7 py-3.5 bg-white text-[#0a0f29] rounded-full text-base font-bold hover:bg-slate-100 transition-colors shadow-[0_10px_40px_-10px_rgba(255,255,255,0.3)]"
                >
                  Založit účet — {trialDaysLabel} zdarma
                  <ArrowRight size={16} />
                </Link>
                <a
                  href={DEMO_BOOKING_MAILTO}
                  className="inline-flex items-center justify-center min-h-[48px] px-7 py-3.5 border border-white/20 text-white rounded-full text-base font-bold hover:bg-white/10 transition-colors"
                >
                  Domluvit demo
                </a>
              </div>

              <p className="hero-anim delay-300 text-xs text-slate-500 mb-6 lg:text-left text-center">
                Bez závazku · zkušební verze v úrovni Pro · platební údaje až při přechodu na placený tarif.
              </p>

              <div className="hero-anim delay-300 flex flex-wrap gap-x-5 gap-y-2 justify-center lg:justify-start text-[12px] text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-emerald-400/80" /> Data v EU
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Lock size={14} className="text-indigo-300/80" /> Šifrovaný přenos
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-400/80" /> Česká s.r.o. · CZK
                </span>
              </div>
            </div>

            {/* První interaktivní demo rovnou v heru */}
            <div className="hero-anim delay-200 w-full max-w-[620px] mx-auto lg:mx-0">
              <AiReviewDemo />
            </div>
          </div>
        </div>
      </section>

      {/* === PRODUCT SHOWCASE === */}
      <section id="showcase" className="py-20 md:py-28 px-5 md:px-8 bg-[#060918] border-t border-white/10 scroll-mt-24">
        <div className="max-w-[1240px] mx-auto">
          <ScrollReveal>
            <div className="text-center mb-16 max-w-2xl mx-auto">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[11px] font-bold tracking-widest uppercase mb-5">
                <Sparkles size={13} /> Živé ukázky produktu
              </div>
              <h2 className="font-jakarta text-3xl md:text-5xl font-bold text-white leading-tight mb-4">
                Žádné rendery. Šest okýnek z&nbsp;reálné Aidvisory.
              </h2>
              <p className="text-base md:text-lg text-slate-400 leading-relaxed">
                Každá ukázka je interaktivní — klikněte, přepněte, vyzkoušejte. Demo data, skutečné komponenty.
              </p>
            </div>
          </ScrollReveal>

          <div className="space-y-20 md:space-y-28">
            {SHOWCASE.map((s, idx) => {
              const reversed = idx % 2 === 1;
              const Icon = s.icon;
              return (
                <div
                  key={s.id}
                  id={s.id}
                  className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14 items-center scroll-mt-24"
                >
                  <ScrollReveal className={reversed ? "lg:order-2 lg:justify-self-end" : "lg:justify-self-start"}>
                    <div className="max-w-md mx-auto lg:mx-0">
                      <div className="inline-flex items-center gap-2 w-fit px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-widest text-slate-300 mb-4">
                        <Icon size={12} className="text-indigo-300" />
                        {s.eyebrow}
                      </div>
                      <h3 className="font-jakarta text-2xl md:text-3xl font-bold text-white leading-tight mb-3">
                        {s.title}
                      </h3>
                      <p className="text-sm md:text-base text-slate-400 leading-relaxed">{s.description}</p>
                    </div>
                  </ScrollReveal>

                  <ScrollReveal delay={80} className={reversed ? "lg:order-1" : ""}>
                    <s.Demo />
                  </ScrollReveal>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* === VALUE PROPOSITION === */}
      <section id="vyhody" className="py-20 md:py-28 px-5 md:px-8 bg-[#0a0f29] border-t border-white/10 scroll-mt-24">
        <div className="max-w-[1200px] mx-auto">
          <ScrollReveal>
            <div className="text-center max-w-2xl mx-auto mb-14">
              <h2 className="font-jakarta text-3xl md:text-5xl font-bold text-white leading-tight mb-4">
                Co dělá Aidvisoru jinou.
              </h2>
              <p className="text-base md:text-lg text-slate-400 leading-relaxed">
                Tři věci, které jinde buď nejsou, nebo je musíte sesmolit z pěti nástrojů.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            {[
              {
                icon: Bot,
                title: "AI review smluv",
                desc: "Nahrajete PDF, Aidvisora přečte typ produktu, částky, pojistníka a navrhne, co propsat do karty klienta.",
                accent: "indigo",
              },
              {
                icon: Users,
                title: "Portál pro klienta v ceně",
                desc: "Klient má vlastní zónu s přehledem, platebními údaji, požadavky a chatem. Neplatíte za klienta.",
                accent: "emerald",
              },
              {
                icon: ShieldCheck,
                title: "Postavené pro český trh",
                desc: "Český workflow, CZ právní rámec (GDPR, distribuce pojištění), fakturace v CZK, hosting v EU.",
                accent: "rose",
              },
            ].map((v, i) => (
              <ScrollReveal key={v.title} delay={i * 80}>
                <div className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-6 hover:bg-white/[0.06] transition-colors">
                  <div
                    className={`w-11 h-11 rounded-xl border flex items-center justify-center mb-4 ${
                      v.accent === "indigo"
                        ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300"
                        : v.accent === "emerald"
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                          : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                    }`}
                  >
                    <v.icon size={20} />
                  </div>
                  <h3 className="font-jakarta text-lg font-bold text-white mb-2">{v.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{v.desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* === TRUST STRIP === */}
      <section
        aria-labelledby="trust-heading"
        className="py-14 md:py-16 px-5 md:px-8 border-y border-white/10 bg-white/[0.02]"
      >
        <div className="max-w-[1200px] mx-auto">
          <ScrollReveal>
            <div className="flex flex-col md:flex-row md:items-center md:gap-10 gap-8">
              <div className="flex-1">
                <h3 id="trust-heading" className="font-jakarta text-2xl md:text-3xl font-bold text-white leading-tight mb-2">
                  Střízlivě o bezpečnosti.
                </h3>
                <p className="text-sm md:text-base text-slate-400 leading-relaxed max-w-xl">
                  Nehoníme se za certifikáty, které jsme nezískali. Držíme se toho, co umíme doložit —
                  a otevřeně o tom píšeme na stránce{" "}
                  <Link href="/bezpecnost" className="text-slate-200 hover:text-white underline underline-offset-4">
                    Bezpečnost
                  </Link>
                  .
                </p>
              </div>

              <div className="md:w-[420px] grid grid-cols-1 gap-2">
                <TrustRow
                  icon={ShieldCheck}
                  tone="emerald"
                  title="Hosting v EU"
                  desc="Poskytovatelé v EU, šifrování při přenosu i uložení."
                />
                <TrustRow
                  icon={Lock}
                  tone="indigo"
                  title="Role a audit stopa"
                  desc="Oddělené workspace, role Manažer / Poradce / Asistent, záznam citlivých akcí."
                />
                <TrustRow
                  icon={CheckCircle2}
                  tone="emerald"
                  title="Česká s.r.o., CZ právo"
                  desc="Fakturace v CZK, DPA, VOP a Zásady zpracování v češtině."
                />
              </div>
            </div>
            <p className="mt-6 text-[11px] text-slate-500">
              Kontakt pro bezpečnostní dotazy:{" "}
              <a
                href={`mailto:${LEGAL_SECURITY_EMAIL}`}
                className="underline-offset-2 hover:text-slate-300 hover:underline"
              >
                {LEGAL_SECURITY_EMAIL}
              </a>
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* === PRICING === */}
      <section id="cenik" className="py-20 md:py-28 px-5 md:px-8 bg-[#060918] border-t border-white/10 scroll-mt-24">
        <div className="max-w-[1200px] mx-auto">
          <ScrollReveal>
            <div className="text-center max-w-2xl mx-auto mb-10">
              <h2 className="font-jakarta text-3xl md:text-5xl font-bold text-white leading-tight mb-4">
                Tarify Start, Pro a Management
              </h2>
              <p className="text-base md:text-lg text-slate-400 leading-relaxed">
                Rozdíl je hlavně v rozsahu portálu, integrací Google a v týmových přehledech. Tarif můžete měnit podle vývoje praxe.
              </p>

              <div className="inline-flex bg-white/5 border border-white/10 rounded-full p-1 mt-8">
                <button
                  type="button"
                  className={`min-h-[40px] px-5 py-2 rounded-full text-sm font-bold transition-colors ${
                    !isAnnualPricing ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                  onClick={() => setIsAnnualPricing(false)}
                >
                  Měsíčně
                </button>
                <button
                  type="button"
                  className={`min-h-[40px] px-5 py-2 rounded-full text-sm font-bold inline-flex items-center gap-2 transition-colors ${
                    isAnnualPricing ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                  onClick={() => setIsAnnualPricing(true)}
                >
                  Ročně{" "}
                  <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-2 py-0.5 rounded-full tracking-wider">
                    −{ANNUAL_BILLING_DISCOUNT_PERCENT}&nbsp;%
                  </span>
                </button>
              </div>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-7 items-stretch">
            <PricingCard
              name="Start"
              tagline={PUBLIC_PLAN_TAGLINE.start}
              monthly={priceStart}
              annual={isAnnualPricing}
              includes={PUBLIC_PLAN_INCLUDES.start}
              excludes={PUBLIC_PLAN_START_EXCLUDES}
              trialDaysLabel={trialDaysLabel}
            />
            <PricingCard
              featured
              name="Pro"
              tagline={PUBLIC_PLAN_TAGLINE.pro}
              monthly={pricePro}
              annual={isAnnualPricing}
              includes={PUBLIC_PLAN_INCLUDES.pro}
              trialDaysLabel={trialDaysLabel}
            />
            <PricingCard
              name="Management"
              tagline={PUBLIC_PLAN_TAGLINE.management}
              monthly={priceMgmt}
              annual={isAnnualPricing}
              includes={PUBLIC_PLAN_INCLUDES.management}
              trialDaysLabel={trialDaysLabel}
            />
          </div>

          <ScrollReveal delay={100}>
            <div className="mt-10 max-w-3xl mx-auto text-center">
              <p className="text-xs text-slate-500 leading-relaxed">
                Ceny jsou konečné za jeden workspace (vaši organizaci v systému). Zkušební verze {trialDaysLabel} v úrovni Pro.
                Rozsah seatů u větších týmů{" "}
                <a href={DEMO_BOOKING_MAILTO} className="text-indigo-300 hover:text-white underline underline-offset-2">
                  doladíme na demu
                </a>
                .
              </p>
              <p className="text-[11px] text-slate-500 mt-2">Nejsme plátci DPH.</p>
              <p className="text-[11px] text-slate-600 mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                <Link href="/cookies" className="hover:text-slate-400 underline-offset-4 hover:underline">Cookies</Link>
                <span aria-hidden>·</span>
                <Link href="/subprocessors" className="hover:text-slate-400 underline-offset-4 hover:underline">Subdodavatelé</Link>
                <span aria-hidden>·</span>
                <Link href="/legal/ai-disclaimer" className="hover:text-slate-400 underline-offset-4 hover:underline">AI disclaimer</Link>
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* === FAQ === */}
      <section id="faq" className="py-20 md:py-24 px-5 md:px-8 bg-[#0a0f29] border-t border-white/10 scroll-mt-24">
        <div className="max-w-[820px] mx-auto">
          <ScrollReveal>
            <div className="text-center mb-12">
              <h2 className="font-jakarta text-3xl md:text-4xl font-bold text-white mb-3">Časté otázky</h2>
              <p className="text-slate-400 text-sm md:text-base">Vše, co typicky chcete vědět před spuštěním.</p>
            </div>
          </ScrollReveal>

          <div className="space-y-3">
            {FAQS.map((faq) => {
              const expanded = openFaq === faq.id;
              return (
                <div
                  key={faq.id}
                  className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden transition-colors hover:border-white/20"
                >
                  <button
                    type="button"
                    id={`faq-q-${faq.id}`}
                    aria-expanded={expanded}
                    aria-controls={`faq-p-${faq.id}`}
                    onClick={() => setOpenFaq(expanded ? null : faq.id)}
                    className="w-full px-5 md:px-6 py-4 min-h-[56px] flex items-center justify-between text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 rounded-2xl"
                  >
                    <span className="font-bold text-white text-sm md:text-base pr-3">{faq.q}</span>
                    <ChevronDown
                      size={18}
                      className={`text-slate-400 shrink-0 transition-transform duration-200 ${
                        expanded ? "rotate-180" : ""
                      }`}
                      aria-hidden
                    />
                  </button>
                  <div
                    id={`faq-p-${faq.id}`}
                    role="region"
                    aria-labelledby={`faq-q-${faq.id}`}
                    className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                      expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="overflow-hidden min-h-0">
                      <p className="px-5 md:px-6 pb-5 text-slate-400 leading-relaxed text-sm border-t border-white/5 pt-3">
                        {faq.a}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* === FOOTER CTA === */}
      <section className="relative overflow-hidden py-20 md:py-28 px-5 md:px-8 border-t border-white/10">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-indigo-900/10 to-indigo-900/25 pointer-events-none" aria-hidden />
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <ScrollReveal>
            <h2 className="font-jakarta text-3xl md:text-5xl font-extrabold text-white tracking-tight mb-5">
              Otevřete Aidvisoru a rozhodněte se sami.
            </h2>
            <p className="text-base md:text-lg text-slate-400 leading-relaxed mb-8">
              {trialDaysLabel} zdarma, žádná karta dopředu. Stejné prostředí jako po přihlášení poradce — CRM,
              portál, AI review i kalendář.
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
              <Link
                href="/prihlaseni?register=1"
                className="inline-flex items-center justify-center gap-2 min-h-[48px] px-7 py-3.5 bg-white text-[#0a0f29] rounded-full text-base font-bold hover:bg-slate-100 transition-colors shadow-[0_10px_40px_-10px_rgba(255,255,255,0.3)]"
              >
                Založit účet — {trialDaysLabel} zdarma <ArrowRight size={16} />
              </Link>
              <a
                href={DEMO_BOOKING_MAILTO}
                className="inline-flex items-center justify-center min-h-[48px] px-7 py-3.5 border border-white/20 text-white rounded-full text-base font-bold hover:bg-white/10 transition-colors"
              >
                Domluvit demo
              </a>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* === FOOTER === */}
      <footer className="bg-[#060918] text-slate-500 py-14 px-5 md:px-8 border-t border-white/10">
        <div className="max-w-[1240px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
          <div className="md:col-span-2">
            <Link href="/" className="inline-flex items-center mb-5">
              <Image
                src="/logos/Aidvisora%20logo%20new.png"
                alt="Aidvisora"
                width={220}
                height={48}
                loading="lazy"
                sizes="(max-width: 768px) 50vw, 220px"
                className="h-9 w-auto max-w-[200px] object-contain object-left brightness-0 invert"
              />
            </Link>
            <p className="text-sm max-w-sm leading-relaxed mb-3">
              Pracovní systém pro finanční poradce a týmy. CRM, klientský portál a workflow na jednom místě.
            </p>
            <p className="text-xs">
              <a href={`mailto:${LEGAL_PODPORA_EMAIL}`} className="hover:text-white transition-colors">
                {LEGAL_PODPORA_EMAIL}
              </a>
            </p>
          </div>

          <div>
            <h4 className="text-white font-bold mb-4 font-jakarta text-sm tracking-wide">Produkt</h4>
            <ul className="space-y-2.5 text-sm">
              <li><a href="#showcase" className="hover:text-white transition-colors">Ukázky z aplikace</a></li>
              <li><a href="#cenik" className="hover:text-white transition-colors">Ceník a tarify</a></li>
              <li><Link href="/o-nas" className="hover:text-white transition-colors">O nás</Link></li>
              <li><Link href="/pro-brokery" className="hover:text-white transition-colors">Pro brokery a firmy</Link></li>
              <li><Link href="/prihlaseni" className="hover:text-white transition-colors">Přihlášení</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-white font-bold mb-4 font-jakarta text-sm tracking-wide">Právní a podpora</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/bezpecnost" className="hover:text-white transition-colors">Bezpečnost</Link></li>
              <li><Link href="/terms" className="hover:text-white transition-colors">Obchodní podmínky</Link></li>
              <li><Link href="/privacy" className="hover:text-white transition-colors">Zásady ochrany (GDPR)</Link></li>
              <li><Link href="/legal/zpracovatelska-smlouva" className="hover:text-white transition-colors">DPA</Link></li>
              <li><Link href="/legal/ai-disclaimer" className="hover:text-white transition-colors">AI disclaimer</Link></li>
              <li><Link href="/subprocessors" className="hover:text-white transition-colors">Subdodavatelé</Link></li>
              <li><Link href="/cookies" className="hover:text-white transition-colors">Cookies</Link></li>
              <li><Link href="/kontakt" className="hover:text-white transition-colors">Kontakt</Link></li>
              <li><Link href="/status" className="hover:text-white transition-colors">Provozní stav</Link></li>
            </ul>
          </div>
        </div>

        <div className="max-w-[1240px] mx-auto pt-6 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} Aidvisora. Všechna práva vyhrazena.</p>
          <p className="text-center md:text-right">
            Vytvořila{" "}
            <a
              href="https://www.m2digitalagency.cz"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-300 hover:text-white underline-offset-2 hover:underline font-semibold"
            >
              M2DigitalAgency
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

// === Lokalní helpery (mimo hlavní komponentu pro čitelnost) ===

function TrustRow({
  icon: Icon,
  tone,
  title,
  desc,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tone: "emerald" | "indigo";
  title: string;
  desc: string;
}) {
  const toneMap = {
    emerald: "bg-emerald-500/10 border-emerald-500/25 text-emerald-300",
    indigo: "bg-indigo-500/10 border-indigo-500/25 text-indigo-300",
  } as const;
  return (
    <div className="flex items-start gap-3 p-3.5 rounded-xl border border-white/10 bg-white/[0.03]">
      <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${toneMap[tone]}`}>
        <Icon size={16} />
      </div>
      <div>
        <p className="text-white font-bold text-sm leading-tight">{title}</p>
        <p className="text-slate-400 text-xs leading-relaxed mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function PricingCard({
  name,
  tagline,
  monthly,
  annual,
  includes,
  excludes,
  featured,
  trialDaysLabel,
}: {
  name: string;
  tagline: string;
  monthly: number;
  annual: boolean;
  includes: readonly string[];
  excludes?: readonly string[];
  featured?: boolean;
  trialDaysLabel: string;
}) {
  const displayedPrice = annual ? effectiveMonthlyKcWhenBilledAnnually(monthly) : monthly;
  const yearlyTotal = yearlyTotalKcFromMonthlyList(monthly);
  const yearlySavings = annualSavingsVersusTwelveMonthly(monthly);

  const card = (
    <div
      className={`relative h-full rounded-[28px] p-7 md:p-8 flex flex-col ${
        featured ? "bg-[#0a0f29]" : "bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] transition-colors"
      }`}
    >
      {featured ? (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
          Nejvyužívanější
        </div>
      ) : null}

      <h3 className="font-jakarta text-xl md:text-2xl font-bold text-white mb-1">{name}</h3>
      <p className="text-sm text-slate-400 mb-5">{tagline}</p>

      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-4xl md:text-5xl font-black text-white tabular-nums">
          {formatPublicPriceKc(displayedPrice)}
        </span>
        <span className="text-sm text-slate-500 font-medium">Kč / měs.</span>
      </div>
      <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mb-1">
        {annual ? "Ekvivalent při roční fakturaci" : "Fakturováno měsíčně"}
      </p>
      {annual ? (
        <p className="text-[11px] text-slate-500 mb-5">
          Celkem {formatPublicPriceKc(yearlyTotal)} Kč / rok · úspora {formatPublicPriceKc(yearlySavings)} Kč
        </p>
      ) : (
        <div className="mb-5" />
      )}

      <Link
        href="/prihlaseni?register=1"
        className={`w-full inline-flex items-center justify-center min-h-[48px] px-5 py-3 rounded-xl text-sm font-bold transition-colors mb-2 ${
          featured
            ? "bg-indigo-500 text-white hover:bg-indigo-400 shadow-[0_10px_30px_-10px_rgba(99,102,241,0.6)]"
            : "bg-white/10 text-white border border-white/10 hover:bg-white/20"
        }`}
      >
        Založit účet — {trialDaysLabel} zdarma
      </Link>
      <Link
        href="/prihlaseni"
        className={`block w-full py-2.5 text-sm font-medium text-center transition-colors mb-6 ${
          featured ? "text-indigo-200/90 hover:text-white" : "text-slate-400 hover:text-white"
        }`}
      >
        Už mám účet — přihlásit se
      </Link>

      <ul className="space-y-2.5 mb-5">
        {includes.map((line) => (
          <li key={line} className={`flex items-start gap-2.5 text-sm ${featured ? "text-white font-medium" : "text-slate-300"}`}>
            <Check size={17} className={`shrink-0 mt-0.5 ${featured ? "text-emerald-400" : "text-indigo-400"}`} />
            {line}
          </li>
        ))}
      </ul>

      {excludes && excludes.length > 0 ? (
        <div className="mt-auto pt-4 border-t border-white/10">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">V ceně Start nejsou</p>
          <ul className="space-y-1.5">
            {excludes.map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-xs text-slate-500">
                <XCircle size={14} className="text-slate-600 shrink-0 mt-0.5" /> {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );

  if (featured) {
    return (
      <div className="pro-pricing-wrapper md:scale-[1.02] shadow-[0_30px_60px_-30px_rgba(139,92,246,0.45)]">
        <div className="pro-pricing-inner">{card}</div>
      </div>
    );
  }
  return card;
}
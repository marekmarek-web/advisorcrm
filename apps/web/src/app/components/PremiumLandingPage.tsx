"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import nextDynamic from "next/dynamic";
import {
  Activity, AlertTriangle, Archive, ArrowRight, ArrowUpRight,
  BarChart3, Bell, Bot, Briefcase, Building, Calculator, Calendar, 
  CalendarDays, Check, CheckCircle2, CheckSquare, ChevronRight, Clock, Combine, 
  Command, Coffee, Download, DownloadCloud, FileDigit, FileSignature, 
  FileText, FileUp, KanbanSquare, Lock, MessageSquare, Moon, Network, 
  PieChart, Play, Search, Server, Share2, Shield, ShieldCheck, 
  Smartphone, Sparkles, Sun, Sunrise, Sunset, Tags,
  User, Users, Zap, Link as LinkIcon, ChevronDown, HelpCircle, Mail,
  Globe, XCircle, CheckCircle, Headset, Timer, LineChart, BookOpen, Database, Home
} from 'lucide-react';
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { VimeoFacade } from "@/app/components/landing/VimeoFacade";
import { LANDING_FAQS } from "@/data/landing-faq";

/*
 * Perf — below-the-fold interaktivní demo. Lazy-load přes `next/dynamic` s `ssr: false`:
 *   - Chunk se stáhne až když komponenta přijde do viewportu (resp. při hydrataci
 *     mimo kritickou cestu),
 *   - v initial HTML je jen placeholder (žádný layout shift, aspect-ratio držíme).
 */
const AiSandbox = nextDynamic(() => import("@/app/components/landing/AiSandbox"), {
  ssr: false,
  loading: () => (
    <div
      className="aspect-[4/5] md:aspect-square max-w-[500px] mx-auto bg-[#060918]/60 backdrop-blur-xl rounded-[32px] border border-white/10"
      aria-busy="true"
      aria-label="Načítám interaktivní ukázku AI review"
    />
  ),
});
import {
  annualSavingsVersusTwelveMonthly,
  ANNUAL_BILLING_DISCOUNT_PERCENT,
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
import { LEGAL_PODPORA_EMAIL, LEGAL_SECURITY_EMAIL } from "@/app/legal/legal-meta";

const DEMO_BOOKING_MAILTO = `mailto:${LEGAL_PODPORA_EMAIL}?subject=${encodeURIComponent("Demo Aidvisora (cca 20 min)")}`;

/** Badge pro funkce dostupné od tarifu Pro (marketing). */
function ProPlanBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-indigo-400/40 bg-indigo-500/15 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-indigo-200 ${className}`}
    >
      Pro
    </span>
  );
}

// --- CUSTOM HOOK & KOMPONENTA PRO SCROLL ANIMACE (REVEAL) ---
interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right";
  immediate?: boolean;
}
const ScrollReveal = (props: ScrollRevealProps) => {
  const { children, className = "", delay = 0, direction = "up", immediate = false } = props;
  const [isVisible, setIsVisible] = useState(immediate);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (immediate) {
      const timer = setTimeout(() => setIsVisible(true), delay);
      return () => clearTimeout(timer);
    }

    const node = ref.current;
    if (!node) return;

    // Fallback pro prohlížeče bez IntersectionObserver (sklouzne na „ihned zobraz“,
    // aby uživateli neschovalo celou sekci kvůli chybějícímu API — dříve zůstala
    // na opacity-0 a z landing page zmizel veškerý obsah).
    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    // Elementy už v initial viewportu (nad rýhou) museli dříve čekat na první
    // scroll event od uživatele, než je IO „zaregistroval“ — proto se stávalo,
    // že první viewport landingu zůstal blikající mezi opacity-0 a opacity-100.
    // Kontrola `getBoundingClientRect` je levná a spouští reveal okamžitě.
    const rect = node.getBoundingClientRect();
    const inInitialViewport =
      rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
      rect.bottom > 0;
    if (inInitialViewport) {
      const timer = window.setTimeout(() => setIsVisible(true), delay);
      return () => window.clearTimeout(timer);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [immediate, delay]);

  const translateClass = 
    direction === "up" ? "translate-y-16" : 
    direction === "down" ? "-translate-y-16" : 
    direction === "left" ? "translate-x-16" : 
    direction === "right" ? "-translate-x-16" : "scale-95";

  return (
    <div
      ref={ref}
      data-in-view={isVisible ? "true" : "false"}
      className={`transition-all duration-500 ease-out ${className} ${
        isVisible ? 'opacity-100 translate-y-0 translate-x-0 scale-100' : `opacity-0 ${translateClass}`
      }`}
      style={!immediate ? { transitionDelay: `${delay}ms` } : {}}
    >
      {children}
    </div>
  );
};

// --- CUSTOM HOOK & KOMPONENTA PRO 2026 SPOTLIGHT EFEKT ---
// Perf — dříve se na každý `mousemove` triggeroval `setState` (re-render celé karty).
// Teď píšeme jen do CSS custom properties přes ref. Hover je pointer-fine only
// (na dotyku efekt nemá smysl a šetříme event-listener overhead).
const SpotlightCard = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => {
  const divRef = useRef<HTMLDivElement>(null);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const node = divRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    node.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
  };

  const handlePointerEnter = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    divRef.current?.style.setProperty("--spot-opacity", "1");
  };

  const handlePointerLeave = () => {
    divRef.current?.style.setProperty("--spot-opacity", "0");
  };

  return (
    <div
      ref={divRef}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      className={`relative overflow-hidden rounded-[32px] border border-white/10 bg-white/5 transition-colors group ${className}`}
      style={{
        ["--spot-x" as string]: "0px",
        ["--spot-y" as string]: "0px",
        ["--spot-opacity" as string]: "0",
      }}
    >
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-300 z-10"
        style={{
          opacity: "var(--spot-opacity)",
          background:
            "radial-gradient(600px circle at var(--spot-x) var(--spot-y), rgba(255,255,255,0.1), transparent 40%)",
        }}
      />
      {children}
    </div>
  );
};

const DEMO_VIDEO_URL =
  typeof process !== "undefined" && process.env?.NEXT_PUBLIC_LANDING_DEMO_VIDEO_URL
    ? process.env.NEXT_PUBLIC_LANDING_DEMO_VIDEO_URL
    : "";

const FAQS = LANDING_FAQS.map((item) => ({ ...item }));

export default function PremiumLandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [activeSecurityFeature, setActiveSecurityFeature] = useState('none');
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

  // --- STAV PRO MINI KALKULAČKU ---
  const [miniCalcInvest, setMiniCalcInvest] = useState(5000);
  const [miniCalcYears, setMiniCalcYears] = useState(15);
  
  // --- STAV PRO ROI KALKULAČKU ---
  const [roiClients, setRoiClients] = useState(150);
  const [roiAdmin, setRoiAdmin] = useState(12);
  const [roiTeam, setRoiTeam] = useState(1);

  const futureValue = useMemo(() => {
    const r = 0.07 / 12;
    const n = miniCalcYears * 12;
    const val = miniCalcInvest * ((Math.pow(1 + r, n) - 1) / r);
    return Math.round(val);
  }, [miniCalcInvest, miniCalcYears]);

  // Výpočet ROI
  const roiSavedHours = useMemo(() => Math.round(roiAdmin * 0.4 * roiTeam * 4), [roiAdmin, roiTeam]); // 40% času ušetřeno, * 4 týdny = měsíčně
  const roiExtraDeals = useMemo(() => Math.round(roiClients * 0.05 * roiTeam), [roiClients, roiTeam]); // 5% nárůst obchodů díky follow-ups za rok
  const roiValue = useMemo(() => (roiSavedHours * 1000) + Math.round((roiExtraDeals * 15000) / 12), [roiSavedHours, roiExtraDeals]); // Odhad 1000Kč/hod a 15k z obchodu

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const formatNumber = (num: number) => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  const calendarMonthLabel = useMemo(() => {
    const s = new Date().toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0f29] font-inter text-slate-300 selection:bg-indigo-500 selection:text-white overflow-x-hidden relative">
      <style>{`
        /* Perf — fonty se načítají přes next/font v layoutu (Source Sans 3 + Plus Jakarta Sans).
           Landing dříve tahal navíc Google Fonts CSS přes @import (Inter + Plus Jakarta Sans),
           což způsobovalo dvojí font download (~4 WOFF2 requesty navíc) a blokovalo FCP.
           Třídy .font-inter a .font-jakarta teď mapujeme na CSS variables z next/font. */
        .font-inter { font-family: var(--font-primary), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .font-jakarta { font-family: var(--font-jakarta), var(--font-primary), -apple-system, BlinkMacSystemFont, sans-serif; }

        .bg-grid-pattern {
          background-size: 50px 50px;
          background-image: linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                            linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          mask-image: radial-gradient(circle at center, black 30%, transparent 80%);
          -webkit-mask-image: radial-gradient(circle at center, black 30%, transparent 80%);
        }

        .glass-nav {
          background: rgba(10, 15, 41, 0.6);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        /* Perf — shimmer gradient byl "animation: shimmer 4s linear infinite".
           Držel GPU compositor aktivní i na mobilu a utápěl hlavní vlákno.
           Teď jednorázová animace po mountu (text dojede do finální barvy a stojí). */
        .text-glow-shimmer {
          background: linear-gradient(to right, #a855f7 0%, #818cf8 25%, #e879f9 50%, #818cf8 75%, #a855f7 100%);
          background-size: 200% auto;
          color: transparent;
          -webkit-background-clip: text;
          background-clip: text;
          background-position: 100% center;
          text-shadow: 0 0 30px rgba(168, 85, 247, 0.4);
        }
        @media (prefers-reduced-motion: no-preference) {
          .text-glow-shimmer {
            animation: shimmer 2.4s cubic-bezier(0.4, 0, 0.2, 1) 1 forwards;
          }
        }
        @keyframes shimmer {
          0% { background-position: 0% center; }
          100% { background-position: 100% center; }
        }

        /* Perf — Pro pricing wrapper: conic-gradient spin byl drahý (60 fps
           compositing 24/7 i mimo viewport). Teď statický lineární gradient.
           Vizuální rozdíl je malý, výkonový velký (~5-10% CPU na mobilu méně). */
        .pro-pricing-wrapper {
          position: relative;
          border-radius: 34px;
          padding: 3px;
          background: linear-gradient(135deg, #4f46e5 0%, #8b5cf6 50%, #ec4899 100%);
          overflow: hidden;
        }
        .pro-pricing-inner {
          position: relative;
          background: #0a0f29;
          border-radius: 31px;
          z-index: 1;
          height: 100%;
        }

        /* Kalkulačka Sliders */
        input[type=range].modern-slider { -webkit-appearance: none; width: 100%; background: transparent; height: 6px; border-radius: 3px; cursor: pointer; outline: none; }
        input[type=range].modern-slider::-webkit-slider-runnable-track { width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; }
        input[type=range].modern-slider::-webkit-slider-thumb { -webkit-appearance: none; height: 20px; width: 20px; border-radius: 50%; background: #10b981; margin-top: -7px; box-shadow: 0 0 10px rgba(16,185,129,0.5); transition: transform 0.1s; }
        input[type=range].modern-slider::-webkit-slider-thumb:hover { transform: scale(1.2); }

        /* Perf — všechny infinite animace v landingu používaly GPU compositing
           i když byly mimo viewport a držely event-loop v nikdy nekončícím cyklu.
           Nová strategie: animace jsou "paused" výchozí a spustíme je jen pro
           prvky uvnitř [data-in-view="true"] kontejneru (viz IntersectionObserver
           v ViewportAnimatedSection). Na mobilu s "prefers-reduced-motion: reduce"
           jsou úplně vypnuté. */

        /* Storytelling Timeline animation */
        @keyframes flowLine {
          0% { height: 0%; opacity: 0; }
          50% { height: 100%; opacity: 1; }
          100% { height: 100%; opacity: 0; }
        }
        .timeline-glow {
          position: absolute;
          top: 0; left: 0; width: 100%;
          background: linear-gradient(to bottom, transparent, #818cf8, transparent);
          animation: flowLine 3s ease-in-out infinite;
          animation-play-state: paused;
        }
        [data-in-view="true"] .timeline-glow { animation-play-state: running; }

        /* Animace plátna a Mindmapy (tečkované čáry toku dat) */
        .mindmap-dots {
          background-image: radial-gradient(#cbd5e1 1.5px, transparent 0);
          background-size: 24px 24px;
        }
        @keyframes dash-flow {
          to { stroke-dashoffset: -20; }
        }
        .path-flow {
          stroke-dasharray: 4, 4;
          animation: dash-flow 1s linear infinite;
          animation-play-state: paused;
        }
        [data-in-view="true"] .path-flow { animation-play-state: running; }

        /* Notifikace — paused mimo viewport. */
        @keyframes notification-float {
          0%, 100% { transform: translateY(20px); opacity: 0; }
          10%, 40% { transform: translateY(0); opacity: 0.9; }
          50%, 99% { transform: translateY(-20px); opacity: 0; }
        }
        .anim-notif-1 { animation: notification-float 16s cubic-bezier(0.4, 0, 0.2, 1) infinite; animation-delay: 0s; animation-play-state: paused; }
        .anim-notif-2 { animation: notification-float 16s cubic-bezier(0.4, 0, 0.2, 1) infinite; animation-delay: 4s; animation-play-state: paused; }
        .anim-notif-3 { animation: notification-float 16s cubic-bezier(0.4, 0, 0.2, 1) infinite; animation-delay: 8s; animation-play-state: paused; }
        .anim-notif-4 { animation: notification-float 16s cubic-bezier(0.4, 0, 0.2, 1) infinite; animation-delay: 12s; animation-play-state: paused; }
        [data-in-view="true"] .anim-notif-1,
        [data-in-view="true"] .anim-notif-2,
        [data-in-view="true"] .anim-notif-3,
        [data-in-view="true"] .anim-notif-4 { animation-play-state: running; }

        @media (prefers-reduced-motion: reduce) {
          .timeline-glow,
          .path-flow,
          .anim-notif-1,
          .anim-notif-2,
          .anim-notif-3,
          .anim-notif-4,
          .text-glow-shimmer,
          .animate-move-across {
            animation: none !important;
          }
        }

        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hero-anim { opacity: 0; animation: slideUpFade 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .delay-100 { animation-delay: 100ms; }
        .delay-200 { animation-delay: 200ms; }
        .delay-300 { animation-delay: 300ms; }
        .delay-400 { animation-delay: 400ms; }

        /* PIPELINE ANIMACE (Bez překrývání) — paused mimo viewport. */
        @keyframes moveCardAcross {
          0%, 15% { transform: translate(0, 0) scale(1); opacity: 1; z-index: 20; }
          25% { transform: translate(10px, -10px) scale(1.05) rotate(3deg); opacity: 1; z-index: 30; }
          50% { transform: translate(calc(100% + 1rem), 0) scale(1.05) rotate(0deg); opacity: 1; z-index: 30; }
          60%, 80% { transform: translate(calc(100% + 1rem), 0) scale(1); opacity: 1; z-index: 20; }
          90%, 100% { transform: translate(calc(100% + 1rem), 0) scale(1); opacity: 0; z-index: 10; }
        }
        .animate-move-across {
          animation: moveCardAcross 6s ease-in-out infinite;
          animation-play-state: paused;
        }
        [data-in-view="true"] .animate-move-across { animation-play-state: running; }
      `}</style>

      {/* --- FIXNÍ NAVIGACE --- */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "glass-nav py-4 shadow-2xl shadow-black/50" : "bg-transparent py-6"}`}>
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 cursor-pointer group min-h-[44px] min-w-[44px]">
            <Image
              src="/logos/Aidvisora%20logo%20new.png"
              alt="Aidvisora"
              width={220}
              height={48}
              priority
              fetchPriority="high"
              sizes="(max-width: 640px) 55vw, 220px"
              className="h-10 w-auto max-w-[min(220px,55vw)] object-contain object-left brightness-0 invert sm:h-11"
            />
          </Link>

          <div className="hidden lg:flex items-center gap-8 xl:gap-10 font-inter font-medium text-sm text-slate-400">
            <a href="#jak-to-funguje" className="hover:text-white transition-colors">Jak to funguje</a>
            <a href="#pro-koho" className="hover:text-white transition-colors">Pro koho</a>
            <Link href="/demo" className="hover:text-white transition-colors">Ukázka</Link>
            <a href="#cenik" className="hover:text-white transition-colors">Ceník</a>
            <Link href="/bezpecnost" className="hover:text-white transition-colors">Bezpečnost</Link>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href={DEMO_BOOKING_MAILTO}
              className="hidden xl:inline-flex px-4 py-2.5 border border-white/20 text-slate-200 rounded-full text-sm font-semibold hover:bg-white/10 transition-all items-center min-h-[44px]"
            >
              Domluvit demo
            </a>
            <Link
              href="/prihlaseni?register=1"
              className="hidden sm:inline-flex px-5 py-2.5 bg-indigo-600 text-white rounded-full text-sm font-bold hover:bg-indigo-500 transition-all items-center min-h-[44px]"
            >
              Založit účet — {trialDaysLabel} zdarma
            </Link>
            <Link
              href="/prihlaseni"
              className="px-5 py-2.5 bg-white text-[#0a0f29] rounded-full text-sm font-bold hover:bg-slate-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.15)] flex items-center gap-2 min-h-[44px]"
            >
              Přihlásit se <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </nav>

      {/* --- HERO SEKCE --- */}
      <section className="relative pt-32 pb-16 md:pt-40 md:pb-24 px-6 overflow-hidden min-h-[85vh] flex flex-col justify-center">
        <div className="absolute inset-0 bg-grid-pattern z-0 opacity-40"></div>
        {/* Perf — `blur-[150px]` přes plochu 1000×500 px byl na mobilu drahý
            compositing. Zmenšujeme na 600×300 + blur-[80px] (vizuálně skoro stejné,
            GPU kompozit ~60 % levnější). */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-indigo-600/30 rounded-full blur-[80px] pointer-events-none z-0"></div>

        <div className="absolute hidden xl:flex top-[22%] right-[4%] bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-2xl shadow-2xl items-center gap-4 z-0 anim-notif-1 opacity-0 scale-90 cursor-default max-w-[260px]">
          <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center shrink-0">
            <MessageSquare size={18} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-white text-sm font-bold">Požadavek z portálu</p>
            <p className="text-xs text-slate-400">Klient nahrál podklad — čeká úkol.</p>
          </div>
        </div>

        <div className="max-w-[1200px] mx-auto relative z-10 w-full">
          <div className="flex flex-col lg:flex-row lg:items-center lg:gap-12 xl:gap-16">
            <div className="flex-1 text-center lg:text-left">
              <div className="hero-anim inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-6 lg:mx-0 mx-auto">
                <Command size={14} className="text-slate-400" />
                <span className="text-xs font-bold text-slate-300">Pro finanční poradce a týmy</span>
              </div>

              <h1 className="hero-anim delay-100 font-jakarta text-4xl sm:text-5xl md:text-6xl lg:text-6xl xl:text-7xl font-extrabold tracking-tight text-glow-shimmer leading-[1.1] mb-6 hyphens-none">
                Jeden nástroj pro finanční poradenství — od prvního kontaktu po uzavření.
              </h1>

              <p className="hero-anim delay-200 font-inter text-lg md:text-xl text-slate-400 max-w-2xl mb-3 leading-relaxed lg:mx-0 mx-auto">
                CRM, klientská zóna a workflow pro finanční poradce — klienti, dokumenty, schůzky a úkoly na jednom místě.
                <span className="block mt-2 text-base md:text-lg text-slate-500">Méně administrativy, více přehledu a lepší servis pro klienta.</span>
              </p>
              <p className="hero-anim delay-200 text-sm text-slate-500 max-w-2xl mb-8 leading-relaxed lg:mx-0 mx-auto">
                Pro samostatné poradce, týmy i broker pooly — jeden workspace, role Manažer / Poradce / Asistent.
              </p>

              <div className="hero-anim delay-300 mb-5 lg:justify-start justify-center flex flex-col sm:flex-row flex-wrap gap-3">
                <Link
                  href="/prihlaseni?register=1"
                  className="w-full sm:w-auto px-8 py-4 bg-white text-[#0a0f29] rounded-full text-base font-bold tracking-wide hover:bg-slate-200 transition-all hover:scale-[1.02] shadow-[0_0_30px_rgba(255,255,255,0.2)] text-center min-h-[44px] flex items-center justify-center"
                >
                  Založit účet — {trialDaysLabel} zdarma
                </Link>
                <a
                  href={DEMO_BOOKING_MAILTO}
                  className="w-full sm:w-auto px-8 py-4 border border-white/25 text-white rounded-full text-base font-bold tracking-wide hover:bg-white/10 transition-all text-center min-h-[44px] flex items-center justify-center"
                >
                  Domluvit demo (cca 20 min)
                </a>
              </div>
              <p className="hero-anim delay-300 text-xs text-slate-500 mb-5 lg:text-left text-center">
                Bez závazku — {trialDaysLabel} v úrovni Pro (pak zvolíte tarif).
              </p>
              <div className="hero-anim delay-300 flex flex-wrap gap-x-4 gap-y-2 justify-center lg:justify-start text-[11px] sm:text-xs text-slate-500 mb-8">
                <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} className="text-emerald-500/80 shrink-0" /> Data v EU</span>
                <span className="text-slate-600 hidden sm:inline">·</span>
                <span>TLS · šifrovaný přenos</span>
                <span className="text-slate-600 hidden sm:inline">·</span>
                <span>Záznam citlivých akcí (zavádíme)</span>
                <span className="text-slate-600 hidden sm:inline">·</span>
                <span>Role Manažer / Poradce / Asistent</span>
              </div>

              <p className="hero-anim delay-400 text-sm md:text-base text-slate-400 max-w-xl border-t border-white/10 pt-6 lg:text-left text-center lg:mx-0 mx-auto">
                Méně chaosu v podkladech. Více přehledu v práci s klienty.
              </p>
            </div>

            <div className="hero-anim delay-200 flex-1 w-full max-w-xl mx-auto lg:mx-0 mt-12 lg:mt-0">
              {DEMO_VIDEO_URL ? (
                <div className="relative rounded-[24px] md:rounded-[32px] border border-white/10 bg-[#060918]/80 shadow-[0_0_60px_rgba(99,102,241,0.2)] overflow-hidden aspect-video flex flex-col items-center justify-center p-6 md:p-8">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/20 to-transparent pointer-events-none" />
                  <div className="relative z-10 text-center">
                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4 border border-white/10">
                      <Play size={32} className="text-white ml-1" />
                    </div>
                    <p className="text-white font-jakarta font-bold text-sm md:text-base mb-3">Krátké demo</p>
                    <a
                      href={DEMO_VIDEO_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[44px] items-center justify-center px-6 py-3 rounded-full text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-500 transition-all"
                    >
                      Přehrát video
                    </a>
                  </div>
                </div>
              ) : (
                // Launch — když není `NEXT_PUBLIC_LANDING_DEMO_VIDEO_URL` nastaveno,
                // nepoužíváme dekorativní fallback. Přímo mountneme první z živých
                // ukázek (Obchody — Pipeline). Vimeo player (~800 KB) se díky
                // VimeoFacade stáhne až po kliknutí, takže hero zůstává rychlé
                // a uživatel má okamžitý motion proof na first paint.
                <div className="relative rounded-[24px] md:rounded-[32px] border border-white/10 bg-[#060918]/80 shadow-[0_0_60px_rgba(99,102,241,0.2)] overflow-hidden">
                  <VimeoFacade vimeoId="1184117287" hash="6595dae869" title="Obchody — pipeline" />
                  <div className="px-5 py-4 border-t border-white/10 bg-white/[0.02]">
                    <p className="text-xs font-bold uppercase tracking-widest text-indigo-300">Ukázka z aplikace</p>
                    <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                      Obchodní pipeline — od prvního kontaktu po podpis. Tahat, filtrovat, přiřazovat.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* --- ROI TEASER --- */}
      <section id="roi-teaser" className="py-10 md:py-12 border-b border-white/10 bg-[#060918]/90 scroll-mt-24">
        <div className="max-w-[1100px] mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-2">Orientační model</p>
            <p className="text-slate-300 text-sm md:text-base max-w-xl">
              Odhad měsíční hodnoty podle vašich vstupů — doladíte v plné kalkulačce níže. Ilustrativně, nejde o garanci výsledku.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4 shrink-0">
            <div className="text-2xl md:text-3xl font-black text-emerald-400 tabular-nums">
              {formatNumber(roiValue)}{" "}
              <span className="text-base text-slate-500 font-medium">Kč / měs.</span>
            </div>
            <a
              href="#roi-kalkulacka"
              className="min-h-[44px] px-6 py-3 rounded-full bg-white text-[#0a0f29] text-sm font-bold hover:bg-slate-200 transition-colors whitespace-nowrap inline-flex items-center justify-center"
            >
              Spočítat přínos
            </a>
          </div>
        </div>
      </section>

      {/* --- EARLY ACCESS / PILOT STRIP (bez referenčních citací do doby jejich ověření) --- */}
      <section
        aria-labelledby="early-access-heading"
        className="py-14 md:py-16 border-y border-white/10 bg-white/[0.03] relative z-10 backdrop-blur-sm overflow-hidden"
      >
        <div className="max-w-[1100px] mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-center md:gap-10 gap-8">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] font-bold uppercase tracking-widest mb-4">
                <Sparkles size={12} /> Early access · pilot
              </div>
              <h3
                id="early-access-heading"
                className="font-jakarta text-2xl md:text-3xl font-bold text-white leading-tight mb-3"
              >
                Spouštíme s vybranou skupinou poradců.
              </h3>
              <p className="text-sm md:text-base text-slate-400 leading-relaxed max-w-xl">
                Zákaznické reference zveřejníme až po pilotním provozu — a jen s&nbsp;doloženým písemným souhlasem
                konkrétních poradců. Do té doby raději nic neslibujeme za jiné.
              </p>
            </div>

            <div className="md:w-[360px] shrink-0">
              <ul className="grid grid-cols-1 gap-3">
                <li className="flex items-start gap-3 p-4 rounded-2xl border border-white/10 bg-white/[0.04]">
                  <ShieldCheck size={18} className="text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-white font-bold text-sm">Data v EU</p>
                    <p className="text-slate-400 text-xs leading-relaxed">
                      Hostování u poskytovatelů v EU, šifrování při přenosu i uložení.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3 p-4 rounded-2xl border border-white/10 bg-white/[0.04]">
                  <Lock size={18} className="text-indigo-300 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-white font-bold text-sm">Audit stopa a role</p>
                    <p className="text-slate-400 text-xs leading-relaxed">
                      Záznam citlivých akcí, oddělení workspaců, role a oprávnění.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3 p-4 rounded-2xl border border-white/10 bg-white/[0.04]">
                  <CheckCircle2 size={18} className="text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-white font-bold text-sm">Česká s.r.o., CZ právo</p>
                    <p className="text-slate-400 text-xs leading-relaxed">
                      Fakturace v CZK, VOP a Zásady zpracování osobních údajů v češtině.
                    </p>
                  </div>
                </li>
              </ul>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-slate-500">
                <Link href="/bezpecnost" className="underline-offset-4 hover:text-slate-300 hover:underline">
                  Bezpečnost a ochrana dat
                </Link>
                <span className="text-slate-600">·</span>
                <Link href="/privacy" className="underline-offset-4 hover:text-slate-300 hover:underline">
                  Zásady zpracování
                </Link>
                <span className="text-slate-600">·</span>
                <Link href="/terms" className="underline-offset-4 hover:text-slate-300 hover:underline">
                  Obchodní podmínky
                </Link>
                <span className="text-slate-600">·</span>
                <Link
                  href="/legal/zpracovatelska-smlouva"
                  className="underline-offset-4 hover:text-slate-300 hover:underline"
                >
                  Zpracovatelská smlouva
                </Link>
                <span className="text-slate-600">·</span>
                <a
                  href={`mailto:${LEGAL_SECURITY_EMAIL}?subject=${encodeURIComponent("Security — dotaz z webu")}`}
                  className="underline-offset-4 hover:text-slate-300 hover:underline"
                >
                  {LEGAL_SECURITY_EMAIL}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- LIVE UKÁZKY (4 Vimeo demos) --- */}
      <section id="live-ukazky" className="py-20 md:py-28 relative overflow-hidden bg-[#0a0f29] border-t border-white/10 scroll-mt-24">
        <div className="max-w-[1400px] mx-auto px-6 relative z-10">
          <ScrollReveal>
            <div className="text-center mb-14">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-bold uppercase tracking-widest mb-6">
                <Play size={14} /> Ukázky z produkce
              </div>
              <h2 className="font-jakarta text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">
                Co <span className="text-glow-shimmer">Aidvisora opravdu umí.</span>
              </h2>
              <p className="text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
                Čtyři krátké ukázky z produkční aplikace (seeded demo data, bez mockupů a renderů).
              </p>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            {[
              {
                title: "Obchody",
                subtitle: "Pipeline + kartička obchodu",
                desc: "Kanban od prvního kontaktu po podpis. Tahat, filtrovat, přiřazovat — bez Excelu.",
                vimeoId: "1184117287",
                hash: "6595dae869",
              },
              {
                title: "Zápisky",
                subtitle: "Zápisy ze schůzek",
                desc: "Strukturované zápisky přímo u klienta. AI pomůže s formulací dalších kroků.",
                vimeoId: "1184116979",
                hash: "d93e14037a",
              },
              {
                title: "Požadavky klienta",
                subtitle: "Samoobsluha pro klienta",
                desc: "Klient pošle požadavek přes portál. Vy ho vidíte okamžitě, bez e-mailové přeháňky.",
                vimeoId: "1184116078",
                hash: "ffbbde98b1",
              },
              {
                title: "Výpověď",
                subtitle: "Registr výpovědí",
                desc: "Výpovědi smluv s lhůtami, přílohami a stavem doručení. Nic nezapadne.",
                vimeoId: "1184117652",
                hash: "45bbe61eb4",
              },
            ].map((v, idx) => (
              <ScrollReveal key={v.vimeoId} delay={idx * 80}>
                <div className="rounded-[24px] border border-white/10 bg-white/5 overflow-hidden backdrop-blur-md hover:border-indigo-500/40 transition-colors">
                  {/*
                    Perf — Vimeo facade (thumbnail + Play). Vimeo player (~800 KB JS)
                    se stáhne teprve po kliknutí. Dříve byly všechny 4 iframe aktivní
                    od prvního paintu, což táhlo MB dat a blokovalo main thread.
                  */}
                  <VimeoFacade vimeoId={v.vimeoId} hash={v.hash} title={v.title} />
                  <div className="p-5 md:p-6">
                    <p className="text-xs font-bold uppercase tracking-widest text-indigo-300 mb-1">{v.subtitle}</p>
                    <h3 className="font-jakarta text-xl font-bold text-white mb-2">{v.title}</h3>
                    <p className="text-sm text-slate-300 leading-relaxed">{v.desc}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>

          <ScrollReveal delay={400}>
            <div className="mt-10 text-center">
              <p className="text-sm text-slate-400">
                Chcete vidět i zbytek aplikace (AI review smluv, klientská zóna, analytika)?{" "}
                <a href={DEMO_BOOKING_MAILTO} className="text-indigo-400 font-bold hover:text-indigo-300 underline underline-offset-2">
                  Domluvte si 20minutové demo.
                </a>
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* --- CO DĚLÁ AIDVISORU JINOU --- */}
      <section id="diferenciatory" className="py-20 md:py-28 relative overflow-hidden bg-[#060918] border-t border-white/10 scroll-mt-24">
        <div className="max-w-[1400px] mx-auto px-6 relative z-10">
          <ScrollReveal>
            <div className="text-center mb-14">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold uppercase tracking-widest mb-6">
                <Sparkles size={14} /> Proč ne jen další CRM
              </div>
              <h2 className="font-jakarta text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">
                Co dělá <span className="text-glow-shimmer">Aidvisoru jinou.</span>
              </h2>
              <p className="text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
                Tři věci, které jinde nenajdete — nebo je musíte lepit z pěti různých nástrojů.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {[
              {
                icon: Bot,
                title: "AI review smluv, ne jen šablony",
                desc: "Nahrajete PDF smlouvy, Aidvisora přečte pole, typ produktu, pojistné, rizika — a sama navrhne, co zkopírovat do karty klienta. Žádný copy-paste, žádné ruční přepisování.",
                highlight: "V pilotech typicky několikanásobně rychlejší než ruční přepis",
              },
              {
                icon: Users,
                title: "Klientská zóna bez dalšího poplatku",
                desc: "Vaši klienti mají vlastní přihlášení, kde vidí své smlouvy, dokumenty, návrhy a mohou vám rovnou poslat dotaz. Neplatí se za klienta, neúčtuje se podle seatů.",
                highlight: "Zahrnuto v tarifu, bez limitu klientů",
              },
              {
                icon: ShieldCheck,
                title: "Postavené podle českého práva",
                desc: "GDPR, AML, zákon o distribuci pojištění — všechno v základu. TLS 1.2+ v přenosu, audit log, DPA smlouva, hosting v EU. Rozsah column-level šifrování rodných čísel dokumentujeme v /bezpecnost.",
                highlight: "TLS 1.2+, DPA, hosting EU, audit log",
              },
            ].map((d, idx) => (
              <ScrollReveal key={d.title} delay={idx * 100}>
                <div className="h-full rounded-[24px] border border-white/10 bg-white/5 p-6 md:p-8 backdrop-blur-md hover:border-emerald-500/40 transition-colors">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mb-5">
                    <d.icon size={26} className="text-emerald-300" />
                  </div>
                  <h3 className="font-jakarta text-2xl font-bold text-white mb-3 leading-tight">{d.title}</h3>
                  <p className="text-sm text-slate-300 leading-relaxed mb-4">{d.desc}</p>
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-300 border-t border-emerald-500/20 pt-3">
                    {d.highlight}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* --- AI ASISTENT & DŮVĚRYHODNOST --- */}
      <section id="ai-asistent" className="py-20 md:py-28 relative overflow-hidden bg-[#060918] scroll-mt-24">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[560px] bg-purple-600/10 rounded-full blur-[80px] pointer-events-none z-0"></div>
        
        <div className="max-w-[1400px] mx-auto px-6 relative z-10 border-t border-white/10 pt-20">
          <ScrollReveal immediate>
            <div className="bg-white/5 border border-white/10 rounded-[48px] p-8 md:p-16 lg:p-24 backdrop-blur-md flex flex-col lg:flex-row items-center gap-16 shadow-2xl mb-16">
              
              <div className="lg:w-1/2">
                <div className="flex flex-wrap items-center gap-2 mb-8">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-bold uppercase tracking-widest">
                    <Bot size={16} /> Pomocník se smlouvou, ne místo vás
                  </div>
                  <ProPlanBadge className="shrink-0" />
                </div>
                <h2 className="font-jakarta text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
                  AI, která pomůže se <span className="text-glow-shimmer">smlouvou a dalším krokem.</span>
                </h2>
                <p className="text-xs text-slate-500 -mt-4 mb-6 max-w-xl">
                  Plné AI review PDF a pokročilý asistent jsou od tarifu Pro; ve Startu je základní asistent bez review PDF.
                </p>
                <p className="text-base md:text-lg text-slate-400 mb-10 md:mb-12 leading-relaxed max-w-xl">
                  Přečte PDF s vámi na mysli: vytáhne klíčové údaje, upozorní na mezery a navrhne, co ověřit. Rozhodujete vy — nic se nemění bez vašeho potvrzení.
                </p>

                <div className="space-y-3 md:space-y-4">
                  {[
                    {
                      icon: Activity,
                      title: "Mezery v krytí",
                      desc: "Krátce ukáže, kde může chybět pojistné krytí nebo pozornost při schůzce.",
                    },
                    {
                      icon: FileText,
                      title: "Údaje ze smlouvy",
                      desc: "Hlavní částky a typ produktu z PDF přehledně k doplnění nebo kontrole u klienta.",
                    },
                    {
                      icon: Bell,
                      title: "Úkoly a priority",
                      desc: "Připomene follow-upy a termíny v kontextu klienta — bez přebírání vaší práce.",
                    },
                  ].map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={i}
                        className="flex items-start gap-4 p-4 md:p-5 rounded-2xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/10"
                      >
                        <div className="mt-0.5 bg-purple-500/20 p-3 rounded-xl text-purple-400 border border-purple-500/30 shrink-0">
                          <Icon size={20} />
                        </div>
                        <div className="min-w-0 pt-0.5">
                          <h4 className="text-white font-bold text-base md:text-lg mb-1.5">{item.title}</h4>
                          <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="lg:w-1/2 w-full">
                 <AiSandbox />
              </div>

            </div>
          </ScrollReveal>

          {/* AI TRUST LAYER */}
          <ScrollReveal delay={300} immediate>
            <div className="max-w-4xl mx-auto text-center border border-white/10 bg-white/5 rounded-3xl p-10">
               <h3 className="font-jakarta text-2xl font-bold text-white mb-3">AI navrhuje, <span className="text-purple-400">poradce rozhoduje.</span></h3>
               <p className="text-slate-400 mb-8 max-w-xl mx-auto">Věříme, že umělá inteligence je užitečný pomocník, ale u peněz má poslední slovo vždy člověk. Proto jsme nastavili jasná pravidla.</p>
               
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
                  <div className="flex flex-col gap-2">
                    <CheckCircle2 size={24} className="text-emerald-400 mb-2"/>
                    <h4 className="font-bold text-white">Lidská kontrola</h4>
                    <p className="text-sm text-slate-400">AI nepropisuje údaje do karty klienta ani neodesílá zprávy bez vašeho potvrzení.</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Search size={24} className="text-emerald-400 mb-2"/>
                    <h4 className="font-bold text-white">Auditovatelnost</h4>
                    <p className="text-sm text-slate-400">
                      U výstupu vidíte zdrojový dokument; u pole často i stránku a krátký úryvek z textu pro kontrolu.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Lock size={24} className="text-emerald-400 mb-2"/>
                    <h4 className="font-bold text-white">Bezpečné zpracování</h4>
                    <p className="text-sm text-slate-400">
                      Používáme API dodavatelů AI podle smluvních podmínek (obvykle bez trénování na vašich vstupech). Podrobnosti v{" "}
                      <Link href="/legal/ai-disclaimer" className="text-indigo-300 underline underline-offset-2 hover:text-white">
                        AI disclaimeru
                      </Link>
                      .
                    </p>
                  </div>
               </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* --- EVOLUCE PRAXE (Srovnání Dnes vs S Aidvisorou) --- */}
      <section id="jak-to-funguje" className="py-20 md:py-28 relative overflow-hidden bg-[#060918] scroll-mt-24">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[260px] bg-indigo-500/10 rounded-[100%] blur-[80px] pointer-events-none"></div>
        
        <div className="max-w-[1200px] mx-auto px-6 relative z-10">
          <ScrollReveal immediate>
            <div className="text-center mb-20">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-xs font-black uppercase tracking-widest mb-6">
                <ArrowRight size={14} className="text-indigo-400"/> Jak to vypadá v praxi
              </div>
              <h2 className="font-jakarta text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight">
                Rozdíl v <span className="text-glow-shimmer">každodenní práci.</span>
              </h2>
              <p className="text-xl text-slate-400 max-w-2xl mx-auto">
                Starý způsob: data v Excelu a e-mailech. S Aidvisorou: přehled klientů, úkolů a dokumentů na jednom místě.
              </p>
            </div>
          </ScrollReveal>

          <div className="flex flex-col lg:flex-row items-center gap-6 lg:gap-12">
            
            {/* STARÝ ZPŮSOB */}
            <ScrollReveal delay={100} direction="right" className="w-full lg:w-[45%]">
              <div className="bg-slate-900/50 border border-slate-800 rounded-[32px] p-8 md:p-10 relative overflow-hidden h-full grayscale-[0.3] opacity-80 hover:grayscale-0 hover:opacity-100 transition-all duration-500">
                <div className="absolute top-0 right-0 w-48 h-48 bg-rose-500/5 rounded-full blur-3xl"></div>
                
                <div className="flex items-center gap-4 mb-8 pb-6 border-b border-slate-800">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400 shadow-inner">
                    <Archive size={24} />
                  </div>
                  <div>
                    <h3 className="font-jakarta text-2xl font-bold text-slate-300">Běžná praxe</h3>
                    <p className="text-sm font-medium text-slate-500">Ztráta času a roztříštěná data</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {[
                    { icon: FileText, text: 'Klientská data ve 3 různých Excelech' },
                    { icon: MessageSquare, text: 'Dokumenty ztracené v e-mailech a chatu' },
                    { icon: Clock, text: 'Hodiny ručního přepisování smluv' },
                    { icon: AlertTriangle, text: 'Ztracené follow-upy a výročí' },
                  ].map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-slate-800/30 border border-slate-700/50">
                        <div className="p-2 bg-slate-800 rounded-lg text-slate-500"><Icon size={18}/></div>
                        <span className="text-slate-400 font-medium line-through decoration-rose-500/30">{item.text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </ScrollReveal>

            {/* ŠIPKA / TRANSFORMACE */}
            <ScrollReveal delay={200} className="hidden lg:flex flex-col items-center justify-center relative z-20 w-[10%]">
              <div className="w-16 h-16 rounded-full bg-[#060918] border border-slate-800 flex items-center justify-center shadow-[0_0_40px_rgba(99,102,241,0.3)]">
                <ArrowRight size={28} className="text-indigo-400" />
              </div>
              {/* Animovaná linka */}
              <div className="absolute top-1/2 left-1/2 -translate-y-1/2 -z-10 w-[200px] h-[2px] bg-gradient-to-r from-slate-800 via-indigo-500 to-emerald-500 opacity-50"></div>
            </ScrollReveal>

            {/* NOVÝ STANDARD (AIDVISORA) */}
            <ScrollReveal delay={300} direction="left" className="w-full lg:w-[45%]">
              <div className="bg-gradient-to-br from-indigo-900/40 to-slate-900 border border-indigo-500/30 rounded-[32px] p-8 md:p-10 relative overflow-hidden h-full shadow-[0_0_60px_rgba(99,102,241,0.15)] transform lg:scale-105">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-[80px]"></div>
                <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-emerald-400"></div>
                
                <div className="flex items-center gap-4 mb-8 pb-6 border-b border-indigo-500/20 relative z-10">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/30">
                    <Sparkles size={24} />
                  </div>
                  <div>
                    <h3 className="font-jakarta text-2xl font-bold text-white">S Aidvisorou</h3>
                    <p className="text-sm font-bold text-indigo-300">Všechna klientská data, dokumenty a úkoly na jednom místě.</p>
                  </div>
                </div>

                <div className="space-y-4 relative z-10">
                  {[
                    { icon: Database, text: 'Všechna klientská data na jednom místě', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
                    { icon: ShieldCheck, text: 'Šifrovaný portál pro sdílení dokumentů', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                    { icon: Bot, text: 'AI pomáhá vyčíst údaje z nahraných PDF a navrhuje další krok.', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
                    { icon: Bell, text: 'Systém vás upozorní na blokátory, termíny a follow-upy.', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
                  ].map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <div key={i} className={`flex items-center gap-4 p-4 rounded-2xl border ${item.bg} backdrop-blur-sm transition-transform hover:scale-[1.02]`}>
                        <div className={`p-2 rounded-lg bg-white/5 ${item.color}`}><Icon size={18}/></div>
                        <span className="text-slate-100 font-bold text-sm leading-tight">{item.text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </ScrollReveal>

          </div>
        </div>
      </section>

      {/* --- SCROLL STORYTELLING: NÁSTROJE APLIKACE --- */}
      <section id="aplikace" className="py-20 md:py-28 relative bg-[#060918]">
        <div className="max-w-[1400px] mx-auto px-6 space-y-40 border-t border-white/10 pt-20">
          
          <ScrollReveal>
            <div className="text-center mb-20">
              <h2 className="font-jakarta text-4xl md:text-6xl font-bold text-white mb-6">Jedna platforma pro každodenní práci.</h2>
              <p className="text-xl text-slate-400 max-w-2xl mx-auto">Aidvisora je webová aplikace, kde se prolínají klienti, schůzky, obchody a dokumenty. Bez roztříštěných tabulek a e-mailů.</p>
            </div>
          </ScrollReveal>

          {/* 1. KALENDÁŘ A ÚKOLY */}
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <ScrollReveal className="lg:w-1/2 space-y-6" direction="right">
              <div className="w-14 h-14 bg-indigo-500/20 text-indigo-400 rounded-2xl flex items-center justify-center mb-6 border border-indigo-500/30"><CalendarDays size={28}/></div>
              <h3 className="font-jakarta text-4xl font-bold text-white leading-tight">Kalendář a úkoly na jednom místě.</h3>
              <p className="text-lg text-slate-400 leading-relaxed">
                Náš moderní kalendář není jen doplněk. Je to plnohodnotný nástroj s přetahováním, týdenní mřížkou a bočním panelem agendy, kam vám AI chystá úkoly na daný den.
              </p>
              <ul className="space-y-3 pt-4">
                <li className="flex items-center gap-3 text-slate-300"><CheckCircle2 size={18} className="text-indigo-500"/> Synchronizace s Google Kalendářem</li>
                <li className="flex items-center gap-3 text-slate-300"><CheckCircle2 size={18} className="text-indigo-500"/> Postranní panel s nevyřešenými úkoly</li>
                <li className="flex items-center gap-3 text-slate-300"><CheckCircle2 size={18} className="text-indigo-500"/> Snadné plánování schůzek s klienty</li>
              </ul>
            </ScrollReveal>
            
            <ScrollReveal className="lg:w-1/2 w-full" direction="left">
              <div className="bg-[#f8fafc] rounded-[24px] border border-white/10 shadow-[0_0_50px_rgba(99,102,241,0.15)] relative overflow-hidden h-[400px] flex flex-col">
                <div className="bg-white border-b border-slate-200 p-4 flex items-center justify-between">
                  <span className="font-bold text-slate-800 capitalize">{calendarMonthLabel}</span>
                  <div className="flex gap-2"><span className="px-3 py-1 bg-slate-100 rounded text-xs font-bold text-slate-600">Pracovní</span><span className="px-3 py-1 bg-white border border-slate-200 rounded text-xs font-bold text-slate-600">Týden</span></div>
                </div>
                <div className="flex-1 flex overflow-hidden">
                  <div className="flex-1 border-r border-slate-200 bg-white grid grid-cols-5 relative">
                     <div className="absolute inset-0 bg-[linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[length:100%_40px]"></div>
                     <div className="col-start-3 absolute top-[80px] w-[90%] left-[5%] h-[80px] bg-indigo-100 border-l-4 border-indigo-500 rounded-md p-2 shadow-sm">
                       <p className="text-xs font-bold text-indigo-900">Schůzka: Novákovi</p>
                       <p className="text-[10px] text-indigo-600">10:00 - 11:30</p>
                     </div>
                  </div>
                  <div className="w-[30%] bg-slate-50 p-4 overflow-y-auto">
                     <p className="text-[10px] font-black uppercase text-slate-400 mb-3">Agenda • Dnes</p>
                     <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm mb-3">
                       <p className="text-xs font-bold text-slate-800 mb-1">Odeslat PDF report</p>
                       <button className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-1 rounded font-bold">Hotovo</button>
                     </div>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          </div>

          {/* 2. PIPELINE (OBNOVENÁ ANIMACE - BEZ PŘEKRYVU) */}
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <ScrollReveal className="lg:w-1/2 w-full order-2 lg:order-1" direction="right">
              <div className="bg-[#10152e] rounded-[32px] p-6 border border-white/10 shadow-[0_0_50px_rgba(59,130,246,0.15)] relative overflow-hidden h-[400px] flex gap-4">
                <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
                {/* Sloupec 1: Příprava */}
                <div className="w-1/2 h-full flex flex-col gap-4 relative z-10">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Příprava</div>
                  {/* Animovaná Karta */}
                  <div className="bg-white/5 border border-white/10 p-4 rounded-2xl animate-move-across w-full">
                    <div className="flex justify-between mb-2">
                      <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">Hypotéka</span>
                      <span className="text-xs font-bold text-slate-300">5.0M</span>
                    </div>
                    <div className="text-sm font-bold text-white mb-2">Rodina Dvořákova</div>
                    <div className="text-[10px] text-emerald-400 flex items-center gap-1"><Check size={10}/> Schváleno!</div>
                  </div>
                  {/* Statická karta dole, aby sloupec nebyl prázdný */}
                  <div className="bg-white/5 border border-white/10 p-4 rounded-2xl opacity-50 mt-auto">
                     <div className="h-2 w-1/2 bg-white/20 rounded mb-2"></div>
                     <div className="h-4 w-3/4 bg-white/30 rounded"></div>
                  </div>
                </div>
                {/* Sloupec 2: Dokončení obchodu (ne e-podpis) */}
                <div className="w-1/2 h-full flex flex-col gap-4 relative z-10 border-l border-white/5 pl-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Dokončení</div>
                  {/* Cílový slot pro animovanou kartu */}
                  <div className="border-2 border-dashed border-indigo-500/30 rounded-2xl h-[100px] flex items-center justify-center bg-indigo-500/5">
                     <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Přetáhněte sem</span>
                  </div>
                  <div className="bg-white/5 border border-white/10 p-4 rounded-2xl border-l-4 border-l-emerald-500">
                    <div className="flex justify-between mb-2"><span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded">Investice</span></div>
                    <div className="text-sm font-bold text-white mb-2">Bc. Alena Malá</div>
                    <div className="text-[10px] text-emerald-400 flex items-center gap-1"><Check size={10}/> Vše hotovo</div>
                  </div>
                </div>
              </div>
            </ScrollReveal>

            <ScrollReveal className="lg:w-1/2 space-y-6 order-1 lg:order-2" direction="left">
              <div className="w-14 h-14 bg-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center mb-6 border border-blue-500/30"><KanbanSquare size={28}/></div>
              <h3 className="font-jakarta text-4xl font-bold text-white leading-tight">Přehled obchodů a příležitostí v pipeline.</h3>
              <p className="text-lg text-slate-400 leading-relaxed">
                Nenechte žádný obchod vychladnout. Přesuňte příležitosti z přípravy k dokončení — připomene blokátory a úkoly po termínu.
              </p>
            </ScrollReveal>
          </div>

          {/* 3. MINDMAPY (INTERAKTIVNÍ, SVĚTLÝ DESIGN) */}
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <ScrollReveal className="lg:w-1/2 space-y-6" direction="right">
              <div className="w-14 h-14 bg-orange-500/20 text-orange-400 rounded-2xl flex items-center justify-center mb-6 border border-orange-500/30"><Network size={28}/></div>
              <h3 className="font-jakarta text-4xl font-bold text-white leading-tight">Struktura portfolia rodiny na jednom plátně.</h3>
              <p className="text-lg text-slate-400 leading-relaxed">
                Mindmapa v aplikaci zobrazuje vztahy a portfolio domácnosti. Po přihlášení si ji upravíte přetahováním uzlů — na webu ukazujeme jen náhled.
              </p>
            </ScrollReveal>

            <ScrollReveal className="lg:w-1/2 w-full" direction="left">
              <div className="bg-[#f8fafc] rounded-[32px] border border-slate-200 shadow-[0_0_50px_rgba(99,102,241,0.05)] relative overflow-hidden h-[400px] flex flex-col items-center justify-center p-8 mindmap-dots">
                <div className="relative z-10 max-w-sm text-center space-y-4">
                  <Network size={40} className="text-orange-500 mx-auto" aria-hidden />
                  <p className="text-slate-700 font-jakarta font-bold text-lg">Mindmapa portfolia</p>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Živou mindmapu s úpravami uzlů najdete v sekci Mindmap po založení účtu.
                  </p>
                  <Link
                    href="/prihlaseni?register=1"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white hover:bg-indigo-500 transition-colors"
                  >
                    Otevřít v aplikaci
                  </Link>
                </div>
              </div>
            </ScrollReveal>
          </div>

          {/* 4. FINANČNÍ ANALÝZY A FUNKČNÍ MINI KALKULAČKA */}
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <ScrollReveal className="lg:w-1/2 w-full order-2 lg:order-1" direction="right">
              <div className="bg-[#10152e] rounded-[32px] p-8 border border-white/10 shadow-[0_0_50px_rgba(16,185,129,0.1)] relative overflow-hidden h-[400px] flex flex-col justify-between">
                <div className="absolute -top-20 -right-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-[80px] pointer-events-none"></div>
                
                <div className="relative z-10 flex justify-between items-end mb-2">
                  <div>
                    <span className="block text-emerald-400 text-xs font-bold uppercase tracking-widest mb-1">Pravidelná investice</span>
                    <span className="text-white font-black text-2xl sm:text-3xl">{formatNumber(miniCalcInvest)} Kč</span>
                  </div>
                  <div className="text-right">
                    <span className="block text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Doba</span>
                    <span className="text-white font-black text-xl">{miniCalcYears} let</span>
                  </div>
                </div>

                <div className="relative z-10 w-full mb-6 space-y-4">
                   <div>
                     <input type="range" className="modern-slider" min="1000" max="25000" step="500" value={miniCalcInvest} onChange={(e) => setMiniCalcInvest(Number(e.target.value))} />
                   </div>
                   <div>
                     <input type="range" className="modern-slider" min="5" max="35" step="1" value={miniCalcYears} onChange={(e) => setMiniCalcYears(Number(e.target.value))} />
                   </div>
                </div>

                <div className="relative z-10 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm text-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-2 block">Modelová budoucí hodnota (7 % p.a.)*</span>
                  <div className="text-4xl sm:text-5xl font-black text-white mb-2">{formatNumber(futureValue)} <span className="text-xl sm:text-2xl text-slate-500">Kč</span></div>
                  <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
                    *Ilustrativní výpočet. Nejde o investiční doporučení ani garanci výnosu; minulé výnosy nepředurčují budoucí. Výstup do PDF reportu pro klienta si připravíte v aplikaci po přihlášení.
                  </p>
                  <Link
                    href="/prihlaseni?register=1"
                    className="mt-4 inline-flex w-full min-h-[40px] items-center justify-center px-4 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-xs font-bold text-emerald-200 hover:bg-emerald-500/20 transition-colors"
                  >
                    Založit účet a zkusit v aplikaci
                  </Link>
                </div>
              </div>
            </ScrollReveal>

            <ScrollReveal className="lg:w-1/2 space-y-6 order-1 lg:order-2" direction="left">
              <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mb-6 border border-emerald-500/30"><Calculator size={28}/></div>
              <h3 className="font-jakarta text-4xl font-bold text-white leading-tight">Od dat k finančnímu plánu a PDF reportu.</h3>
              <p className="text-lg text-slate-400 leading-relaxed">
                Zkuste si zahýbat posuvníky vedle! Naše integrované investiční a hypoteční kalkulačky tvoří základ analýzy. Systém vás provede sběrem dat a vygeneruje přehledný PDF report.
              </p>
            </ScrollReveal>
          </div>

          {/* 5. TÝMOVÝ PŘEHLED */}
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <ScrollReveal className="lg:w-1/2 space-y-6" direction="right">
              <div className="w-14 h-14 bg-purple-500/20 text-purple-400 rounded-2xl flex items-center justify-center mb-6 border border-purple-500/30"><Users size={28}/></div>
              <h3 className="font-jakarta text-4xl font-bold text-white leading-tight">Kompletní přehled pro vedení</h3>
              <p className="text-lg text-slate-400 leading-relaxed">
                Řídíte tým poradců nebo asistentek? Aidvisora vám dává okamžitý vhled do jejich aktivity, schůzek a uzavřené produkce.
              </p>
            </ScrollReveal>
            
            <ScrollReveal className="lg:w-1/2 w-full" direction="left">
              <div className="bg-[#f8fafc] rounded-[24px] border border-white/10 shadow-[0_0_50px_rgba(168,85,247,0.15)] relative overflow-hidden h-[400px] p-6 flex flex-col gap-4">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                  <h4 className="font-bold text-slate-800">Týmový přehled</h4>
                  <div className="text-xs bg-white border border-slate-200 px-3 py-1 rounded-lg text-slate-600 font-bold">Měsíc</div>
                </div>
                <div className="flex items-end gap-2 h-24 pt-4 border-b border-slate-200 pb-2">
                  <div className="w-1/5 bg-slate-200 h-[30%] rounded-t-sm"></div>
                  <div className="w-1/5 bg-slate-200 h-[60%] rounded-t-sm"></div>
                  <div className="w-1/5 bg-slate-200 h-[40%] rounded-t-sm"></div>
                  <div className="w-1/5 bg-indigo-400 h-[90%] rounded-t-sm"></div>
                  <div className="w-1/5 bg-slate-200 h-[50%] rounded-t-sm"></div>
                </div>
                <div className="bg-purple-600/90 text-white p-4 rounded-xl shadow-md">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Sparkles size={16} aria-hidden />
                    <span className="text-sm font-bold">Manažerské shrnutí týmu (AI)</span>
                    <span className="text-[9px] font-black uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                      Management
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-100/90 leading-relaxed">
                    V produkci generujete z přehledu týmu — zde je jen ilustrace rozhraní.
                  </p>
                </div>
                <div className="bg-red-50 border border-red-100 p-3 rounded-xl flex items-center gap-3">
                  <AlertTriangle size={16} className="text-red-500 shrink-0"/>
                  <span className="text-sm text-red-800 font-medium"><strong>Jan Svoboda:</strong> Žádná evidovaná schůzka za 14 dní.</span>
                </div>
              </div>
            </ScrollReveal>
          </div>

          {/* 6. DALŠÍ NÁSTROJE V APLIKACI */}
          <ScrollReveal>
            <div className="mx-auto max-w-[1000px] rounded-[32px] border border-white/10 bg-white/[0.03] p-8 md:p-12">
              <h3 className="font-jakarta text-center text-2xl font-bold text-white md:text-3xl mb-3">
                Další nástroje v aplikaci
              </h3>
              <p className="text-slate-400 text-center text-sm md:text-base max-w-2xl mx-auto mb-8 leading-relaxed">
                Kromě kalendáře, pipeline a mindmapy najdete v portálu například finanční analýzy, kalkulačky, business plán,
                e-mailové kampaně, klientské požadavky, zápisky a napojení na Google nástroje podle tarifu.
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-300 max-w-3xl mx-auto">
                {[
                  "Finanční analýzy a kalkulačky",
                  "Business plán a produkce",
                  "E-mailové kampaně",
                  "Klientské požadavky (workflow)",
                  "Zápisky a dokumenty",
                  "Google Kalendář, Gmail a Drive (Pro+)",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <p className="text-center mt-8">
                <Link
                  href="/prihlaseni?register=1"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-indigo-600 px-6 py-3 text-sm font-bold text-white hover:bg-indigo-500 transition-colors"
                >
                  Prohlédnout po registraci
                </Link>
              </p>
            </div>
          </ScrollReveal>

        </div>
      </section>

      {/* --- TYPICKÝ DEN (Workflow Storytelling) --- */}
      <section id="workflow" className="py-20 md:py-28 relative bg-[#0a0f29] border-t border-white/5 scroll-mt-24">
        <div className="max-w-[1000px] mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-24">
              <h2 className="font-jakarta text-4xl md:text-5xl font-bold text-white mb-4">Váš nový pracovní den.</h2>
              <p className="text-xl text-slate-400">Stručný průřez: priority, schůzka, portál klienta, večer bez chaosu.</p>
            </div>
          </ScrollReveal>

          <div className="relative">
            <div className="absolute left-[28px] md:left-1/2 top-0 bottom-0 w-[2px] bg-white/10 md:-translate-x-1/2 rounded-full overflow-hidden">
               <div className="timeline-glow"></div>
            </div>

            <ScrollReveal className="relative flex flex-col md:flex-row items-start md:items-center justify-between mb-16 md:mb-24 group">
              <div className="md:hidden pl-20 pr-4 mb-4 w-full order-first">
                 <h3 className="font-jakarta text-lg font-bold text-white mb-1">Ráno: priority</h3>
                 <p className="text-sm text-slate-400">Náhled na dnešní schůzky, úkoly a co dotáhnout — bez deseti složek.</p>
              </div>
              <div className="hidden md:block md:w-5/12 text-right pr-12">
                 <h3 className="font-jakarta text-2xl font-bold text-white mb-2">Ráno: priority</h3>
                 <p className="text-slate-400">Náhled na dnešní schůzky, úkoly a co je potřeba dotáhnout — bez procházení deseti složek.</p>
              </div>
              <div className="absolute left-0 md:left-1/2 w-14 h-14 bg-[#0a0f29] border-4 border-slate-800 rounded-full flex items-center justify-center md:-translate-x-1/2 z-10 shadow-[0_0_20px_rgba(251,191,36,0.2)] group-hover:border-amber-500 transition-colors">
                <Sunrise className="text-amber-500" size={24} />
              </div>
              <div className="w-full pl-20 md:pl-0 md:w-5/12 md:text-left md:pl-12">
                 <SpotlightCard className="p-6">
                   <div className="flex items-center gap-3 mb-3"><Bot className="text-purple-400" size={20}/><span className="text-sm font-bold text-white">AI Brífing (08:00)</span></div>
                   <p className="text-sm text-slate-400 italic">„Dnes 3 schůzky, 2 otevřené úkoly — rodina Novákových čeká na doplnění podkladu.“</p>
                 </SpotlightCard>
              </div>
            </ScrollReveal>

            <ScrollReveal className="relative flex flex-col md:flex-row items-start md:items-center justify-between mb-16 md:mb-24 group">
              <div className="md:hidden pl-20 pr-4 mb-4 w-full order-2">
                 <h3 className="font-jakarta text-lg font-bold text-white mb-1">Schůzka u klienta</h3>
                 <p className="text-sm text-slate-400">Data u karty klienta, kalkulačky a PDF bez přepínání nástrojů.</p>
              </div>
              <div className="w-full pl-20 md:pl-0 md:w-5/12 md:text-right md:pr-12 order-3 md:order-1">
                 <SpotlightCard className="p-6">
                   <div className="flex items-center gap-3 mb-3"><Briefcase className="text-blue-400" size={20}/><span className="text-sm font-bold text-white">Schůzka s klientem (11:00)</span></div>
                   <div className="space-y-2">
                     <div className="h-2 w-full bg-white/10 rounded-full"></div>
                     <div className="h-2 w-3/4 bg-white/10 rounded-full"></div>
                   </div>
                 </SpotlightCard>
              </div>
              <div className="absolute left-0 md:left-1/2 w-14 h-14 bg-[#0a0f29] border-4 border-slate-800 rounded-full flex items-center justify-center md:-translate-x-1/2 z-10 shadow-[0_0_20px_rgba(59,130,246,0.2)] group-hover:border-blue-500 transition-colors order-1 md:order-2">
                <Sun className="text-blue-500" size={24} />
              </div>
              <div className="hidden md:block md:w-5/12 text-left pl-12 order-4 md:order-3">
                 <h3 className="font-jakarta text-2xl font-bold text-white mb-2">Schůzka u klienta</h3>
                 <p className="text-slate-400">Data a dokumenty u karty klienta, kalkulačky a výstup do PDF — bez přepínání mezi nástroji.</p>
              </div>
            </ScrollReveal>

            <ScrollReveal className="relative flex flex-col md:flex-row items-start md:items-center justify-between mb-16 md:mb-24 group">
              <div className="md:hidden pl-20 pr-4 mb-4 w-full order-first">
                 <h3 className="font-jakarta text-lg font-bold text-white mb-1">Portál klienta</h3>
                 <p className="text-sm text-slate-400">Klient nahraje podklad; chat a požadavky od tarifu Pro — u vás úkol a upozornění.</p>
              </div>
                <div className="hidden md:block md:w-5/12 text-right pr-12">
                 <h3 className="font-jakarta text-2xl font-bold text-white mb-2">Portál klienta</h3>
                 <p className="text-slate-400">
                   Klient bezpečně nahraje podklad (Start). Chat a zprávy z portálu od tarifu Pro — u vás vznikne úkol a upozornění.
                 </p>
              </div>
              <div className="absolute left-0 md:left-1/2 w-14 h-14 bg-[#0a0f29] border-4 border-slate-800 rounded-full flex items-center justify-center md:-translate-x-1/2 z-10 shadow-[0_0_20px_rgba(16,185,129,0.2)] group-hover:border-emerald-500 transition-colors">
                <Smartphone className="text-emerald-500" size={24} />
              </div>
              <div className="w-full pl-20 md:pl-0 md:w-5/12 md:text-left md:pl-12">
                 <SpotlightCard className="p-6 border-emerald-500/30">
                   <div className="flex items-center gap-3 mb-3"><Bell className="text-emerald-400" size={20}/><span className="text-sm font-bold text-white">Nová notifikace (14:30)</span></div>
                   <p className="text-sm text-slate-300">
                   Klient <strong className="text-white">Jan Novák</strong> nahrál soubor „Občanka.pdf“.
                   <span className="block mt-1 text-[11px] text-slate-500">Zprávy v portálu od tarifu Pro.</span>
                 </p>
                 </SpotlightCard>
              </div>
            </ScrollReveal>

            <ScrollReveal className="relative flex flex-col md:flex-row items-start md:items-center justify-between group">
              <div className="w-full pl-20 md:pl-0 md:w-5/12 md:text-right md:pr-12 order-2 md:order-1">
                 <SpotlightCard className="p-6">
                   <div className="flex items-center justify-between"><span className="text-sm font-bold text-white">Úkoly hotovy</span><span className="text-indigo-400 font-black">100%</span></div>
                   <div className="h-1.5 w-full bg-white/10 rounded-full mt-3"><div className="h-full bg-indigo-500 rounded-full w-full"></div></div>
                 </SpotlightCard>
              </div>
              <div className="absolute left-0 md:left-1/2 w-14 h-14 bg-[#0a0f29] border-4 border-slate-800 rounded-full flex items-center justify-center md:-translate-x-1/2 z-10 shadow-[0_0_20px_rgba(99,102,241,0.2)] group-hover:border-indigo-500 transition-colors order-1 md:order-2">
                <Moon className="text-indigo-500" size={24} />
              </div>
              <div className="hidden md:block md:w-5/12 text-left pl-12 order-4 md:order-3">
                 <h3 className="font-jakarta text-2xl font-bold text-white mb-2">Konec dne</h3>
                 <p className="text-slate-400">Pipeline a úkoly aktualizované — víte, co zítra otevřít jako první.</p>
              </div>
            </ScrollReveal>

          </div>
        </div>
      </section>

      {/* --- PRO KOHO JE AIDVISORA (Cílové skupiny) --- */}
      <section id="pro-koho" className="py-20 md:py-28 relative bg-[#060918]">
        <div className="max-w-[1400px] mx-auto px-6 border-t border-white/10 pt-20">
          <ScrollReveal>
            <div className="text-center mb-16">
              <h2 className="font-jakarta text-4xl md:text-5xl font-bold text-white mb-4">Aplikace, která se vám přizpůsobí.</h2>
              <p className="text-xl text-slate-400 max-w-2xl mx-auto">Ať jste samostatný poradce, nebo řídíte tým. Aidvisora má nástroje pro různé role.</p>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <ScrollReveal delay={100}>
              <SpotlightCard className="p-8 h-full flex flex-col">
                <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-400 mb-6"><User size={24}/></div>
                <h3 className="font-jakarta text-2xl font-bold text-white mb-2">Samostatný poradce</h3>
                <p className="text-slate-400 mb-6 leading-relaxed">Administrativa vám požírá čas, který byste mohli věnovat obchodu a rodině.</p>
                <div className="mt-auto p-4 bg-white/5 rounded-2xl border border-white/10">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1 block">Klíčový modul</span>
                  <p className="text-sm text-slate-300 font-medium">Automatizace s <strong className="text-white">AI Asistentem</strong> a vizuální <strong className="text-white">Pipeline</strong>.</p>
                </div>
              </SpotlightCard>
            </ScrollReveal>

            <ScrollReveal delay={200}>
              <SpotlightCard className="p-8 h-full flex flex-col">
                <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center text-purple-400 mb-6"><Users size={24}/></div>
                <h3 className="font-jakarta text-2xl font-bold text-white mb-2">Management</h3>
                <p className="text-slate-400 mb-6 leading-relaxed">Ztrácíte přehled o tom, na čem vaši lidé pracují, a excelové reporty produkce jsou věčně neaktuální.</p>
                <div className="mt-auto p-4 bg-white/5 rounded-2xl border border-white/10">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1 block">Klíčový modul</span>
                  <p className="text-sm text-slate-300 font-medium">Sdílené pohledy a <strong className="text-white">KPI a produkce</strong> v jednom přehledu (tarif Management).</p>
                </div>
              </SpotlightCard>
            </ScrollReveal>

            <ScrollReveal delay={300}>
              <SpotlightCard className="p-8 h-full flex flex-col">
                <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center text-amber-400 mb-6"><CheckSquare size={24}/></div>
                <h3 className="font-jakarta text-2xl font-bold text-white mb-2">Asistentka / Backoffice</h3>
                <p className="text-slate-400 mb-6 leading-relaxed">Lovíte podklady z mailů a zpráv a ručně urgujete klienty, ať vám pošlou OP.</p>
                <div className="mt-auto p-4 bg-white/5 rounded-2xl border border-white/10">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1 block">Klíčový modul</span>
                  <p className="text-sm text-slate-300 font-medium"><strong className="text-white">Klientská Zóna</strong> pro bezpečné nahrávání do trezoru.</p>
                </div>
              </SpotlightCard>
            </ScrollReveal>

            <ScrollReveal delay={400}>
              <SpotlightCard className="p-8 h-full flex flex-col">
                <div className="w-12 h-12 bg-rose-500/20 rounded-xl flex items-center justify-center text-rose-400 mb-6"><Building size={24}/></div>
                <h3 className="font-jakarta text-2xl font-bold text-white mb-2">Firma / Broker pool</h3>
                <p className="text-slate-400 mb-6 leading-relaxed">
                  Potřebujete oddělený datový prostor pro pobočky, jasné role a smluvní rámec (DPA) — bez přehnaných slibů o „stoprocentním“ GDPR.
                </p>
                <div className="mt-auto p-4 bg-white/5 rounded-2xl border border-white/10">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1 block">Klíčový přínos</span>
                  <p className="text-sm text-slate-300 font-medium">
                    <strong className="text-white">Izolovaný workspace</strong> pro vaši organizaci, řízení přístupů podle rolí a podpora při due diligence.
                  </p>
                </div>
              </SpotlightCard>
            </ScrollReveal>

          </div>
        </div>
      </section>

      {/* --- KLIENTSKÁ ZÓNA (DVA SVĚTY) --- */}
      <section id="klientska-zona" className="py-20 md:py-28 relative bg-[#060918]">
        <div className="max-w-[1400px] mx-auto px-6 border-t border-white/10 pt-20">
          <ScrollReveal>
            <div className="text-center mb-16">
              <h2 className="font-jakarta text-4xl md:text-6xl font-bold text-white mb-6">Dva světy. Jedna platforma.</h2>
              <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
                Vy řídíte obchod a vztahy. Klient má jednoduchý digitální servis — u tarifu{" "}
                <strong className="text-slate-300">Start</strong> hlavně dokumenty v portálu;{" "}
                <strong className="text-slate-300">chat, nové požadavky z portálu a plný servis</strong> jsou od tarifu{" "}
                <strong className="text-slate-300">Pro</strong>.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-6 order-2 lg:order-1">
              <ScrollReveal direction="left" delay={100}>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8">
                  <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center border border-indigo-500/30 mb-4"><Briefcase size={24} /></div>
                  <h3 className="font-jakarta text-xl font-bold text-white mb-2">Pracovní prostředí pro poradce</h3>
                  <p className="text-slate-400 leading-relaxed text-sm md:text-base">CRM, kalendář, pipeline a úkoly na jednom místě. Přehled klientů, schůzek a produkce bez chaosu.</p>
                </div>
              </ScrollReveal>

              <ScrollReveal direction="left" delay={200}>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8">
                  <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center border border-emerald-500/30 mb-4"><Smartphone size={24} /></div>
                  <h3 className="font-jakarta text-xl font-bold text-white mb-2">Klientská zóna</h3>
                  <p className="text-slate-400 leading-relaxed text-sm md:text-base mb-4">
                    Klient nahraje podklady do portálu (Start). Od tarifu <strong className="text-slate-300">Pro</strong> přibývá
                    zadání požadavku, chat a zprávy — vše s upozorněním a úkolem u vás v aplikaci.
                  </p>
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2 text-slate-400 text-sm">
                      <CheckCircle2 size={16} className="text-emerald-500 shrink-0" /> Bezpečné nahrání dokumentů (Start)
                    </li>
                    <li className="flex items-center gap-2 text-slate-400 text-sm">
                      <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                      <span className="inline-flex items-center gap-2 flex-wrap">
                        Nový požadavek z portálu <ProPlanBadge />
                      </span>
                    </li>
                    <li className="flex items-center gap-2 text-slate-400 text-sm">
                      <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                      <span className="inline-flex items-center gap-2 flex-wrap">
                        Chat a zpráva poradci <ProPlanBadge />
                      </span>
                    </li>
                    <li className="flex items-center gap-2 text-slate-400 text-sm"><CheckCircle2 size={16} className="text-emerald-500 shrink-0"/> Upozornění a navazující úkol</li>
                  </ul>
                  <p className="mt-4 text-xs text-slate-500 leading-relaxed border-t border-white/10 pt-4">
                    Pro přihlášení poradců plánujeme povinné dvoufaktorové ověření (TOTP) před ostrým veřejným spuštěním — viz{" "}
                    <Link href="/bezpecnost" className="text-indigo-300 underline underline-offset-2 hover:text-white">
                      přehled bezpečnosti
                    </Link>
                    .
                  </p>
                </div>
              </ScrollReveal>
            </div>

            {/* App Mockup: Klientská zóna - Zadání požadavku */}
            <ScrollReveal direction="right" delay={200} className="order-1 lg:order-2">
              <div className="relative">
                <div className="absolute -top-1 right-0 z-20">
                  <ProPlanBadge className="shadow-lg" />
                </div>
                <p className="text-center text-xs text-slate-500 mb-3 lg:text-right pr-16 sm:pr-20">
                  Ukázka požadavku z portálu — funkce od tarifu Pro
                </p>
              <div className="aspect-[4/3] bg-[#0a0f29] rounded-[40px] border border-white/10 shadow-[0_0_80px_rgba(59,130,246,0.15)] p-3 relative overflow-hidden group cursor-pointer">
                <div className="absolute inset-0 bg-blue-500/10 mix-blend-overlay"></div>
                <div className="w-full h-full bg-[#f8fafc] rounded-[32px] overflow-hidden flex flex-col relative z-10 border border-slate-200">
                  <div className="h-16 bg-white border-b border-slate-200 flex items-center px-6 justify-between">
                     <span className="font-bold text-indigo-600 text-lg">Můj Portál</span>
                     <div className="w-8 h-8 rounded-full bg-slate-200"></div>
                  </div>
                  <div className="p-6 flex-1 flex flex-col items-center justify-center relative bg-slate-50">
                       <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 w-full max-w-sm">
                          <h4 className="font-bold text-slate-800 mb-2">Chci vyřešit novou službu</h4>
                          <div className="mb-4"><CustomDropdown value="hypo" onChange={() => {}} options={[{ id: "hypo", label: "Nová hypotéka" }]} placeholder="Služba" icon={Home} /></div>
                          <button className="w-full bg-indigo-600 text-white py-2 rounded-lg font-bold text-sm">Odeslat požadavek poradci</button>
                       </div>
                       
                       <div className="absolute top-4 right-4 bg-slate-900 text-white p-3 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-3 animate-bounce">
                         <Bell size={16} className="text-amber-400"/>
                         <div>
                           <p className="text-[10px] font-bold text-slate-400 uppercase">Nové Flow</p>
                           <p className="text-xs font-bold">Klient žádá o hypotéku</p>
                         </div>
                       </div>
                  </div>
                </div>
              </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* --- INFRASTRUKTURA A BEZPEČNOST (Interaktivní Jádro) --- */}
      <section id="infrastruktura" className="py-20 md:py-28 relative overflow-hidden bg-[#060918]">
        <div className="max-w-[1400px] mx-auto px-6 border-t border-white/10 pt-24">
          <ScrollReveal>
            <div className="text-center mb-24">
              <h2 className="font-jakarta text-4xl md:text-6xl font-bold text-white mb-6">Moderní a bezpečná infrastruktura.</h2>
              <p className="text-xl text-slate-400 max-w-3xl mx-auto">
                Data v bezpečném prostředí v EU. Aplikace běží v cloudu, máte k ní přístup odkudkoli a připravenost pro audity.
              </p>
            </div>
          </ScrollReveal>

          {/* Interaktivní komponenta s Jádrem */}
          <div className="flex flex-col lg:flex-row items-center gap-16 relative">
            <ScrollReveal className="lg:w-1/3 flex justify-center relative" direction="right">
              <div className={`relative w-64 h-64 flex items-center justify-center transition-all duration-700
                  ${activeSecurityFeature === 'gdpr' ? 'drop-shadow-[0_0_60px_rgba(52,211,153,0.5)]' : 
                    activeSecurityFeature === 'cloud' ? 'drop-shadow-[0_0_60px_rgba(59,130,246,0.5)]' : 
                    activeSecurityFeature === 'rbac' ? 'drop-shadow-[0_0_60px_rgba(168,85,247,0.5)]' : 
                    'drop-shadow-[0_0_40px_rgba(255,255,255,0.1)]'}
              `}>
                <div className={`absolute inset-0 rounded-full blur-[60px] transition-colors duration-700 opacity-60
                   ${activeSecurityFeature === 'gdpr' ? 'bg-emerald-500' : 
                     activeSecurityFeature === 'cloud' ? 'bg-blue-500' : 
                     activeSecurityFeature === 'rbac' ? 'bg-purple-500' : 'bg-slate-700'}
                `}></div>
                
                <div className={`w-40 h-40 bg-[#0a0f29] rounded-full border-4 flex items-center justify-center relative z-10 transition-colors duration-700 shadow-inner
                   ${activeSecurityFeature === 'gdpr' ? 'border-emerald-500' : 
                     activeSecurityFeature === 'cloud' ? 'border-blue-500' : 
                     activeSecurityFeature === 'rbac' ? 'border-purple-500' : 'border-slate-600'}
                `}>
                   {activeSecurityFeature === 'gdpr' ? <Lock size={48} className="text-emerald-400" /> : 
                    activeSecurityFeature === 'cloud' ? <Server size={48} className="text-blue-400" /> : 
                    activeSecurityFeature === 'rbac' ? <Users size={48} className="text-purple-400" /> : 
                    <ShieldCheck size={48} className="text-slate-400" />}
                </div>
              </div>
            </ScrollReveal>

            <div className="lg:w-2/3 flex flex-col gap-6 relative z-10 w-full">
              <ScrollReveal delay={100} direction="left" className="w-full">
                <div 
                  onMouseEnter={() => setActiveSecurityFeature('gdpr')}
                  onMouseLeave={() => setActiveSecurityFeature('none')}
                  className="p-8 rounded-[32px] bg-white/5 border border-white/10 hover:bg-white/10 hover:border-emerald-500/50 transition-all duration-300 cursor-pointer group"
                >
                  <div className="flex items-center gap-4 mb-3">
                    <Lock size={24} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                    <h3 className="font-bold text-xl text-white">Ochrana dat a GDPR</h3>
                  </div>
                  <p className="text-slate-400 leading-relaxed text-lg pl-10">
                    Evidence souhlasů, export dat na žádost a zavádění jednotného záznamu citlivých akcí. Data jsou uložena v EU — stav po jednotlivých oblastech najdete v přehledu níže.
                  </p>
                </div>
              </ScrollReveal>

              <ScrollReveal delay={200} direction="left" className="w-full">
                <div 
                  onMouseEnter={() => setActiveSecurityFeature('cloud')}
                  onMouseLeave={() => setActiveSecurityFeature('none')}
                  className="p-8 rounded-[32px] bg-white/5 border border-white/10 hover:bg-white/10 hover:border-blue-500/50 transition-all duration-300 cursor-pointer group"
                >
                  <div className="flex items-center gap-4 mb-3">
                    <Server size={24} className="text-blue-400 group-hover:scale-110 transition-transform" />
                    <h3 className="font-bold text-xl text-white">Provoz v cloudu (EU)</h3>
                  </div>
                  <p className="text-slate-400 leading-relaxed text-lg pl-10">
                    Bez instalace — aplikace běží v zabezpečeném prostředí s evropským regionem pro data a přístup z prohlížeče na počítači i mobilu.
                  </p>
                </div>
              </ScrollReveal>

              <ScrollReveal delay={300} direction="left" className="w-full">
                <div 
                  onMouseEnter={() => setActiveSecurityFeature('rbac')}
                  onMouseLeave={() => setActiveSecurityFeature('none')}
                  className="p-8 rounded-[32px] bg-white/5 border border-white/10 hover:bg-white/10 hover:border-purple-500/50 transition-all duration-300 cursor-pointer group"
                >
                  <div className="flex items-center gap-4 mb-3">
                    <Users size={24} className="text-purple-400 group-hover:scale-110 transition-transform" />
                    <h3 className="font-bold text-xl text-white">Izolace workspace a role</h3>
                  </div>
                  <p className="text-slate-400 leading-relaxed text-lg pl-10">
                    Každá organizace má vlastní izolovaný datový prostor; přístup řídíte rolemi <strong className="text-slate-300">Manažer</strong>,{" "}
                    <strong className="text-slate-300">Poradce</strong> a <strong className="text-slate-300">Asistent</strong> podle vašeho nastavení.
                  </p>
                </div>
              </ScrollReveal>

              <ScrollReveal delay={400} direction="left" className="w-full">
                <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6 md:p-8 text-center md:text-left">
                  <p className="text-slate-400 text-sm md:text-base leading-relaxed mb-4">
                    Podrobný stav opatření (co je spuštěné, co dokončujeme) máme rozvedený na stránce Bezpečnost včetně kontaktu{" "}
                    <a href={`mailto:${LEGAL_SECURITY_EMAIL}`} className="text-indigo-300 underline underline-offset-2 hover:text-white">
                      {LEGAL_SECURITY_EMAIL}
                    </a>
                    .
                  </p>
                  <Link
                    href="/bezpecnost"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-white text-[#0a0f29] px-6 py-3 text-sm font-bold hover:bg-slate-200 transition-colors"
                  >
                    Podrobný přehled bezpečnosti
                  </Link>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </section>

      {/* --- NOVÉ: ROI KALKULAČKA --- */}
      <section id="roi-kalkulacka" className="py-20 md:py-28 relative overflow-hidden bg-[#060918]">
        <div className="max-w-[1200px] mx-auto px-6 border-t border-white/10 pt-24">
          <ScrollReveal>
            <div className="text-center mb-16">
              <h2 className="font-jakarta text-4xl md:text-5xl font-bold text-white mb-6">Kolik vám Aidvisora vrátí?</h2>
              <p className="text-xl text-slate-400 max-w-2xl mx-auto">Vyplňte parametry praxe a podívejte se na odhad úspor času a příležitostí.</p>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 bg-white/5 border border-white/10 rounded-[40px] p-8 md:p-12">
            {/* Vstupy */}
            <ScrollReveal direction="right" className="space-y-8">
              <div>
                <div className="flex justify-between items-end mb-2">
                  <label className="text-sm font-bold text-slate-300">Počet klientů v kmeni (na poradce)</label>
                  <span className="text-xl font-black text-indigo-400">{roiClients}</span>
                </div>
                <input type="range" min="50" max="500" step="10" value={roiClients} onChange={(e) => setRoiClients(Number(e.target.value))} className="w-full modern-slider" />
              </div>
              <div>
                <div className="flex justify-between items-end mb-2">
                  <label className="text-sm font-bold text-slate-300">Hodin administrativy týdně (na poradce)</label>
                  <span className="text-xl font-black text-indigo-400">{roiAdmin} hod.</span>
                </div>
                <input type="range" min="2" max="40" step="1" value={roiAdmin} onChange={(e) => setRoiAdmin(Number(e.target.value))} className="w-full modern-slider" />
              </div>
              <div>
                <div className="flex justify-between items-end mb-2">
                  <label className="text-sm font-bold text-slate-300">Velikost týmu (poradců)</label>
                  <span className="text-xl font-black text-indigo-400">{roiTeam}</span>
                </div>
                <input type="range" min="1" max="50" step="1" value={roiTeam} onChange={(e) => setRoiTeam(Number(e.target.value))} className="w-full modern-slider" />
              </div>
            </ScrollReveal>

            {/* Výstupy */}
            <ScrollReveal direction="left" className="flex flex-col justify-center bg-[#0a0f29] rounded-[24px] p-8 border border-indigo-500/30 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl"></div>
              
              <div className="space-y-6 relative z-10">
                <div>
                  <span className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Modelová úspora času (Měsíčně)*</span>
                  <div className="text-3xl font-black text-white">{roiSavedHours} <span className="text-lg text-slate-400">hodin</span></div>
                  <p className="text-xs text-slate-500 mt-1">Model počítá s 40 % snížením administrativy.</p>
                </div>
                <div className="w-full h-px bg-white/10"></div>
                <div>
                  <span className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Modelové příležitosti z follow-upů (Ročně)*</span>
                  <div className="text-3xl font-black text-white">+{roiExtraDeals} <span className="text-lg text-slate-400">obchodů</span></div>
                  <p className="text-xs text-slate-500 mt-1">Model počítá s 5 % zvýšením konverze díky hlídání termínů.</p>
                </div>
                <div className="w-full h-px bg-white/10"></div>
                <div>
                  <span className="block text-xs font-black uppercase tracking-widest text-indigo-300 mb-1">Modelová hodnota pro praxi (Měsíčně)*</span>
                  <div className="text-4xl md:text-5xl font-black text-emerald-400">{formatNumber(roiValue)} <span className="text-2xl text-slate-400">Kč</span></div>
                </div>
              </div>
            </ScrollReveal>
          </div>
          <p className="text-center text-[11px] text-slate-500 mt-6 max-w-3xl mx-auto">
            *Orientační model sloužící k odhadu. Předpoklady: 40 % snížení administrativy, 5 % zvýšení konverze z lépe
            hlídaných follow-upů, hodnota ušetřené hodiny 1 000 Kč, průměrná provize z jednoho zachráněného obchodu
            15 000 Kč. Nejde o zaručený výsledek ani historický údaj z provozu — skutečné úspory závisí na vaší praxi a
            nastavení.
          </p>
        </div>
      </section>

      {/* --- INTEGRACE --- */}
      <section id="integrace" className="py-20 md:py-28 relative overflow-hidden bg-[#060918]">
        <div className="max-w-[1200px] mx-auto px-6 border-t border-white/10 pt-24 text-center">
          <ScrollReveal>
            <h2 className="font-jakarta text-4xl md:text-5xl font-bold text-white mb-6">Napojení na nástroje, které dává smysl používat každý den</h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-16 leading-relaxed">
              Aidvisora není uzavřený systém. Klíčové workflow propojuje s nástroji, které poradci reálně používají při plánování, komunikaci a práci s dokumenty.
            </p>
          </ScrollReveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
             <ScrollReveal delay={100}>
               <div className="bg-white/5 border border-white/10 p-6 md:p-8 rounded-3xl flex flex-col items-center justify-center hover:bg-white/10 transition-colors h-full text-center">
                 <Calendar size={40} className="text-blue-400 mb-4 shrink-0" />
                 <h4 className="font-bold text-white text-lg mb-2">Google Kalendář</h4>
                 <p className="text-sm text-slate-400">Obousměrná synchronizace schůzek a termínů, aby měl poradce i tým vždy aktuální přehled.</p>
               </div>
             </ScrollReveal>
             <ScrollReveal delay={200}>
               <div className="bg-white/5 border border-white/10 p-6 md:p-8 rounded-3xl flex flex-col items-center justify-center hover:bg-white/10 transition-colors h-full text-center">
                 <Mail size={40} className="text-rose-400 mb-4 shrink-0" />
                 <h4 className="font-bold text-white text-lg mb-2">E-mailové notifikace</h4>
                 <p className="text-sm text-slate-400">Upozornění a systémové e-maily podle událostí v aplikaci (např. nový požadavek z portálu) — bez slibu hromadného newsletteru.</p>
               </div>
             </ScrollReveal>
             <ScrollReveal delay={300}>
               <div className="bg-white/5 border border-white/10 p-6 md:p-8 rounded-3xl flex flex-col items-center justify-center hover:bg-white/10 transition-colors h-full text-center">
                 <FileText size={40} className="text-amber-400 mb-4 shrink-0" />
                 <h4 className="font-bold text-white text-lg mb-2">PDF a dokumenty</h4>
                 <p className="text-sm text-slate-400">Sdílení, generování výstupů a práce s dokumenty v návaznosti na klientský proces.</p>
               </div>
             </ScrollReveal>
             <ScrollReveal delay={400}>
               <div className="bg-white/5 border border-white/10 p-6 md:p-8 rounded-3xl flex flex-col items-center justify-center hover:bg-white/10 transition-colors h-full text-center">
                 <Network size={40} className="text-slate-400 mb-4 shrink-0" />
                 <h4 className="font-bold text-white text-lg mb-2">Další integrace připravujeme</h4>
                 <p className="text-sm text-slate-400">Napojení rozšiřujeme postupně podle priorit poradců a týmů.</p>
               </div>
             </ScrollReveal>
          </div>

          <p className="mt-12 md:mt-16 max-w-3xl mx-auto text-sm text-slate-500 leading-relaxed text-center px-2">
            Data zpracováváme s ohledem na EU a řízení přístupů podle rolí. Důležité akce zanechávají stopu vhodnou pro kontrolu a audit vaší praxe.
          </p>
        </div>
      </section>

      {/* --- CENÍK --- */}
      <section id="cenik" className="py-20 md:py-28 relative bg-[#060918] border-t border-white/10">
        <div className="max-w-[1200px] mx-auto px-6">
          <ScrollReveal>
             <div className="text-center mb-16">
               <h2 className="font-jakarta text-4xl md:text-5xl font-bold text-white mb-6">Tarify Start, Pro a Management</h2>
               <p className="text-xl text-slate-400 max-w-2xl mx-auto">
                 Rozdíl je hlavně v rozsahu portálu, integrací Google a v týmových přehledech. Tarif můžete měnit podle vývoje praxe.
               </p>
               
               <div className="inline-flex bg-white/5 border border-white/10 rounded-full p-1 mt-10">
                 <button type="button" className={`min-h-[44px] px-6 py-2.5 rounded-full text-sm font-bold ${!isAnnualPricing ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`} onClick={() => setIsAnnualPricing(false)}>Měsíčně</button>
                 <button type="button" className={`min-h-[44px] px-6 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 ${isAnnualPricing ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`} onClick={() => setIsAnnualPricing(true)}>
                   Ročně <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">−20 %</span>
                 </button>
               </div>
               <p className="text-sm text-slate-500 mt-4 max-w-lg mx-auto">
                 Při roční fakturaci platíte o {ANNUAL_BILLING_DISCOUNT_PERCENT} % méně než při součtu 12 měsíčních plateb (stejné funkce, jiné fakturační období).
               </p>
               <p className="text-xs text-slate-500 mt-2 max-w-lg mx-auto">
                 Ceny jsou uvedeny <strong className="text-slate-400">bez DPH</strong> (21 %). DPH doplní Stripe Tax podle DIČ (MOSS/OSS, reverse-charge pro plátce z EU).
               </p>
               {isAnnualPricing ? (
                 <p className="text-xs text-emerald-400/90 mt-3 max-w-lg mx-auto font-medium">
                   Ekvivalent měsíčně při roční platbě: úspora{" "}
                   {formatPublicPriceKc(annualSavingsVersusTwelveMonthly(priceStart))} až{" "}
                   {formatPublicPriceKc(annualSavingsVersusTwelveMonthly(priceMgmt))} Kč ročně oproti 12× měsíční ceně.
                 </p>
               ) : null}
               <p className="text-xs text-slate-500 mt-3 max-w-xl mx-auto leading-relaxed">
                 <strong className="text-slate-400">Start</strong> — CRM, pipeline, kalendář, úkoly, Google Calendar, dokumenty v portálu, základní AI.{" "}
                 <strong className="text-slate-400">Pro</strong> — navíc chat, požadavky z portálu, Gmail, Drive, AI review PDF a pokročilý asistent.{" "}
                 <strong className="text-slate-400">Management</strong> — navíc týmové přehledy, produkce, KPI a reporty.
               </p>
               <p className="text-xs text-slate-500 mt-2 max-w-xl mx-auto">
                 Zkušební verze {trialDaysLabel} v úrovni <strong className="text-slate-400">Pro</strong>.
               </p>
               <p className="text-xs text-slate-500 mt-3 max-w-xl mx-auto leading-relaxed">
                 Ceny jsou za <strong className="text-slate-400">jeden workspace</strong> (vaši organizaci v systému). Rozsah uživatelů a
                 seatů upřesníme podle vaší praxe — u broker poolů a větších týmů si{" "}
                 <a href={DEMO_BOOKING_MAILTO} className="text-indigo-300 underline underline-offset-2 hover:text-white">
                   domluvte krátké demo
                 </a>
                 .
               </p>
               <p className="text-[11px] text-slate-600 mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                 <Link href="/cookies" className="hover:text-slate-400 underline-offset-4 hover:underline">
                   Cookies
                 </Link>
                 <span aria-hidden>·</span>
                 <Link href="/subprocessors" className="hover:text-slate-400 underline-offset-4 hover:underline">
                   Subdodavatelé
                 </Link>
                 <span aria-hidden>·</span>
                 <Link href="/legal/ai-disclaimer" className="hover:text-slate-400 underline-offset-4 hover:underline">
                   AI disclaimer
                 </Link>
               </p>
             </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
             <ScrollReveal delay={100} direction="up">
               <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 hover:bg-white/10 transition-colors">
                 <h3 className="font-jakarta text-2xl font-bold text-white mb-2">Start</h3>
                 <p className="text-slate-400 text-sm mb-6">{PUBLIC_PLAN_TAGLINE.start}</p>
                 <div className="text-4xl font-black text-white mb-1">
                   {formatPublicPriceKc(
                     isAnnualPricing ? effectiveMonthlyKcWhenBilledAnnually(priceStart) : priceStart
                   )}{" "}
                   <span className="text-lg text-slate-500 font-medium">Kč / měs.</span>
                 </div>
                 <p className={`text-xs text-slate-500 font-bold uppercase tracking-widest ${isAnnualPricing ? "mb-1" : "mb-8"}`}>
                   {isAnnualPricing ? "Ekvivalent při roční fakturaci" : "Fakturováno měsíčně"}
                 </p>
                 {isAnnualPricing ? (
                   <p className="text-xs text-slate-500 mb-6">
                     Celkem {formatPublicPriceKc(yearlyTotalKcFromMonthlyList(priceStart))} Kč / rok · úspora{" "}
                     {formatPublicPriceKc(annualSavingsVersusTwelveMonthly(priceStart))} Kč
                   </p>
                 ) : null}
                 
                 <Link href="/prihlaseni?register=1" className="block w-full py-4 bg-white/10 text-white rounded-xl font-bold hover:bg-white/20 transition-colors mb-2 border border-white/10 text-center min-h-[44px] flex items-center justify-center">Založit účet — {trialDaysLabel} zdarma</Link>
                 <Link href="/prihlaseni" className="block w-full py-3 text-slate-400 text-sm font-medium hover:text-white transition-colors text-center mb-8">Už mám účet — přihlásit se</Link>
                 
                 <ul className="space-y-3">
                   {PUBLIC_PLAN_INCLUDES.start.map((line) => (
                     <li key={line} className="flex items-start gap-3 text-slate-300 text-sm">
                       <Check size={18} className="text-indigo-400 shrink-0 mt-0.5" /> {line}
                     </li>
                   ))}
                 </ul>
                 <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mt-4 mb-2">V ceně Start nejsou</p>
                 <ul className="space-y-2">
                   {PUBLIC_PLAN_START_EXCLUDES.map((line) => (
                     <li key={line} className="flex items-start gap-3 text-slate-500 text-xs">
                       <XCircle size={16} className="text-slate-600 shrink-0 mt-0.5" /> {line}
                     </li>
                   ))}
                 </ul>
               </div>
             </ScrollReveal>

             {/* PRO BALÍČEK */}
             <ScrollReveal delay={200} direction="up">
               <div className="pro-pricing-wrapper transform md:scale-105 shadow-[0_0_50px_rgba(139,92,246,0.2)]">
                 <div className="pro-pricing-inner p-8">
                   <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1 rounded-b-xl z-20">Nejvyužívanější</div>
                   <h3 className="font-jakarta text-2xl font-bold text-white mb-2 mt-4 relative z-20">Pro</h3>
                   <p className="text-slate-400 text-sm mb-6 relative z-20">{PUBLIC_PLAN_TAGLINE.pro}</p>
                   <div className="text-5xl font-black text-white mb-1 relative z-20">
                     {formatPublicPriceKc(
                       isAnnualPricing ? effectiveMonthlyKcWhenBilledAnnually(pricePro) : pricePro
                     )}{" "}
                     <span className="text-lg text-slate-500 font-medium">Kč / měs.</span>
                   </div>
                   <p className={`text-xs text-slate-500 font-bold uppercase tracking-widest relative z-20 ${isAnnualPricing ? "mb-1" : "mb-8"}`}>
                     {isAnnualPricing ? "Ekvivalent při roční fakturaci" : "Fakturováno měsíčně"}
                   </p>
                   {isAnnualPricing ? (
                     <p className="text-xs text-slate-500 mb-6 relative z-20">
                       Celkem {formatPublicPriceKc(yearlyTotalKcFromMonthlyList(pricePro))} Kč / rok · úspora{" "}
                       {formatPublicPriceKc(annualSavingsVersusTwelveMonthly(pricePro))} Kč
                     </p>
                   ) : null}
                   
                   <Link href="/prihlaseni?register=1" className="block w-full py-4 bg-indigo-500 text-white rounded-xl font-bold hover:bg-indigo-400 transition-colors mb-2 shadow-lg shadow-indigo-500/30 relative z-20 text-center min-h-[44px] flex items-center justify-center">Založit účet — {trialDaysLabel} zdarma</Link>
                   <Link href="/prihlaseni" className="block w-full py-3 text-indigo-200/90 text-sm font-medium hover:text-white transition-colors mb-8 relative z-20 text-center">Už mám účet — přihlásit se</Link>
                   
                   <ul className="space-y-3 relative z-20">
                     {PUBLIC_PLAN_INCLUDES.pro.map((line) => (
                       <li key={line} className="flex items-start gap-3 text-white text-sm font-medium">
                         <Check size={18} className="text-emerald-400 shrink-0 mt-0.5" /> {line}
                       </li>
                     ))}
                   </ul>
                 </div>
               </div>
             </ScrollReveal>

             <ScrollReveal delay={300} direction="up">
               <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 hover:bg-white/10 transition-colors">
                 <h3 className="font-jakarta text-2xl font-bold text-white mb-2">Management</h3>
                 <p className="text-slate-400 text-sm mb-6">{PUBLIC_PLAN_TAGLINE.management}</p>
                 <div className="text-4xl font-black text-white mb-1">
                   {formatPublicPriceKc(
                     isAnnualPricing ? effectiveMonthlyKcWhenBilledAnnually(priceMgmt) : priceMgmt
                   )}{" "}
                   <span className="text-lg text-slate-500 font-medium">Kč / měs.</span>
                 </div>
                 <p className={`text-xs text-slate-500 font-bold uppercase tracking-widest ${isAnnualPricing ? "mb-1" : "mb-8"}`}>
                   {isAnnualPricing ? "Ekvivalent při roční fakturaci" : "Fakturováno měsíčně"}
                 </p>
                 {isAnnualPricing ? (
                   <p className="text-xs text-slate-500 mb-6">
                     Celkem {formatPublicPriceKc(yearlyTotalKcFromMonthlyList(priceMgmt))} Kč / rok · úspora{" "}
                     {formatPublicPriceKc(annualSavingsVersusTwelveMonthly(priceMgmt))} Kč
                   </p>
                 ) : null}
                 
                 <Link href="/prihlaseni?register=1" className="block w-full py-4 bg-white/10 text-white rounded-xl font-bold hover:bg-white/20 transition-colors mb-2 border border-white/10 text-center min-h-[44px] flex items-center justify-center">Založit účet — {trialDaysLabel} zdarma</Link>
                 <Link href="/prihlaseni" className="block w-full py-3 text-slate-400 text-sm font-medium hover:text-white transition-colors text-center mb-8">Už mám účet — přihlásit se</Link>
                 
                 <ul className="space-y-3">
                   {PUBLIC_PLAN_INCLUDES.management.map((line) => (
                     <li key={line} className="flex items-start gap-3 text-slate-300 text-sm">
                       <Check size={18} className="text-indigo-400 shrink-0 mt-0.5" /> {line}
                     </li>
                   ))}
                 </ul>
               </div>
             </ScrollReveal>
          </div>

          <p className="mt-10 text-center text-xs text-slate-500 max-w-xl mx-auto">
            Všechny ceny jsou <strong className="text-slate-400">bez DPH</strong> (21 %). DPH doplní Stripe Tax podle DIČ.
          </p>
        </div>
      </section>

      {/* --- NOVÉ: ONBOARDING / JAK ZAČÍT --- */}
      <section id="jak-zacit" className="py-20 md:py-28 relative overflow-hidden bg-[#060918]">
        <div className="max-w-[1200px] mx-auto px-6 border-t border-white/10 pt-24 text-center">
          <ScrollReveal>
            <h2 className="font-jakarta text-4xl md:text-5xl font-bold text-white mb-6">Začněte s přehledným onboardingem.</h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-16 leading-relaxed">
              Účet založíte během chvíle. U týmů klademe důraz na import klientů, napárování rolí a společné nastavení workflow — bez zbytečného chaosu.
            </p>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
             <ScrollReveal delay={100} direction="up" className="relative">
               <div className="bg-white/5 border border-white/10 p-8 rounded-3xl h-full text-left">
                 <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 font-black text-xl rounded-full flex items-center justify-center mb-6">1</div>
                 <h4 className="font-bold text-white text-xl mb-3">Ověříte e-mail a workspace</h4>
                 <p className="text-slate-400 text-sm leading-relaxed">
                   Založíte účet poradce, potvrdíte e-mail a projdete krátké založení workspace (název organizace, základní nastavení).
                 </p>
               </div>
             </ScrollReveal>
             <ScrollReveal delay={200} direction="up" className="relative">
               <div className="bg-white/5 border border-white/10 p-8 rounded-3xl h-full text-left">
                 <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 font-black text-xl rounded-full flex items-center justify-center mb-6">2</div>
                 <h4 className="font-bold text-white text-xl mb-3">Import a napojení kalendáře</h4>
                 <p className="text-slate-400 text-sm leading-relaxed">
                   Nahrajete klienty z Excelu/CSV (pomůžeme s mapováním sloupců) a připojíte Google Kalendář pro schůzky.
                 </p>
               </div>
             </ScrollReveal>
             <ScrollReveal delay={300} direction="up" className="relative">
               <div className="bg-white/5 border border-white/10 p-8 rounded-3xl h-full text-left">
                 <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 font-black text-xl rounded-full flex items-center justify-center mb-6">3</div>
                 <h4 className="font-bold text-white text-xl mb-3">Klientská zóna a tarif</h4>
                 <p className="text-slate-400 text-sm leading-relaxed">
                   Nastavíte klientský portál podle tarifu (Start vs Pro), role v týmu a první workflow — podle potřeby s naší podporou.
                 </p>
               </div>
             </ScrollReveal>
          </div>
        </div>
      </section>

      {/* --- FAQ SEKCE --- */}
      <section id="faq" className="py-20 md:py-28 bg-[#060918] border-t border-white/10">
        <div className="max-w-[800px] mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-16">
              <h2 className="font-jakarta text-4xl font-bold text-white mb-4">Často kladené dotazy</h2>
              <p className="text-slate-400">Vše, co potřebujete vědět před spuštěním.</p>
            </div>
          </ScrollReveal>

          <div className="space-y-4 max-w-3xl mx-auto">
            {FAQS.map((faq) => {
              const expanded = openFaq === faq.id;
              return (
              <ScrollReveal key={faq.id} delay={100}>
                <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden transition-all">
                  <button
                    type="button"
                    id={`faq-q-${faq.id}`}
                    aria-expanded={expanded}
                    aria-controls={`faq-panel-${faq.id}`}
                    onClick={() => setOpenFaq(expanded ? null : faq.id)}
                    className="w-full px-6 py-5 min-h-[44px] flex items-center justify-between text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-2xl"
                  >
                    <span className="font-bold text-white pr-4">{faq.q}</span>
                    <ChevronDown size={20} className={`text-slate-400 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} aria-hidden />
                  </button>
                  <div
                    id={`faq-panel-${faq.id}`}
                    role="region"
                    aria-labelledby={`faq-q-${faq.id}`}
                    className={`grid transition-[grid-template-rows] duration-200 ease-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                  >
                    <div className="overflow-hidden min-h-0">
                      <p className="px-6 pb-5 pt-0 text-slate-400 leading-relaxed text-sm max-w-prose border-t border-white/5">
                        {faq.a}
                      </p>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            );
            })}
          </div>
        </div>
      </section>

      {/* --- FOOTER CTA --- */}
      <section className="py-20 md:py-28 relative overflow-hidden border-t border-white/10">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-indigo-900/20 pointer-events-none"></div>
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <ScrollReveal>
            <h2 className="font-jakarta text-3xl sm:text-4xl md:text-6xl font-extrabold text-white tracking-tight mb-6">
              Vyzkoušejte Aidvisoru v praxi
            </h2>
            <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              {PUBLIC_TRIAL_DURATION_DAYS} dní bez závazku — stejné prostředí jako po přihlášení. CRM, klientská zóna, kalendář a dokumenty na jednom místě.
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-4 sm:gap-6">
              <Link
                href="/prihlaseni?register=1"
                className="w-full sm:w-auto px-10 py-5 bg-white text-[#0a0f29] rounded-full text-lg font-bold tracking-wide shadow-[0_0_40px_rgba(255,255,255,0.4)] hover:scale-[1.02] transition-transform text-center min-h-[44px] flex items-center justify-center gap-2"
              >
                Založit účet — {trialDaysLabel} zdarma <ArrowRight size={18} />
              </Link>
              <a
                href={DEMO_BOOKING_MAILTO}
                className="w-full sm:w-auto px-10 py-5 border border-white/25 text-white rounded-full text-lg font-bold hover:bg-white/10 transition-colors text-center min-h-[44px] flex items-center justify-center"
              >
                Domluvit demo
              </a>
              <Link
                href="/prihlaseni"
                className="w-full sm:w-auto px-10 py-5 border border-white/20 text-white rounded-full text-lg font-bold hover:bg-white/10 transition-colors text-center min-h-[44px] flex items-center justify-center"
              >
                Přihlásit se
              </Link>
            </div>
            <p className="mt-8 text-slate-500 text-sm max-w-xl mx-auto">
              Na přihlášení zvolte roli poradce nebo klienta. Po skončení trialu zvolíte placený tarif nebo může dojít k omezení funkcí workspace — podrobnosti v FAQ; data standardně nemazeme bez vašeho pokynu.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* --- FOOTER (ROZŠÍŘENÝ O SEO A PRÁVNÍ ODKAZY) --- */}
      <footer className="bg-[#060918] text-slate-500 py-16 px-6 border-t border-white/10">
        <ScrollReveal>
          <div className="max-w-[1400px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
            
            <div className="lg:col-span-2">
              <Link href="/" className="flex items-center gap-3 mb-6">
                <Image
                  src="/logos/Aidvisora%20logo%20new.png"
                  alt="Aidvisora"
                  width={220}
                  height={48}
                  loading="lazy"
                  sizes="(max-width: 768px) 50vw, 220px"
                  className="h-10 w-auto max-w-[220px] object-contain object-left brightness-0 invert"
                />
              </Link>
              <p className="text-sm max-w-sm leading-relaxed mb-6">Pracovní systém pro finanční poradce a týmy. CRM, klientská zóna a workflow na jednom místě.</p>
              <p className="text-xs">
                <a href={`mailto:${LEGAL_PODPORA_EMAIL}`} className="hover:text-white transition-colors">
                  {LEGAL_PODPORA_EMAIL}
                </a>
              </p>
            </div>

            <div>
              <h4 className="text-white font-bold mb-6 font-jakarta text-lg">Produkt</h4>
              <ul className="space-y-4 text-sm">
                <li><Link href="/o-nas" className="hover:text-white transition-colors">O nás</Link></li>
                <li><Link href="/demo" className="hover:text-white transition-colors">Ukázka a demo</Link></li>
                <li><Link href="/pro-brokery" className="hover:text-white transition-colors">Pro brokery a firmy</Link></li>
                <li><a href="#aplikace" className="hover:text-white transition-colors">Vlastnosti CRM</a></li>
                <li><a href="#klientska-zona" className="hover:text-white transition-colors">Klientská zóna</a></li>
                <li><Link href="/prihlaseni" className="hover:text-white transition-colors">Portál Aidvisora</Link></li>
                <li><a href="#ai-asistent" className="hover:text-white transition-colors">AI Asistent</a></li>
                <li>
                  <Link href="/#cenik" className="hover:text-white transition-colors">
                    Ceník a tarify
                  </Link>
                </li>
                <li><a href="#integrace" className="hover:text-white transition-colors">Integrace</a></li>
              </ul>
            </div>

            <div>
               <h4 className="text-white font-bold mb-6 font-jakarta text-lg">Právní a podpora</h4>
               <ul className="space-y-4 text-sm">
                <li><Link href="/bezpecnost" className="hover:text-white transition-colors">Bezpečnost a ochrana dat</Link></li>
                <li><Link href="/terms" className="hover:text-white transition-colors">Obchodní podmínky</Link></li>
                <li><Link href="/privacy" className="hover:text-white transition-colors">Zásady ochrany (GDPR)</Link></li>
                <li>
                  <Link href="/legal/zpracovatelska-smlouva" className="hover:text-white transition-colors">
                    Zpracovatelská smlouva (DPA)
                  </Link>
                </li>
                <li>
                  <Link href="/legal/ai-disclaimer" className="hover:text-white transition-colors">
                    AI režim a disclaimer
                  </Link>
                </li>
                <li><Link href="/subprocessors" className="hover:text-white transition-colors">Subdodavatelé</Link></li>
                <li><Link href="/cookies" className="hover:text-white transition-colors">Cookies</Link></li>
                <li><Link href="/kontakt" className="hover:text-white transition-colors">Kontakt</Link></li>
                <li><Link href="/status" className="hover:text-white transition-colors">Provozní stav</Link></li>
                <li>
                  <a
                    href={`mailto:${LEGAL_PODPORA_EMAIL}?subject=${encodeURIComponent("Onboarding a podpora")}`}
                    className="hover:text-white transition-colors"
                  >
                    Onboarding a technická podpora
                  </a>
                </li>
              </ul>
            </div>

          </div>
          <div className="max-w-[1400px] mx-auto pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-400">
            <p>
              &copy; {new Date().getFullYear()} Aidvisora. Všechna práva vyhrazena.
            </p>
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
        </ScrollReveal>
      </footer>

    </div>
  );
}
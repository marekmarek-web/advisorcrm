"use client";
// @ts-nocheck — komponenta 1:1 z main page.txt (původně JS), typy doplněny později

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  Activity, AlertTriangle, Archive, ArrowRight, ArrowUpRight,
  BarChart3, Bell, Bot, Briefcase, Building, Calculator, Calendar, 
  CalendarDays, Check, CheckCircle2, CheckSquare, ChevronRight, Clock, Combine, 
  Command, Coffee, Download, DownloadCloud, FileDigit, FileSignature, 
  FileText, FileUp, KanbanSquare, Lock, MessageSquare, Moon, Network, 
  PieChart, Play, Quote, Search, Server, Share2, Shield, ShieldCheck, 
  Smartphone, Sparkles, Star, Sun, Sunrise, Sunset, Tags, UploadCloud, 
  User, Users, Zap, Link as LinkIcon, ChevronDown, HelpCircle, Mail,
  Globe, XCircle, CheckCircle, Headset, Timer, LineChart, BookOpen, Database, Plus, Home
} from 'lucide-react';
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";

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
  const ref = useRef(null);

  useEffect(() => {
    if (immediate) {
       const timer = setTimeout(() => setIsVisible(true), delay);
       return () => clearTimeout(timer);
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
    if (ref.current) observer.observe(ref.current);
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
      className={`transition-all duration-1000 ease-out ${className} ${
        isVisible ? 'opacity-100 translate-y-0 translate-x-0 scale-100' : `opacity-0 ${translateClass}`
      }`}
      style={!immediate ? { transitionDelay: `${delay}ms` } : {}}
    >
      {children}
    </div>
  );
};

// --- CUSTOM HOOK & KOMPONENTA PRO 2026 SPOTLIGHT EFEKT ---
const SpotlightCard = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => {
  const divRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setOpacity(1)}
      onMouseLeave={() => setOpacity(0)}
      className={`relative overflow-hidden rounded-[32px] border border-white/10 bg-white/5 transition-colors group ${className}`}
    >
      <div
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300 z-10"
        style={{
          opacity,
          background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, rgba(255,255,255,0.1), transparent 40%)`,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 z-10 rounded-[32px]"
        style={{
          opacity,
          boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.05)`,
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

/** Scénář 1: dokument → další krok (původní interaktivní flow) */
const DocumentScenario = () => {
  const [status, setStatus] = useState("idle");
  const handleDemo = () => {
    setStatus("scanning");
    setTimeout(() => setStatus("result"), 2500);
  };
  return (
    <div className="min-h-[320px] md:min-h-[380px] flex flex-col justify-center relative">
      {status === "idle" && (
        <div className="text-center animate-in fade-in zoom-in duration-300 px-2">
          <div className="w-16 h-16 md:w-20 md:h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 md:mb-6 border border-white/10">
            <FileText size={28} className="text-slate-400" />
          </div>
          <h4 className="text-white font-bold mb-2 text-sm md:text-base">Klient nahraje podklad</h4>
          <p className="text-sm text-slate-400 mb-6 max-w-xs mx-auto">
            Simulace nahrání PDF smlouvy — systém naváže údaje na kartu klienta a navrhne další krok.
          </p>
          <button
            type="button"
            onClick={handleDemo}
            className="min-h-[44px] px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold shadow-lg transition-all active:scale-95 inline-flex items-center gap-2 mx-auto"
          >
            <UploadCloud size={16} /> Nahrát ukázkový dokument
          </button>
        </div>
      )}
      {status === "scanning" && (
        <div className="text-center animate-in fade-in duration-300">
          <div className="w-20 h-20 relative mx-auto mb-6">
            <div className="absolute inset-0 border-4 border-white/10 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin"></div>
            <FileText size={24} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-400" />
          </div>
          <p className="text-sm font-bold text-white">Zpracovávám dokument…</p>
        </div>
      )}
      {status === "result" && (
        <div className="animate-in slide-in-from-bottom-8 fade-in duration-500 px-1">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 mb-4 flex items-start gap-3">
            <CheckCircle2 size={20} className="text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-emerald-300 mb-1">Podklad uložen</p>
              <p className="text-xs text-emerald-400/80">Navrhuji úkol: prověřit mezeru v invaliditě a domluvit doplnění.</p>
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3 text-left text-sm">
            <div className="flex justify-between border-b border-white/10 pb-2">
              <span className="text-xs text-slate-400">Pojistná částka</span>
              <span className="font-bold text-white">2 500 000 Kč</span>
            </div>
            <button
              type="button"
              onClick={() => setStatus("idle")}
              className="w-full min-h-[44px] py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors"
            >
              Zkusit znovu
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/** Scénář 2: posun v pipeline (statická ukázka + stejná animace jako v modulu) */
const PipelineScenario = () => (
  <div className="min-h-[320px] md:min-h-[380px] flex flex-col justify-center px-2">
    <p className="text-center text-sm text-slate-400 mb-4">
      Příležitost přesouváte mezi fázemi — systém drží historii a úkoly u obchodu.
    </p>
    <div className="bg-[#10152e] rounded-2xl p-4 border border-white/10 relative overflow-hidden h-[220px] flex gap-3 max-w-md mx-auto w-full">
      <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
      <div className="w-1/2 flex flex-col gap-2 relative z-10">
        <div className="text-[10px] font-black uppercase text-slate-500">Příprava</div>
        <div className="bg-white/5 border border-white/10 p-3 rounded-xl animate-move-across w-full">
          <div className="flex justify-between mb-1">
            <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">Hypotéka</span>
          </div>
          <div className="text-xs font-bold text-white">Rodina Dvořákova</div>
        </div>
      </div>
      <div className="w-1/2 flex flex-col gap-2 relative z-10 border-l border-white/5 pl-3">
        <div className="text-[10px] font-black uppercase text-slate-500">Podpisy</div>
        <div className="border border-dashed border-indigo-500/40 rounded-xl h-[72px] flex items-center justify-center text-[10px] text-indigo-400 font-bold">
          Cíl
        </div>
      </div>
    </div>
  </div>
);

/** Scénář 3: portál → follow-up */
const PortalScenario = () => {
  const [step, setStep] = useState(0);
  return (
    <div className="min-h-[320px] md:min-h-[380px] flex flex-col justify-center px-2">
      <p className="text-center text-sm text-slate-400 mb-4">
        Klient zadá požadavek v portálu — u vás vznikne notifikace a úkol.
      </p>
      <div className="bg-[#f8fafc] rounded-2xl border border-slate-200 p-4 max-w-sm mx-auto w-full">
        <div className="h-10 bg-white border-b border-slate-200 rounded-t-lg flex items-center px-3 mb-3">
          <span className="font-bold text-indigo-600 text-sm">Klientský portál</span>
        </div>
        {step === 0 ? (
          <button
            type="button"
            onClick={() => setStep(1)}
            className="w-full min-h-[44px] py-3 bg-indigo-600 text-white rounded-lg text-sm font-bold"
          >
            Odeslat požadavek (nová hypotéka)
          </button>
        ) : (
          <div className="space-y-3 animate-in fade-in">
            <div className="bg-slate-900 text-white p-3 rounded-xl flex items-center gap-2 text-xs">
              <Bell size={16} className="text-amber-400 shrink-0" />
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Nový úkol</p>
                <p className="font-bold">Klient žádá o hypotéku — zavolejte do 24 h</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setStep(0)}
              className="text-xs text-indigo-600 font-bold underline min-h-[44px] py-2"
            >
              Zkusit znovu
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const WORKFLOW_DEMO_TABS = [
  { id: "doc", label: "Dokument → další krok" },
  { id: "pipe", label: "Obchod v pipeline" },
  { id: "portal", label: "Portál → follow-up" },
] as const;

const WorkflowDemo = () => {
  const [tab, setTab] = useState(0);
  return (
    <div className="max-w-[520px] mx-auto bg-[#060918]/80 backdrop-blur-xl rounded-[32px] border border-white/10 shadow-[0_0_50px_rgba(99,102,241,0.12)] p-4 md:p-6 relative overflow-hidden flex flex-col">
      <div className="flex flex-wrap justify-center gap-2 mb-4 pb-4 border-b border-white/10">
        {WORKFLOW_DEMO_TABS.map((t, i) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(i)}
            className={`min-h-[44px] px-3 py-2 rounded-xl text-xs md:text-sm font-bold transition-colors ${
              tab === i ? "bg-indigo-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 0 && <DocumentScenario />}
      {tab === 1 && <PipelineScenario />}
      {tab === 2 && <PortalScenario />}
    </div>
  );
};

// --- INTERAKTIVNÍ MINI-MINDMAP KOMPONENTA (Světlé pozadí s možností úprav a přidávání) ---
const InteractiveMindmap = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState([
    { id: 'core', x: 40, y: 140, label: 'Nová mapa', subtitle: 'Libovolná mapa', type: 'core' },
    { id: 'n1', x: 300, y: 60, label: 'Nová kategorie', type: 'category' },
    { id: 'n2', x: 300, y: 220, label: 'Nová položka', subtitle: '0 Kč', type: 'item' }
  ]);
  const [edges, setEdges] = useState([
    { source: 'core', target: 'n1' },
    { source: 'core', target: 'n2' }
  ]);
  const [addedCount, setAddedCount] = useState(0);
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    // Ignorovat, pokud uživatel kliká do inputu (aby mohl přejmenovat uzly)
    const target = e.target as HTMLElement;
    if (target.tagName?.toLowerCase() === 'input' || target.tagName?.toLowerCase() === 'button') {
      return;
    }
    
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    setDragging({ id, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - dragging.offsetX;
    const y = e.clientY - rect.top - dragging.offsetY;

    // Omezení hranic, aby uzly nevyjely z plátna
    const boundedX = Math.max(10, Math.min(x, rect.width - 200));
    const boundedY = Math.max(10, Math.min(y, rect.height - 80));

    setNodes(nodes.map(n => n.id === dragging.id ? { ...n, x: boundedX, y: boundedY } : n));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(null);
  };

  // Přidání nového uzlu (limitováno na 2 navíc)
  const handleAddNode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (addedCount >= 2) return;
    
    const newNodeId = `new-${Date.now()}`;
    setNodes([...nodes, {
      id: newNodeId,
      x: 300,
      y: 140 + (addedCount * 80),
      label: 'Další položka',
      type: 'category'
    }]);
    setEdges([...edges, { source: 'core', target: newNodeId }]);
    setAddedCount(prev => prev + 1);
  };

  // Přejmenování uzlu v reálném čase
  const handleLabelChange = (id: string, newLabel: string) => {
    setNodes(nodes.map(n => n.id === id ? { ...n, label: newLabel } : n));
  };

  return (
    <div ref={containerRef} className="absolute inset-0 z-10" onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
       <svg className="absolute inset-0 w-full h-full pointer-events-none">
         {edges.map(edge => {
            const source = nodes.find(n => n.id === edge.source);
            const target = nodes.find(n => n.id === edge.target);
            if (!source || !target) return null;

            // Výpočet křivek spojení
            const sCX = source.x + (source.type === 'core' ? 180 : 150); 
            const sCY = source.y + 40;
            const tCX = target.x;
            const tCY = target.y + 30;

            return (
              <path 
                key={`edge-${edge.source}-${edge.target}`} 
                d={`M ${sCX} ${sCY} Q ${(sCX+tCX)/2} ${sCY} ${tCX} ${tCY}`} 
                fill="none" 
                stroke="#cbd5e1" 
                strokeWidth="2" 
                className="transition-all duration-75"
              />
            )
         })}
       </svg>
       {nodes.map(n => {
         const isCore = n.type === 'core';
         const isItem = n.type === 'item';
         
         return (
           <div 
              key={n.id} 
              onPointerDown={(e) => handlePointerDown(e, n.id)} 
              style={{ left: n.x, top: n.y }} 
              className={`absolute flex flex-col justify-center rounded-[20px] shadow-lg transition-shadow duration-200
                ${dragging?.id === n.id ? 'shadow-2xl cursor-grabbing z-50 ring-2 ring-indigo-300' : 'cursor-grab z-10 hover:shadow-xl'}
                ${isCore ? 'bg-[#1a1c2e] text-white w-48 py-4 px-5' : 
                  isItem ? 'bg-white border-2 border-dashed border-slate-300 text-slate-800 w-44 py-3 px-4' : 
                  'bg-white border border-slate-200 text-slate-800 w-44 py-3 px-4'}
              `}
           >
             {/* Tlačítko pro přidání (Viditelné jen na Jádru) */}
             {isCore && (
               <div className="absolute -right-4 top-1/2 -translate-y-1/2">
                 <button 
                    onClick={handleAddNode}
                    disabled={addedCount >= 2}
                    className="w-8 h-8 bg-indigo-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-indigo-400 hover:scale-110 disabled:opacity-0 disabled:scale-0 transition-all duration-300"
                    title={addedCount >= 2 ? "Maximum" : "Přidat uzel"}
                  >
                   <Plus size={16} strokeWidth={3} />
                 </button>
               </div>
             )}
             
             {isCore && (
               <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center mb-3 shadow-inner">
                 <User size={20} className="text-white" />
               </div>
             )}
             {!isCore && !isItem && (
                <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center mb-2">
                  <FileText size={16} className="text-indigo-600" />
                </div>
             )}

             {/* Interaktivní Input pro název */}
             <input 
                type="text" 
                value={n.label} 
                onChange={(e) => handleLabelChange(n.id, e.target.value)}
                className={`w-full bg-transparent border-none outline-none font-black text-[15px] p-0 rounded-sm focus:ring-2 focus:ring-indigo-400/50
                  ${isCore ? 'text-white' : 'text-slate-800'}
                `}
             />
             
             {n.subtitle && (
               <div className={`text-xs mt-1 font-medium ${isCore ? 'text-slate-400' : 'text-emerald-500'}`}>
                 {n.subtitle}
               </div>
             )}
           </div>
         );
       })}
       <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
         <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold bg-white/80 px-3 py-1 rounded-full backdrop-blur-sm shadow-sm">
           Přetahujte a editujte uzly
         </span>
       </div>
    </div>
  );
};

// --- MOCK DATA REVIEWS (Pro nekonečný pás) ---
const REVIEWS = [
  { id: 1, text: "Konečně mám klienty, úkoly a dokumenty na jednom místě — ne v pěti Excelech a chatech.", author: "Martin Dvořák", role: "Finanční poradce", initials: "MD" },
  { id: 2, text: "Sběr podkladů přes portál nám ušetřil spoustu e-mailů a telefonátů. Klient ví, kam má nahrát OP.", author: "Lucie Černá", role: "Týmová manažerka", initials: "LČ" },
  { id: 3, text: "Pipeline vidím na první pohled. Už se mi nestává, že mi obchod „vyšuměl“ někde mezi schůzkou a podpisem.", author: "Petr Nový", role: "Wealth Manager", initials: "PN" },
  { id: 4, text: "Přestal jsem lovit soubory v mailu. U klienta je historie a podklady pořád po ruce.", author: "Jana Malá", role: "Nezávislá poradkyně", initials: "JM" },
  { id: 5, text: "Jako manažer potřebuji vidět aktivitu týmu, ne jen měsíční Excel. Tady mám přehled bez ručního skládání.", author: "Karel Svoboda", role: "Ředitel pobočky", initials: "KS" },
];

const FAQS = [
  { id: 1, q: "Je Aidvisora jen CRM?", a: "Ne. Je to pracovní systém: klient, dokumenty, úkoly, portál a obchodní tok jsou propojené. CRM je jen jedna část." },
  { id: 2, q: "Co když máme data v Excelu nebo jinde?", a: "Základní import zvládnete z Excelu nebo CSV. Pomůžeme s napárováním a přechodem, abyste nestrávili týdny přepisováním." },
  { id: 3, q: "Jak to vnímá klient?", a: "Dostane jednoduchý portál pro požadavky a podklady. Vy řešíte věci v systému — působí to srozumitelně a profesionálně." },
  { id: 4, q: "Kde je umělá inteligence?", a: "Jako pomocník: například u práce s dokumenty nebo návrhu dalšího kroku. Rozhodnutí a odpovědnost jsou vždy u poradce." },
  { id: 5, q: "Je to pro tým i pro jednotlivce?", a: "Ano. Samostatný poradce získá pořádek v jedné aplikaci, tým sdílená data a role." },
  { id: 6, q: "Kde běží data?", a: "V bezpečném prostředí v EU. Můžete pracovat s exporty, souhlasy a auditní stopou podle potřeby vaší praxe." },
  { id: 7, q: "Jak rychle začnu?", a: "Účet založíte za pár minut. U týmů záleží na importu a nastavení rolí — postupně vás provedeme." },
  { id: 8, q: "Jde to napojit na kalendář?", a: "Ano, Google Kalendář je klíčové napojení pro schůzky a termíny. Další integrace rozšiřujeme podle zpětné vazby." },
];

export default function PremiumLandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [isAnnualPricing, setIsAnnualPricing] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err === "auth_error" || err === "database_error") {
      window.location.replace(`/prihlaseni?error=${encodeURIComponent(err)}`);
    }
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0f29] font-inter text-slate-300 selection:bg-indigo-500 selection:text-white overflow-x-hidden relative">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@500;700;800&display=swap');
        .font-inter { font-family: 'Inter', sans-serif; }
        .font-jakarta { font-family: 'Plus Jakarta Sans', sans-serif; }
        
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

        .text-glow-shimmer {
          background: linear-gradient(to right, #a855f7 0%, #818cf8 25%, #e879f9 50%, #818cf8 75%, #a855f7 100%);
          background-size: 200% auto;
          color: transparent;
          -webkit-background-clip: text;
          background-clip: text;
          animation: shimmer 4s linear infinite;
          text-shadow: 0 0 30px rgba(168, 85, 247, 0.4);
        }
        @keyframes shimmer { to { background-position: 200% center; } }

        /* Nekonečný pás recenzí (Marquee) */
        @keyframes scroll-x {
          0% { transform: translateX(0); }
          100% { transform: translateX(calc(-350px * 5 - 24px * 5)); } 
        }
        .animate-marquee {
          display: flex;
          width: max-content;
          animation: scroll-x 40s linear infinite;
        }
        .animate-marquee:hover {
          animation-play-state: paused;
        }

        /* OPRAVA: Shimmer okraj pro balíček Pro (Korektní použití Wrapperu) */
        .pro-pricing-wrapper {
          position: relative;
          border-radius: 34px;
          padding: 3px;
          background: linear-gradient(to bottom, #4f46e5, #9333ea);
          overflow: hidden;
        }
        .pro-pricing-wrapper::before {
          content: '';
          position: absolute;
          inset: -50%;
          background: conic-gradient(from 0deg, transparent, #ec4899, #8b5cf6, transparent 50%);
          animation: spin-gradient 4s linear infinite;
          z-index: 0;
        }
        .pro-pricing-inner {
          position: relative;
          background: #0a0f29;
          border-radius: 31px;
          z-index: 1;
          height: 100%;
        }
        @keyframes spin-gradient { 100% { transform: rotate(360deg); } }

        /* Kalkulačka Sliders */
        input[type=range].modern-slider { -webkit-appearance: none; width: 100%; background: transparent; height: 6px; border-radius: 3px; cursor: pointer; outline: none; }
        input[type=range].modern-slider::-webkit-slider-runnable-track { width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; }
        input[type=range].modern-slider::-webkit-slider-thumb { -webkit-appearance: none; height: 20px; width: 20px; border-radius: 50%; background: #10b981; margin-top: -7px; box-shadow: 0 0 10px rgba(16,185,129,0.5); transition: transform 0.1s; }
        input[type=range].modern-slider::-webkit-slider-thumb:hover { transform: scale(1.2); }

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
        }

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
        }

        /* Notifikace */
        @keyframes notification-float {
          0%, 100% { transform: translateY(20px); opacity: 0; }
          10%, 40% { transform: translateY(0); opacity: 0.9; }
          50%, 99% { transform: translateY(-20px); opacity: 0; }
        }
        .anim-notif-1 { animation: notification-float 16s cubic-bezier(0.4, 0, 0.2, 1) infinite; animation-delay: 0s; }
        .anim-notif-2 { animation: notification-float 16s cubic-bezier(0.4, 0, 0.2, 1) infinite; animation-delay: 4s; }
        .anim-notif-3 { animation: notification-float 16s cubic-bezier(0.4, 0, 0.2, 1) infinite; animation-delay: 8s; }
        .anim-notif-4 { animation: notification-float 16s cubic-bezier(0.4, 0, 0.2, 1) infinite; animation-delay: 12s; }

        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hero-anim { opacity: 0; animation: slideUpFade 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .delay-100 { animation-delay: 100ms; }
        .delay-200 { animation-delay: 200ms; }
        .delay-300 { animation-delay: 300ms; }
        .delay-400 { animation-delay: 400ms; }

        /* PIPELINE ANIMACE (Bez překrývání) */
        @keyframes moveCardAcross {
          0%, 15% { transform: translate(0, 0) scale(1); opacity: 1; z-index: 20; }
          25% { transform: translate(10px, -10px) scale(1.05) rotate(3deg); opacity: 1; z-index: 30; }
          50% { transform: translate(calc(100% + 1rem), 0) scale(1.05) rotate(0deg); opacity: 1; z-index: 30; }
          60%, 80% { transform: translate(calc(100% + 1rem), 0) scale(1); opacity: 1; z-index: 20; }
          90%, 100% { transform: translate(calc(100% + 1rem), 0) scale(1); opacity: 0; z-index: 10; }
        }
        .animate-move-across {
          animation: moveCardAcross 6s ease-in-out infinite;
        }
      `}</style>

      {/* --- FIXNÍ NAVIGACE --- */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "glass-nav py-4 shadow-2xl shadow-black/50" : "bg-transparent py-6"}`}>
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 cursor-pointer group">
            <img src="/Aidvisora logo A.png" alt="" className="h-10 w-10 object-contain shrink-0 brightness-0 invert" aria-hidden />
            <span className="font-jakarta font-bold text-2xl tracking-tight text-white hidden sm:inline">Aidvisora</span>
          </Link>

          <div className="hidden lg:flex items-center gap-6 xl:gap-8 font-inter font-medium text-sm text-slate-400">
            <a href="#hlavni-workflow" className="hover:text-white transition-colors">Workflow</a>
            <a href="#demo-video" className="hover:text-white transition-colors">Demo</a>
            <a href="#moduly" className="hover:text-white transition-colors">Moduly</a>
            <a href="#pro-koho" className="hover:text-white transition-colors">Pro koho</a>
            <a href="#cenik" className="hover:text-white transition-colors">Ceník</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </div>

          <div className="flex items-center gap-3 sm:gap-6">
            <Link
              href="/prihlaseni"
              className="px-6 py-2.5 bg-white text-[#0a0f29] rounded-full text-sm font-bold hover:bg-slate-200 transition-all hover:scale-105 shadow-[0_0_20px_rgba(255,255,255,0.15)] flex items-center gap-2 min-h-[44px]"
            >
              Portál Aidvisora <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </nav>

      {/* --- HERO SEKCE --- */}
      <section className="relative pt-32 pb-16 md:pt-40 md:pb-24 px-6 overflow-hidden min-h-[85vh] flex flex-col justify-center">
        <div className="absolute inset-0 bg-grid-pattern z-0 opacity-40"></div>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-indigo-600/30 rounded-full blur-[150px] pointer-events-none z-0"></div>

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

              <h1 className="hero-anim delay-100 font-jakarta text-4xl sm:text-5xl md:text-6xl lg:text-[3.25rem] xl:text-7xl font-extrabold tracking-tight text-white leading-[1.1] mb-6">
                Přestaňte řídit poradenství přes Excel, e-mail a WhatsApp.
              </h1>

              <p className="hero-anim delay-200 font-inter text-lg md:text-xl text-slate-400 max-w-2xl mb-8 leading-relaxed lg:mx-0 mx-auto">
                Mějte klienty, podklady, úkoly a obchody přehledně na jednom místě. Aidvisora spojuje CRM, klientský portál, dokumenty, follow-upy a obchodní workflow do jednoho systému pro finanční poradce a týmy.
              </p>

              <div className="hero-anim delay-300 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 mb-4 lg:justify-start justify-center">
                <Link
                  href="/prihlaseni?register=1"
                  className="w-full sm:w-auto px-8 py-4 bg-white text-[#0a0f29] rounded-full text-base font-bold tracking-wide hover:bg-slate-200 transition-all hover:scale-[1.02] shadow-[0_0_30px_rgba(255,255,255,0.2)] text-center min-h-[44px] flex items-center justify-center"
                >
                  Vyzkoušet zdarma
                </Link>
                <a
                  href="#demo-video"
                  className="w-full sm:w-auto px-8 py-4 bg-white/5 text-white border border-white/10 rounded-full text-base font-bold tracking-wide hover:bg-white/10 transition-all flex items-center justify-center gap-2 backdrop-blur-md min-h-[44px]"
                >
                  <Play size={18} className="shrink-0" />
                  Podívat se na 2min demo
                </a>
              </div>
              <p className="hero-anim delay-300 text-xs text-slate-500 mb-6 lg:text-left text-center">14 dní na vyzkoušení. Bez závazků.</p>
              <p className="hero-anim delay-300 text-sm text-slate-400 mb-6 lg:text-left text-center">
                <a href="#ukazka-workflow" className="text-indigo-300 hover:text-white underline underline-offset-4 font-medium min-h-[44px] inline-flex items-center">
                  Projít si ukázku workflow
                </a>
              </p>

              <p className="hero-anim delay-400 text-sm md:text-base text-slate-400 max-w-xl border-t border-white/10 pt-6 lg:text-left text-center lg:mx-0 mx-auto">
                Méně chaosu v podkladech. Více dotažených obchodů. Profesionální servis pro klienta.
              </p>
            </div>

            <div className="hero-anim delay-200 flex-1 w-full max-w-xl mx-auto lg:mx-0 mt-12 lg:mt-0">
              <div className="relative rounded-[24px] md:rounded-[32px] border border-white/10 bg-[#060918]/80 shadow-[0_0_60px_rgba(99,102,241,0.2)] overflow-hidden aspect-video flex flex-col items-center justify-center p-6 md:p-8">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/20 to-transparent pointer-events-none"></div>
                <div className="relative z-10 text-center">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4 border border-white/10">
                    <Play size={32} className="text-white ml-1" />
                  </div>
                  <p className="text-white font-jakarta font-bold text-sm md:text-base mb-1">Hlavní workflow v aplikaci</p>
                  <p className="text-xs text-slate-400 mb-6 max-w-[240px] mx-auto">Místo pro krátké demo video (45–75 s). Nahrajte odkaz přes proměnnou prostředí.</p>
                  {DEMO_VIDEO_URL ? (
                    <a
                      href={DEMO_VIDEO_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[44px] items-center justify-center px-6 py-3 rounded-full text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-500 transition-all"
                    >
                      Přehrát demo
                    </a>
                  ) : (
                    <a
                      href="#demo-video"
                      className="inline-flex min-h-[44px] items-center justify-center px-6 py-3 rounded-full text-sm font-bold bg-white/10 text-white hover:bg-white/20 transition-all"
                    >
                      Ukázka videa níže
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- 3 BOLESTI --- */}
      <section id="bolesti" className="py-20 md:py-28 relative bg-[#0a0f29] border-t border-white/5">
        <div className="max-w-[1100px] mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-14">
              <h2 className="font-jakarta text-3xl md:text-5xl font-bold text-white mb-4 tracking-tight">
                Co v praxi nejvíc ubíjí čas i obchod
              </h2>
              <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                Většina poradců to zná: data v tabulkách a IK přehledech, dokumenty v e-mailu a chatu, follow-upy na papírku.
              </p>
            </div>
          </ScrollReveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: "Roztříštěná data",
                body: "Klienti a historie jsou v Excelu, poznámkách a WhatsAppu — nikdo nemá jednu pravdu.",
                icon: Database,
              },
              {
                title: "Podklady a dokumenty",
                body: "Soubory lítají mailem, chybí verze a hned po schůzce znovu sháníte totéž.",
                icon: FileUp,
              },
              {
                title: "Úkoly a obchod",
                body: "Pipeline je v hlavě, follow-upy padají a klient má pocit, že „se to zase ztratilo“.",
                icon: KanbanSquare,
              },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <ScrollReveal key={card.title}>
                  <div className="h-full rounded-[24px] border border-white/10 bg-white/5 p-6 md:p-8 flex flex-col">
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center mb-4 border border-indigo-500/30">
                      <Icon size={24} />
                    </div>
                    <h3 className="font-jakarta text-xl font-bold text-white mb-2">{card.title}</h3>
                    <p className="text-slate-400 text-sm leading-relaxed flex-1">{card.body}</p>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* --- HLAVNÍ WORKFLOW (4 kroky) --- */}
      <section id="hlavni-workflow" className="py-20 md:py-28 relative bg-[#060918] border-t border-white/10">
        <div className="max-w-[1100px] mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-14">
              <h2 className="font-jakarta text-3xl md:text-5xl font-bold text-white mb-4">
                Od požadavku nebo dokumentu k dotaženému obchodu
              </h2>
              <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                Jeden tok místo pěti nástrojů. Bez přepisování mezi systémy.
              </p>
            </div>
          </ScrollReveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                step: "1",
                title: "Klient nebo podklad",
                desc: "Požadavek z portálu nebo nahrání dokumentu — vše se váže ke kartě klienta.",
                icon: FileText,
              },
              {
                step: "2",
                title: "Přehled a úkol",
                desc: "Vidíte souvislosti, termíny a co je blokované. Vznikne jasný další krok.",
                icon: CheckSquare,
              },
              {
                step: "3",
                title: "Obchod v pipeline",
                desc: "Příležitost držíte v řádu od přípravy po podpis — nic nezůstane „někde bokem“.",
                icon: KanbanSquare,
              },
              {
                step: "4",
                title: "Servis a komunikace",
                desc: "Klient má srozumitelné rozhraní, vy máte historii a kontrolu — působíte spolehlivě.",
                icon: Headset,
              },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <ScrollReveal key={s.step}>
                  <div className="relative rounded-[24px] border border-white/10 bg-[#0a0f29]/80 p-6 h-full flex flex-col">
                    <span className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-2">Krok {s.step}</span>
                    <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-indigo-300 mb-3">
                      <Icon size={20} />
                    </div>
                    <h3 className="font-jakarta font-bold text-white text-lg mb-2">{s.title}</h3>
                    <p className="text-slate-400 text-sm leading-relaxed">{s.desc}</p>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* --- DEMO VIDEO --- */}
      <section id="demo-video" className="py-20 md:py-28 relative bg-[#0a0f29] border-t border-white/5">
        <div className="max-w-[900px] mx-auto px-6 text-center">
          <ScrollReveal>
            <h2 className="font-jakarta text-3xl md:text-5xl font-bold text-white mb-4">Krátké demo (cca 1 minuta)</h2>
            <p className="text-lg text-slate-400 mb-10 max-w-2xl mx-auto">
              Jak vypadá běžná práce v Aidvisoře — klient, dokumenty, úkoly a obchod.
            </p>
          </ScrollReveal>
          <ScrollReveal delay={100}>
            <div className="relative w-full aspect-video rounded-[24px] overflow-hidden border border-white/10 bg-black/40 shadow-[0_0_60px_rgba(99,102,241,0.15)]">
              {DEMO_VIDEO_URL ? (
                <iframe
                  title="Demo Aidvisora"
                  src={DEMO_VIDEO_URL}
                  className="absolute inset-0 w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-gradient-to-br from-[#060918] to-[#0a0f29]">
                  <Play size={48} className="text-white/80 mb-4" />
                  <p className="text-slate-400 text-sm mb-6 max-w-md">
                    Sem vložte URL videa (např. YouTube embed nebo soubor). Nastavte proměnnou{" "}
                    <code className="text-indigo-300 text-xs">NEXT_PUBLIC_LANDING_DEMO_VIDEO_URL</code>.
                  </p>
                  <span className="inline-flex min-h-[44px] items-center px-6 py-3 rounded-full bg-white/10 text-white text-sm font-bold">
                    Přehrát demo
                  </span>
                </div>
              )}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* --- INTERAKTIVNÍ UKÁZKA --- */}
      <section id="ukazka-workflow" className="py-20 md:py-28 relative bg-[#060918] border-t border-white/10">
        <div className="max-w-[1100px] mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-12">
              <h2 className="font-jakarta text-3xl md:text-5xl font-bold text-white mb-4">Vyzkoušejte si tři situace z praxe</h2>
              <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                Ne celý systém — jen to, co denně bolí nejvíc.
              </p>
            </div>
          </ScrollReveal>
          <WorkflowDemo />
        </div>
      </section>

      {/* --- PROČ AIDVISORA --- */}
      <section id="proc-aidvisora" className="py-20 md:py-28 relative bg-[#0a0f29] border-t border-white/5">
        <div className="max-w-[1100px] mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-14">
              <h2 className="font-jakarta text-3xl md:text-5xl font-bold text-white mb-4">Proč to dává smysl</h2>
            </div>
          </ScrollReveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              {
                title: "Jeden přehled o klientovi",
                desc: "Kontakt, domácnost, dokumenty a stav obchodu na jedné kartě.",
                icon: User,
              },
              {
                title: "Méně ruční administrativy",
                desc: "Méně hledání v mailech a tabulkách, více času na schůzky a doporučení.",
                icon: Clock,
              },
              {
                title: "Dotahování obchodu",
                desc: "Follow-upy a fáze pipeline jsou vidět — nejen „evidence kontaktu“.",
                icon: BarChart3,
              },
              {
                title: "Lepší dojem u klienta",
                desc: "Portál a struktura komunikace působí jako u pořádné firmy, ne jako chaotický inbox.",
                icon: Star,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <ScrollReveal key={item.title}>
                  <div className="flex gap-4 p-6 rounded-[24px] border border-white/10 bg-white/5 h-full">
                    <div className="shrink-0 w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-300">
                      <Icon size={22} />
                    </div>
                    <div>
                      <h3 className="font-jakarta font-bold text-white text-lg mb-1">{item.title}</h3>
                      <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* --- MODULY (KOMPAKTNÍ + VÝBRANÉ VIZUÁLY) --- */}
      <section id="moduly" className="py-32 relative bg-[#060918]">
        <div className="max-w-[1400px] mx-auto px-6 space-y-24 md:space-y-32 border-t border-white/10 pt-20">
          
          <ScrollReveal>
            <div className="text-center mb-16">
              <h2 className="font-jakarta text-3xl md:text-5xl font-bold text-white mb-4">Co všechno v systému je</h2>
              <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                Moduly na jednom místě — bez skákání mezi tabulkami, e-mailem a poznámkami. Níže si můžete rozkliknout dva typické pohledy a dole najdete pokročilejší nástroje.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { t: "Klienti a domácnosti", d: "Kmen, vztahy a situace na jednom místě.", i: Users },
              { t: "Dokumenty a podklady", d: "Ukládání, stav a návaznost na úkoly.", i: FileText },
              { t: "Úkoly a follow-upy", d: "Co je dnes důležité a co po termínu.", i: CheckSquare },
              { t: "Obchodní pipeline", d: "Od první poptávky po podpis.", i: KanbanSquare },
              { t: "Klientský portál", d: "Požadavky a podklady bez e-mailového ping-pongu.", i: Smartphone },
              { t: "Schůzky a kalendář", d: "Termíny napojené na práci s klientem.", i: CalendarDays },
              { t: "Kalkulačky a výstupy", d: "Čísla a reporty pro schůzku — bez přepisování do zvláštních souborů.", i: Calculator },
              { t: "Tým a role", d: "Společná data a role — když pracujete ve více lidech.", i: Building },
            ].map((m) => {
              const I = m.i;
              return (
                <ScrollReveal key={m.t}>
                  <div className="h-full rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col gap-2">
                    <div className="w-10 h-10 rounded-lg bg-indigo-500/15 flex items-center justify-center text-indigo-300">
                      <I size={20} />
                    </div>
                    <h3 className="font-jakarta font-bold text-white text-sm">{m.t}</h3>
                    <p className="text-slate-400 text-xs leading-relaxed">{m.d}</p>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>

          {/* 1. KALENDÁŘ A ÚKOLY */}
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <ScrollReveal className="lg:w-1/2 space-y-6" direction="right">
              <div className="w-14 h-14 bg-indigo-500/20 text-indigo-400 rounded-2xl flex items-center justify-center mb-6 border border-indigo-500/30"><CalendarDays size={28}/></div>
              <h3 className="font-jakarta text-4xl font-bold text-white leading-tight">Kalendář a úkoly na jednom místě.</h3>
              <p className="text-lg text-slate-400 leading-relaxed">
                Kalendář s týdenní mřížkou a boční agendou: schůzky, úkoly a připomínky u klienta na jednom pohledu. Synchronizace s Google Kalendářem.
              </p>
              <ul className="space-y-3 pt-4">
                <li className="flex items-center gap-3 text-slate-300"><CheckCircle2 size={18} className="text-indigo-500"/> Obousměrná synchronizace (Google, MS)</li>
                <li className="flex items-center gap-3 text-slate-300"><CheckCircle2 size={18} className="text-indigo-500"/> Postranní panel s nevyřešenými úkoly</li>
                <li className="flex items-center gap-3 text-slate-300"><CheckCircle2 size={18} className="text-indigo-500"/> Snadné plánování schůzek s klienty</li>
              </ul>
            </ScrollReveal>
            
            <ScrollReveal className="lg:w-1/2 w-full" direction="left">
              <div className="bg-[#f8fafc] rounded-[24px] border border-white/10 shadow-[0_0_50px_rgba(99,102,241,0.15)] relative overflow-hidden h-[400px] flex flex-col">
                <div className="bg-white border-b border-slate-200 p-4 flex items-center justify-between">
                  <span className="font-bold text-slate-800">Březen 2026</span>
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
                {/* Sloupec 2: Podpisy */}
                <div className="w-1/2 h-full flex flex-col gap-4 relative z-10 border-l border-white/5 pl-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Podpisy</div>
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
                Nenechte žádný obchod vychladnout. Přesouvejte klienty z Přípravy rovnou k Podpisu. Systém vás sám upozorní na blokátory nebo úkoly po termínu.
              </p>
            </ScrollReveal>
          </div>

          <div className="pt-12 border-t border-white/10">
            <ScrollReveal>
              <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-10">
                Doplňkové nástroje pro hlubší práci
              </p>
            </ScrollReveal>
            <div className="grid lg:grid-cols-2 gap-12 items-start">
              <div className="flex flex-col lg:flex-row items-start gap-8">
                <ScrollReveal className="lg:w-2/5 space-y-4 w-full">
                  <div className="w-12 h-12 bg-orange-500/20 text-orange-400 rounded-2xl flex items-center justify-center border border-orange-500/30">
                    <Network size={24} />
                  </div>
                  <h3 className="font-jakarta text-2xl font-bold text-white leading-tight">Mindmapa portfolia</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Přehled rodiny a produktů na plátně — doplňuje kartu klienta, nenahrazuje ji.
                  </p>
                </ScrollReveal>
                <ScrollReveal className="flex-1 w-full min-h-[280px]">
                  <div className="bg-[#f8fafc] rounded-[24px] border border-slate-200 relative overflow-hidden h-[280px] lg:h-[320px]">
                    <div className="absolute inset-0 mindmap-dots pointer-events-none"></div>
                    <InteractiveMindmap />
                  </div>
                </ScrollReveal>
              </div>
              <div className="flex flex-col lg:flex-row items-start gap-8">
                <ScrollReveal className="lg:w-2/5 space-y-4 w-full">
                  <div className="w-12 h-12 bg-purple-500/20 text-purple-400 rounded-2xl flex items-center justify-center border border-purple-500/30">
                    <Users size={24} />
                  </div>
                  <h3 className="font-jakarta text-2xl font-bold text-white leading-tight">Přehled pro vedení týmu</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Aktivita, schůzky a produkce — když potřebujete řídit více lidí v jedné firmě.
                  </p>
                </ScrollReveal>
                <ScrollReveal className="flex-1 w-full">
                  <div className="bg-[#f8fafc] rounded-[24px] border border-white/10 relative overflow-hidden min-h-[280px] p-5 flex flex-col gap-3">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                      <h4 className="font-bold text-slate-800 text-sm">Týmový přehled</h4>
                      <div className="text-xs bg-white border border-slate-200 px-2 py-1 rounded-lg text-slate-600 font-bold">Měsíc</div>
                    </div>
                    <div className="flex items-end gap-2 h-20 pt-2 border-b border-slate-200">
                      <div className="w-1/5 bg-slate-200 h-[30%] rounded-t-sm"></div>
                      <div className="w-1/5 bg-slate-200 h-[60%] rounded-t-sm"></div>
                      <div className="w-1/5 bg-slate-200 h-[40%] rounded-t-sm"></div>
                      <div className="w-1/5 bg-indigo-400 h-[90%] rounded-t-sm"></div>
                      <div className="w-1/5 bg-slate-200 h-[50%] rounded-t-sm"></div>
                    </div>
                    <div className="bg-indigo-600/90 text-white p-3 rounded-xl text-xs font-bold flex items-center gap-2">
                      <BarChart3 size={16} /> Souhrn produkce a schůzek za tým
                    </div>
                    <div className="bg-red-50 border border-red-100 p-3 rounded-xl flex items-center gap-2 text-xs text-red-800">
                      <AlertTriangle size={14} className="text-red-500 shrink-0" />
                      <span>
                        <strong>Jan Svoboda:</strong> bez schůzky 14 dní
                      </span>
                    </div>
                  </div>
                </ScrollReveal>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* --- PRO KOHO JE AIDVISORA (Cílové skupiny) --- */}
      <section id="pro-koho" className="py-32 relative bg-[#060918]">
        <div className="max-w-[1400px] mx-auto px-6 border-t border-white/10 pt-20">
          <ScrollReveal>
            <div className="text-center mb-16">
              <h2 className="font-jakarta text-3xl md:text-5xl font-bold text-white mb-4">Pro koho je Aidvisora</h2>
              <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                Od samostatného poradce po broker pool — stejný princip: pořádek u klienta, obchodu a podkladů.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <ScrollReveal delay={100}>
              <SpotlightCard className="p-8 h-full flex flex-col">
                <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-400 mb-6"><User size={24}/></div>
                <h3 className="font-jakarta text-2xl font-bold text-white mb-2">Samostatný poradce</h3>
                <p className="text-slate-400 mb-6 leading-relaxed">Když máte klienty v tabulce, maily a hlavě zároveň, je čas dát tomu jeden systém.</p>
                <div className="mt-auto p-4 bg-white/5 rounded-2xl border border-white/10">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1 block">Nejvíc používáte</span>
                  <p className="text-sm text-slate-300 font-medium"><strong className="text-white">Pipeline</strong>, <strong className="text-white">portál</strong> a <strong className="text-white">dokumenty</strong> u klienta.</p>
                </div>
              </SpotlightCard>
            </ScrollReveal>

            <ScrollReveal delay={200}>
              <SpotlightCard className="p-8 h-full flex flex-col">
                <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center text-purple-400 mb-6"><Users size={24}/></div>
                <h3 className="font-jakarta text-2xl font-bold text-white mb-2">Tým / Manažer</h3>
                <p className="text-slate-400 mb-6 leading-relaxed">Potřebujete vidět aktivitu a obchody bez skládání reportů z Excelu každý měsíc znovu.</p>
                <div className="mt-auto p-4 bg-white/5 rounded-2xl border border-white/10">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1 block">Nejvíc používáte</span>
                  <p className="text-sm text-slate-300 font-medium">Sdílené pohledy, <strong className="text-white">přehled schůzek a produkce</strong> v kontextu týmu.</p>
                </div>
              </SpotlightCard>
            </ScrollReveal>

            <ScrollReveal delay={300}>
              <SpotlightCard className="p-8 h-full flex flex-col">
                <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center text-amber-400 mb-6"><CheckSquare size={24}/></div>
                <h3 className="font-jakarta text-2xl font-bold text-white mb-2">Asistentka / Backoffice</h3>
                <p className="text-slate-400 mb-6 leading-relaxed">Méně „pošlete mi OP do mailu“ — klient nahraje sám do portálu, vy vidíte stav u úkolu.</p>
                <div className="mt-auto p-4 bg-white/5 rounded-2xl border border-white/10">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1 block">Nejvíc používáte</span>
                  <p className="text-sm text-slate-300 font-medium"><strong className="text-white">Klientský portál</strong> a úkoly navázané na podklady.</p>
                </div>
              </SpotlightCard>
            </ScrollReveal>

            <ScrollReveal delay={400}>
              <SpotlightCard className="p-8 h-full flex flex-col">
                <div className="w-12 h-12 bg-rose-500/20 rounded-xl flex items-center justify-center text-rose-400 mb-6"><Building size={24}/></div>
                <h3 className="font-jakarta text-2xl font-bold text-white mb-2">Firma / Broker pool</h3>
                <p className="text-slate-400 mb-6 leading-relaxed">Chcete, aby lidé systém reálně používali — a aby šlo sladit přístupy a pravidla napříč firmou.</p>
                <div className="mt-auto p-4 bg-white/5 rounded-2xl border border-white/10">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1 block">Nejvíc používáte</span>
                  <p className="text-sm text-slate-300 font-medium"><strong className="text-white">Role</strong>, oddělení dat podle organizací a soulad s procesy.</p>
                </div>
              </SpotlightCard>
            </ScrollReveal>

          </div>
        </div>
      </section>

      {/* --- REFERENCE (MARQUEE) --- */}
      <section className="py-12 border-y border-white/10 bg-white/5 relative z-10 backdrop-blur-sm overflow-hidden" aria-label="Reference od poradců">
        <div className="max-w-[1400px] mx-auto px-6 mb-8 text-center">
          <h3 className="font-jakarta text-sm uppercase tracking-[0.2em] text-slate-400 font-bold">
            Co říkají poradci a řízení týmů
          </h3>
        </div>
        <div className="relative w-full overflow-hidden flex">
          <div className="absolute top-0 left-0 w-32 h-full bg-gradient-to-r from-[#0a0f29] to-transparent z-10"></div>
          <div className="absolute top-0 right-0 w-32 h-full bg-gradient-to-l from-[#0a0f29] to-transparent z-10"></div>
          <div className="animate-marquee gap-6 px-3">
            {[...REVIEWS, ...REVIEWS].map((review, idx) => (
              <div key={idx} className="w-[350px] bg-white/5 border border-white/10 p-6 rounded-[24px] flex-shrink-0 flex flex-col">
                <div className="flex text-amber-400 mb-4">
                  <Star size={14} className="fill-current" />
                  <Star size={14} className="fill-current" />
                  <Star size={14} className="fill-current" />
                  <Star size={14} className="fill-current" />
                  <Star size={14} className="fill-current" />
                </div>
                <p className="text-slate-300 text-sm leading-relaxed mb-6 flex-1">&quot;{review.text}&quot;</p>
                <div className="flex items-center gap-3 mt-auto pt-4 border-t border-white/10">
                  <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center font-bold text-indigo-300 text-xs border border-indigo-500/30">
                    {review.initials}
                  </div>
                  <div>
                    <p className="text-white font-bold text-xs">{review.author}</p>
                    <p className="text-slate-500 text-[10px] uppercase tracking-wider">{review.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- KLIENTSKÁ ZÓNA (DVA SVĚTY) --- */}
      <section id="klientska-zona" className="py-32 relative bg-[#060918]">
        <div className="max-w-[1400px] mx-auto px-6 border-t border-white/10 pt-20">
          <ScrollReveal>
            <div className="text-center mb-16">
              <h2 className="font-jakarta text-3xl md:text-5xl font-bold text-white mb-4">Poradce v systému, klient v portálu</h2>
              <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
                Vy řídíte obchod a vztahy. Klient má jednoduchý digitální servis — požadavek nebo podklad se okamžitě promítne do vašeho úkolu a workflow.
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
                  <p className="text-slate-400 leading-relaxed text-sm md:text-base mb-4">Klient zadá požadavek, nahraje podklady a napíše zprávu. Vy dostanete upozornění a vše řešíte v navazujícím workflow.</p>
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2 text-slate-400 text-sm"><CheckCircle2 size={16} className="text-emerald-500 shrink-0"/> Nový požadavek od klienta</li>
                    <li className="flex items-center gap-2 text-slate-400 text-sm"><CheckCircle2 size={16} className="text-emerald-500 shrink-0"/> Bezpečné nahrání dokumentů</li>
                    <li className="flex items-center gap-2 text-slate-400 text-sm"><CheckCircle2 size={16} className="text-emerald-500 shrink-0"/> Přímá zpráva poradci</li>
                    <li className="flex items-center gap-2 text-slate-400 text-sm"><CheckCircle2 size={16} className="text-emerald-500 shrink-0"/> Upozornění a navazující úkol</li>
                  </ul>
                </div>
              </ScrollReveal>
            </div>

            {/* App Mockup: Klientská zóna - Zadání požadavku */}
            <ScrollReveal direction="right" delay={200} className="order-1 lg:order-2 relative">
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
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* --- FAQ (před ceníkem) --- */}
      <section id="faq" className="py-24 bg-[#060918] border-t border-white/10">
        <div className="max-w-[800px] mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-16">
              <h2 className="font-jakarta text-3xl md:text-4xl font-bold text-white mb-4">Často kladené dotazy</h2>
              <p className="text-slate-400">O práci s daty, klientem a nasazení.</p>
            </div>
          </ScrollReveal>

          <div className="space-y-4 max-w-3xl mx-auto">
            {FAQS.map((faq) => (
              <ScrollReveal key={faq.id} delay={100}>
                <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden transition-all">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(openFaq === faq.id ? null : faq.id)}
                    className="w-full px-6 py-5 flex items-center justify-between text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-2xl min-h-[44px]"
                  >
                    <span className="font-bold text-white pr-4">{faq.q}</span>
                    <ChevronDown size={20} className={`text-slate-400 shrink-0 transition-transform duration-200 ${openFaq === faq.id ? "rotate-180" : ""}`} />
                  </button>
                  {openFaq === faq.id && (
                    <div className="px-6 pb-5 pt-0">
                      <p className="text-slate-400 leading-relaxed text-sm max-w-prose animate-in fade-in slide-in-from-top-2 duration-200">{faq.a}</p>
                    </div>
                  )}
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* --- CENÍK --- */}
      <section id="cenik" className="py-32 relative bg-[#060918] border-t border-white/10">
        <div className="max-w-[1200px] mx-auto px-6">
          <ScrollReveal>
             <div className="text-center mb-16">
               <h2 className="font-jakarta text-3xl md:text-5xl font-bold text-white mb-4">Férové a transparentní ceny</h2>
               <p className="text-lg text-slate-400 max-w-2xl mx-auto">Tarif podle rozsahu praxe. Můžete přejít na vyšší nebo nižší plán.</p>
               
               <div className="inline-flex bg-white/5 border border-white/10 rounded-full p-1 mt-10">
                 <button className={`px-6 py-2.5 rounded-full text-sm font-bold ${!isAnnualPricing ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`} onClick={() => setIsAnnualPricing(false)}>Měsíčně</button>
                 <button className={`px-6 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 ${isAnnualPricing ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`} onClick={() => setIsAnnualPricing(true)}>
                   Ročně <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">-20%</span>
                 </button>
               </div>
             </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
             <ScrollReveal delay={100} direction="up">
               <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 hover:bg-white/10 transition-colors">
                 <h3 className="font-jakarta text-2xl font-bold text-white mb-2">Starter</h3>
                 <p className="text-slate-400 text-sm mb-6">Pro začínající a samostatné poradce.</p>
                 <div className="text-4xl font-black text-white mb-1">{isAnnualPricing ? '1 190' : '1 490'} <span className="text-lg text-slate-500 font-medium">Kč / měs.</span></div>
                 <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-8">Fakturováno {isAnnualPricing ? 'ročně' : 'měsíčně'}</p>
                 
                 <Link href="/prihlaseni" className="block w-full py-4 bg-white/10 text-white rounded-xl font-bold hover:bg-white/20 transition-colors mb-8 border border-white/10 text-center min-h-[44px] flex items-center justify-center">Portál Aidvisora</Link>
                 
                 <ul className="space-y-4">
                   <li className="flex items-center gap-3 text-slate-300 text-sm"><Check size={18} className="text-indigo-400"/> 1 uživatel</li>
                   <li className="flex items-center gap-3 text-slate-300 text-sm"><Check size={18} className="text-indigo-400"/> Neomezená Pipeline a Kalendář</li>
                   <li className="flex items-center gap-3 text-slate-300 text-sm"><Check size={18} className="text-indigo-400"/> Základní nápověda u dokumentů</li>
                 </ul>
               </div>
             </ScrollReveal>

             {/* PRO BALÍČEK */}
             <ScrollReveal delay={200} direction="up">
               <div className="pro-pricing-wrapper transform md:scale-105 shadow-[0_0_50px_rgba(139,92,246,0.2)]">
                 <div className="pro-pricing-inner p-8">
                   <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1 rounded-b-xl z-20">Nejvyužívanější</div>
                   <h3 className="font-jakarta text-2xl font-bold text-white mb-2 mt-4 relative z-20">Pro</h3>
                   <p className="text-slate-400 text-sm mb-6 relative z-20">Kompletní balíček pro profesionály.</p>
                   <div className="text-5xl font-black text-white mb-1 relative z-20">{isAnnualPricing ? '1 590' : '1 990'} <span className="text-lg text-slate-500 font-medium">Kč / měs.</span></div>
                   <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-8 relative z-20">Fakturováno {isAnnualPricing ? 'ročně' : 'měsíčně'}</p>
                   
                   <Link href="/prihlaseni" className="block w-full py-4 bg-indigo-500 text-white rounded-xl font-bold hover:bg-indigo-400 transition-colors mb-8 shadow-lg shadow-indigo-500/30 relative z-20 text-center min-h-[44px] flex items-center justify-center">Portál Aidvisora</Link>
                   
                   <ul className="space-y-4 relative z-20">
                     <li className="flex items-center gap-3 text-white text-sm font-medium"><Check size={18} className="text-indigo-400"/> Vše ze Starteru</li>
                     <li className="flex items-center gap-3 text-white text-sm font-medium"><Check size={18} className="text-emerald-400"/> Klientská zóna (Pro klienty)</li>
                     <li className="flex items-center gap-3 text-white text-sm font-medium"><Check size={18} className="text-emerald-400"/> Finanční analýzy a Kalkulačky</li>
                     <li className="flex items-center gap-3 text-white text-sm font-medium"><Check size={18} className="text-emerald-400"/> Pokročilejší práce s dokumenty a PDF</li>
                   </ul>
                 </div>
               </div>
             </ScrollReveal>

             <ScrollReveal delay={300} direction="up">
               <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 hover:bg-white/10 transition-colors">
                 <h3 className="font-jakarta text-2xl font-bold text-white mb-2">Team</h3>
                 <p className="text-slate-400 text-sm mb-6">Pro agentury a manažerské týmy.</p>
                 <div className="text-4xl font-black text-white mb-1">{isAnnualPricing ? '1 990' : '2 490'} <span className="text-lg text-slate-500 font-medium">Kč / uživ.</span></div>
                 <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-8">Fakturováno {isAnnualPricing ? 'ročně' : 'měsíčně'}</p>
                 
                 <Link href="/prihlaseni" className="block w-full py-4 bg-white/10 text-white rounded-xl font-bold hover:bg-white/20 transition-colors mb-8 border border-white/10 text-center min-h-[44px] flex items-center justify-center">Portál Aidvisora</Link>
                 
                 <ul className="space-y-4">
                   <li className="flex items-center gap-3 text-slate-300 text-sm"><Check size={18} className="text-indigo-400"/> Vše z Pro</li>
                   <li className="flex items-center gap-3 text-slate-300 text-sm"><Check size={18} className="text-indigo-400"/> Sdílení dat a asistentky</li>
                   <li className="flex items-center gap-3 text-slate-300 text-sm"><Check size={18} className="text-indigo-400"/> Manažerské KPI reporty</li>
                 </ul>
               </div>
             </ScrollReveal>
          </div>
        </div>
      </section>

      {/* --- ONBOARDING / JAK ZAČÍT --- */}
      <section id="jak-zacit" className="py-24 relative overflow-hidden bg-[#060918]">
        <div className="max-w-[1200px] mx-auto px-6 border-t border-white/10 pt-24 text-center">
          <ScrollReveal>
            <h2 className="font-jakarta text-3xl md:text-5xl font-bold text-white mb-4">Začněte bez složité migrace</h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-16 leading-relaxed">
              Pomůžeme s importem z Excelu a prvním nastavením portálu a rolí.
            </p>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
             <ScrollReveal delay={100} direction="up" className="relative">
               <div className="bg-white/5 border border-white/10 p-8 rounded-3xl h-full text-left">
                 <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 font-black text-xl rounded-full flex items-center justify-center mb-6">1</div>
                 <h4 className="font-bold text-white text-xl mb-3">Založíte účet</h4>
                 <p className="text-slate-400 text-sm leading-relaxed">Během chvíle získáte přístup do připraveného prostředí, kde můžete začít s nastavením práce, klientů a procesů.</p>
               </div>
             </ScrollReveal>
             <ScrollReveal delay={200} direction="up" className="relative">
               <div className="bg-white/5 border border-white/10 p-8 rounded-3xl h-full text-left">
                 <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 font-black text-xl rounded-full flex items-center justify-center mb-6">2</div>
                 <h4 className="font-bold text-white text-xl mb-3">Importujete data</h4>
                 <p className="text-slate-400 text-sm leading-relaxed">Nahrajete Excel nebo CSV s klienty. Pomůžeme vám data napárovat a odstranit duplicity bez ručního přepisování.</p>
               </div>
             </ScrollReveal>
             <ScrollReveal delay={300} direction="up" className="relative">
               <div className="bg-white/5 border border-white/10 p-8 rounded-3xl h-full text-left">
                 <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 font-black text-xl rounded-full flex items-center justify-center mb-6">3</div>
                 <h4 className="font-bold text-white text-xl mb-3">Spustíte onboarding</h4>
                 <p className="text-slate-400 text-sm leading-relaxed">Pomůžeme vám nastavit klientskou zónu, základní workflow i používání systému v týmu.</p>
               </div>
             </ScrollReveal>
          </div>
        </div>
      </section>

      {/* --- INTEGRACE --- */}
      <section id="integrace" className="py-24 relative overflow-hidden bg-[#060918]">
        <div className="max-w-[1200px] mx-auto px-6 border-t border-white/10 pt-24 text-center">
          <ScrollReveal>
            <h2 className="font-jakarta text-3xl md:text-5xl font-bold text-white mb-4">Napojení na kalendář a běžnou práci</h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-16 leading-relaxed">
              Schůzky a notifikace navazují na klienta a úkoly — bez zbytečného přepisování mezi aplikacemi.
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
                <p className="text-sm text-slate-400">Systémové e-maily, upozornění, přání a další automatické zprávy klientům.</p>
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
        </div>
      </section>

      {/* --- AI + BEZPEČNOST (SLUČENÁ SEKCE) --- */}
      <section id="duvera-a-bezpecnost" className="py-24 md:py-32 relative overflow-hidden bg-[#060918] border-t border-white/10">
        <div className="max-w-[1100px] mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-14">
              <h2 className="font-jakarta text-3xl md:text-5xl font-bold text-white mb-4">
                Pomoc u dokumentů. Odpovědnost u vás.
              </h2>
              <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                Systém může navrhnout další krok nebo vyčíst údaj ze smlouvy — rozhodnutí a komunikace s klientem jsou vždy na vás. Data běží v prostředí vhodném pro práci s osobními údaji, s rolemi a auditem.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid lg:grid-cols-2 gap-10 mb-12">
            <ScrollReveal>
              <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 md:p-8 h-full">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 text-xs font-bold mb-4">
                  <FileText size={14} /> Praktická pomoc
                </div>
                <ul className="space-y-4 text-sm text-slate-300">
                  <li className="flex gap-3">
                    <CheckCircle2 className="text-emerald-400 shrink-0 mt-0.5" size={18} />
                    <span>Návrh dalšího kroku nebo upozornění na termín z kontextu klienta a dokumentů.</span>
                  </li>
                  <li className="flex gap-3">
                    <CheckCircle2 className="text-emerald-400 shrink-0 mt-0.5" size={18} />
                    <span>Nápověda při čtení vybraných údajů z nahraných podkladů — vždy s možností úpravy.</span>
                  </li>
                  <li className="flex gap-3">
                    <CheckCircle2 className="text-emerald-400 shrink-0 mt-0.5" size={18} />
                    <span>
                      Ukázku práce s dokumentem si můžete vyzkoušet v sekci{" "}
                      <a href="#ukazka-workflow" className="text-indigo-300 hover:text-white underline underline-offset-2">
                        interaktivní demo
                      </a>
                      .
                    </span>
                  </li>
                </ul>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={100}>
              <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 md:p-8 h-full">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs font-bold mb-4">
                  <ShieldCheck size={14} /> Data a provoz
                </div>
                <ul className="space-y-5">
                  <li className="flex gap-3">
                    <Lock className="text-emerald-400 shrink-0 mt-0.5" size={20} />
                    <div>
                      <p className="font-bold text-white text-sm mb-1">Ochrana a GDPR</p>
                      <p className="text-slate-400 text-sm">Evidence souhlasů, auditní záznamy akcí, export na žádost klienta. Data v EU.</p>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <Server className="text-blue-400 shrink-0 mt-0.5" size={20} />
                    <div>
                      <p className="font-bold text-white text-sm mb-1">Cloudový provoz</p>
                      <p className="text-slate-400 text-sm">Bez instalace — přístup z prohlížeče, včetně tabletu a mobilu.</p>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <Users className="text-purple-400 shrink-0 mt-0.5" size={20} />
                    <div>
                      <p className="font-bold text-white text-sm mb-1">Role a izolace</p>
                      <p className="text-slate-400 text-sm">Manažer, poradce, asistent — každá organizace má vlastní datový prostor.</p>
                    </div>
                  </li>
                </ul>
              </div>
            </ScrollReveal>
          </div>

          <ScrollReveal delay={150}>
            <div className="text-center border border-white/10 bg-white/5 rounded-2xl p-6 md:p-8">
              <p className="text-slate-300 text-sm md:text-base max-w-2xl mx-auto">
                <strong className="text-white">Navrhuje systém, potvrzujete vy.</strong> Klientská data se nemění bez vašeho kroku. U citlivých údajů z dokumentů máte přehled, odkud údaj pochází.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* --- FOOTER CTA --- */}
      <section className="py-40 relative overflow-hidden border-t border-white/10">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-indigo-900/20 pointer-events-none"></div>
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <ScrollReveal>
            <h2 className="font-jakarta text-3xl md:text-5xl font-extrabold text-white tracking-tight mb-6">
              Začněte mít poradenství pod kontrolou
            </h2>
            <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              Zkuste Aidvisoru zdarma a uvidíte, jestli vám sedí tok klient → dokument → úkol → obchod.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
              <Link
                href="/prihlaseni?register=1"
                className="w-full sm:w-auto px-10 py-5 bg-white text-[#0a0f29] rounded-full text-lg font-bold tracking-wide shadow-[0_0_40px_rgba(255,255,255,0.4)] hover:scale-105 transition-all text-center min-h-[44px] flex items-center justify-center gap-2"
              >
                Vyzkoušet zdarma <ArrowRight size={18} />
              </Link>
              <a
                href="#demo-video"
                className="w-full sm:w-auto px-10 py-5 bg-white/10 text-white border border-white/20 rounded-full text-lg font-bold hover:bg-white/15 transition-all text-center min-h-[44px] flex items-center justify-center gap-2"
              >
                <Play size={18} /> Přehrát demo
              </a>
            </div>
            <p className="mt-8 text-slate-500 text-sm max-w-xl mx-auto">
              Zvolte roli poradce nebo klienta na stránce přihlášení.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* --- FOOTER (ROZŠÍŘENÝ O SEO A PRÁVNÍ ODKAZY) --- */}
      <footer className="bg-[#060918] text-slate-500 py-16 px-6 border-t border-white/10">
        <ScrollReveal>
          <div className="max-w-[1400px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 mb-16">
            
            <div className="lg:col-span-2">
              <Link href="/" className="flex items-center gap-3 mb-6">
                <img src="/Aidvisora logo A.png" alt="" className="h-10 w-10 object-contain shrink-0 brightness-0 invert" aria-hidden />
                <span className="font-jakarta font-bold text-2xl tracking-tight text-white">Aidvisora</span>
              </Link>
              <p className="text-sm max-w-sm leading-relaxed mb-6">Pracovní systém pro finanční poradce — klient, dokumenty, úkoly a obchod v jednom toku.</p>
              <p className="text-xs">
                <a href="mailto:podpora@aidvisora.cz" className="hover:text-white transition-colors">podpora@aidvisora.cz</a>
              </p>
            </div>

            <div>
              <h4 className="text-white font-bold mb-6 font-jakarta text-lg">Produkt</h4>
              <ul className="space-y-4 text-sm">
                <li><a href="#moduly" className="hover:text-white transition-colors">Moduly</a></li>
                <li><a href="#klientska-zona" className="hover:text-white transition-colors">Klientská zóna</a></li>
                <li><Link href="/prihlaseni" className="hover:text-white transition-colors">Portál Aidvisora</Link></li>
                <li><a href="#hlavni-workflow" className="hover:text-white transition-colors">Workflow</a></li>
                <li><a href="#duvera-a-bezpecnost" className="hover:text-white transition-colors">Data a důvěra</a></li>
                <li><a href="#cenik" className="hover:text-white transition-colors">Ceník a tarify</a></li>
                <li><a href="#integrace" className="hover:text-white transition-colors">Integrace</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-bold mb-6 font-jakarta text-lg">Na stránce</h4>
              <ul className="space-y-4 text-sm">
                <li><a href="#bolesti" className="hover:text-white transition-colors">Kde to bolí</a></li>
                <li><a href="#proc-aidvisora" className="hover:text-white transition-colors">Proč Aidvisora</a></li>
                <li><a href="#demo-video" className="hover:text-white transition-colors">Demo video</a></li>
                <li><a href="#faq" className="hover:text-white transition-colors">Časté dotazy</a></li>
              </ul>
            </div>

            <div>
               <h4 className="text-white font-bold mb-6 font-jakarta text-lg">Právní</h4>
               <ul className="space-y-4 text-sm">
                <li><Link href="/terms" className="hover:text-white transition-colors">Obchodní podmínky</Link></li>
                <li><Link href="/privacy" className="hover:text-white transition-colors">Zásady ochrany (GDPR)</Link></li>
                <li><Link href="/privacy" className="hover:text-white transition-colors">Cookies</Link></li>
              </ul>
            </div>

          </div>
          <div className="max-w-[1400px] mx-auto pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between text-xs">
            <p>&copy; 2026 Aidvisora s.r.o. Všechna práva vyhrazena.</p>
            <div className="flex items-center gap-6 mt-4 md:mt-0">
               <span className="flex items-center gap-1">Vyvinuto s <span className="text-rose-500 text-base">♥</span> v Praze</span>
            </div>
          </div>
        </ScrollReveal>
      </footer>

    </div>
  );
}
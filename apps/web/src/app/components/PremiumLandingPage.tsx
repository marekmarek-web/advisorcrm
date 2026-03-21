"use client";
// @ts-nocheck — komponenta 1:1 z main page.txt (původně JS), typy doplněny později

import React, { useEffect, useState, useRef, useMemo } from "react";
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

// --- INTERAKTIVNÍ AI SANDBOX KOMPONENTA ---
const AiSandbox = () => {
  const [status, setStatus] = useState('idle');

  const handleDemo = () => {
    setStatus('scanning');
    setTimeout(() => setStatus('result'), 2500);
  };

  return (
    <div className="aspect-[4/5] md:aspect-square max-w-[500px] mx-auto bg-[#060918]/80 backdrop-blur-xl rounded-[32px] border border-white/10 shadow-[0_0_50px_rgba(168,85,247,0.15)] p-6 relative overflow-hidden flex flex-col">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-xs font-bold text-slate-300 font-jakarta">Live Demo</span>
        </div>
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-white/10"></div>
          <div className="w-3 h-3 rounded-full bg-white/10"></div>
          <div className="w-3 h-3 rounded-full bg-white/10"></div>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center relative">
        {status === 'idle' && (
          <div className="text-center animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/10">
              <FileText size={32} className="text-slate-400" />
            </div>
            <h4 className="text-white font-bold mb-2">Zkuste si to naživo</h4>
            <p className="text-sm text-slate-400 mb-8 max-w-xs mx-auto">Kliknutím simulujete nahrání PDF smlouvy životního pojištění od klienta.</p>
            <button onClick={handleDemo} className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-900/50 transition-all active:scale-95 flex items-center gap-2 mx-auto">
              <UploadCloud size={16}/> Nahrát ukázkovou smlouvu
            </button>
          </div>
        )}

        {status === 'scanning' && (
          <div className="text-center animate-in fade-in duration-300">
            <div className="w-24 h-24 relative mx-auto mb-8">
              <div className="absolute inset-0 border-4 border-white/10 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-purple-500 rounded-full border-t-transparent animate-spin"></div>
              <Bot size={28} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-purple-400 animate-pulse" />
            </div>
            <div className="space-y-3">
              <p className="text-sm font-bold text-white flex items-center justify-center gap-2">
                <Sparkles size={14} className="text-purple-400" /> Čtu dokument "Smlouva_Zivotni_2025.pdf"...
              </p>
              <div className="flex justify-center gap-1">
                <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></span>
                <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></span>
                <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></span>
              </div>
            </div>
          </div>
        )}

        {status === 'result' && (
          <div className="animate-in slide-in-from-bottom-8 fade-in duration-500">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 mb-4 flex items-start gap-3">
              <CheckCircle2 size={20} className="text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-emerald-300 mb-1">Extrakce úspěšná</p>
                <p className="text-xs text-emerald-400/80">Data uložena do CRM. Našel jsem obchodní příležitost.</p>
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
               <div className="flex justify-between items-center pb-3 border-b border-white/10">
                 <span className="text-xs text-slate-400">Pojistná částka</span>
                 <span className="text-sm font-bold text-white">2 500 000 Kč</span>
               </div>
               <div className="flex justify-between items-center pb-3 border-b border-white/10">
                 <span className="text-xs text-slate-400">Invalidita (3. stupeň)</span>
                 <span className="text-sm font-bold text-rose-400">Sjednáno na 0 Kč</span>
               </div>
               <button onClick={() => setStatus('idle')} className="w-full mt-2 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors">
                 Zkusit znovu
               </button>
            </div>
          </div>
        )}
      </div>
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
  { id: 1, text: "Od chvíle, co používám Aidvisoru, mi každé ráno vidím priority a na koho se zaměřit. Konečně přehled.", author: "Martin Dvořák", role: "Finanční poradce", initials: "MD" },
  { id: 2, text: "Klientská zóna výrazně zjednodušila sběr podkladů i komunikaci s klienty.", author: "Lucie Černá", role: "Týmová manažerka", initials: "LČ" },
  { id: 3, text: "Komplexní finanční plán dělám teď za zlomek času. Generování PDF reportu mám na jedno kliknutí.", author: "Petr Nový", role: "Wealth Manager", initials: "PN" },
  { id: 4, text: "Už žádný nepořádek v Excelu. Automatické napojení na kalendář a pipeline vizualizace mi zachránila desítky hodin měsíčně.", author: "Jana Malá", role: "Nezávislá poradkyně", initials: "JM" },
  { id: 5, text: "Skvělá podpora a okamžitý přehled nad produkcí týmu. Pro manažery je to silný nástroj.", author: "Karel Svoboda", role: "Ředitel pobočky", initials: "KS" },
];

const FAQS = [
  { id: 1, q: "Umí to importovat existující data?", a: "Ano. Základní import klientů zvládnete z Excelu nebo CSV. S daty vám pomůžeme tak, aby byl přechod z původního systému co nejrychlejší." },
  { id: 2, q: "Je to vhodné pro celý tým?", a: "Ano. Aidvisora je vhodná pro samostatné poradce i týmy. Umožňuje pracovat s různými rolemi, sdíleným přehledem a navazujícími workflow." },
  { id: 3, q: "Jak funguje klientská zóna?", a: "Klient přes svůj portál zadá požadavek, nahraje podklady nebo napíše zprávu. Poradce dostane upozornění a vše řeší v navazujícím procesu uvnitř aplikace." },
  { id: 4, q: "Co přesně AI umí a neumí?", a: "AI pomáhá s prioritami, follow-upy a čtením vybraných údajů z dokumentů. Finální kontrola a rozhodnutí jsou vždy na poradci. Aidvisora bez potvrzení uživatele nemění klientská data." },
  { id: 5, q: "Kde jsou uložená data?", a: "Data ukládáme v bezpečném prostředí v rámci EU. Systém podporuje auditní stopu akcí, práci se souhlasy a export dat." },
  { id: 6, q: "Jak dlouho trvá nasazení?", a: "Základní účet založíte během několika minut. U týmů záleží na rozsahu nastavení, importu dat a onboarding procesu." },
  { id: 7, q: "Dá se to propojit s Google / Outlook / e-mailem?", a: "Google Kalendář je klíčová integrace pro práci se schůzkami a termíny. E-mailové notifikace a automatické zprávy lze řešit přes specializovaného poskytovatele. Další napojení budeme rozšiřovat postupně." }
];

export default function PremiumLandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [activeSecurityFeature, setActiveSecurityFeature] = useState('none');
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

          <div className="hidden lg:flex items-center gap-8 font-inter font-medium text-sm text-slate-400">
            <a href="#aplikace" className="hover:text-white transition-colors">Aplikace</a>
            <a href="#workflow" className="hover:text-white transition-colors">Typický den</a>
            <a href="#pro-koho" className="hover:text-white transition-colors">Pro koho to je</a>
            <a href="#cenik" className="hover:text-white transition-colors">Ceník</a>
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
      <section className="relative pt-36 pb-20 md:pt-48 md:pb-24 px-6 overflow-hidden min-h-[90vh] flex flex-col items-center justify-center">
        <div className="absolute inset-0 bg-grid-pattern z-0 opacity-40"></div>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-indigo-600/30 rounded-full blur-[150px] pointer-events-none z-0"></div>

        {/* Floating Notifikace v pozadí */}
        <div className="absolute hidden lg:flex top-[20%] right-[5%] xl:right-[8%] bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-2xl shadow-2xl items-center gap-4 z-0 anim-notif-1 opacity-0 scale-90 cursor-default">
          <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center shrink-0"><Bot size={18} className="text-purple-400"/></div>
          <div><p className="text-white text-sm font-bold">Ranní report připraven</p><p className="text-xs text-slate-400">Dnes vás čekají 3 schůzky a 1 urgentní úkol.</p></div>
        </div>
        <div className="absolute hidden lg:flex bottom-[25%] left-[5%] xl:left-[8%] bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-2xl shadow-2xl items-center gap-4 z-0 anim-notif-2 opacity-0 scale-90 cursor-default">
          <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center shrink-0"><MessageSquare size={18} className="text-emerald-400"/></div>
          <div><p className="text-white text-sm font-bold">Zpráva z klientské zóny</p><p className="text-xs text-slate-400">„Mám zájem o novou hypotéku.“</p></div>
        </div>

        <div className="max-w-[1200px] mx-auto text-center relative z-10 w-full">
          <div className="hero-anim inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-8">
            <Command size={14} className="text-slate-400" />
            <span className="text-xs font-bold text-slate-300">Pracovní systém pro finanční poradce a týmy.</span>
          </div>

          <h1 className="hero-anim delay-100 font-jakarta text-6xl md:text-8xl font-extrabold tracking-tight text-white leading-[1.05] mb-8">
            Povyšte své poradenství.<br />
            <span className="text-glow-shimmer">Přehled klientů, schůzek a dokumentů na jednom místě.</span>
          </h1>

          <p className="hero-anim delay-200 font-inter text-xl text-slate-400 max-w-3xl mx-auto mb-4 leading-relaxed">
            CRM a klientská zóna pro finanční poradce, která hlídá schůzky, follow-upy i dokumenty.
          </p>
          <p className="hero-anim delay-200 font-inter text-xl text-slate-400 max-w-3xl mx-auto mb-12 leading-relaxed">
            Aidvisora spojuje kalendář, pipeline, klientský portál a práci s dokumenty v jednom systému. Méně administrativy, více obchodu, lepší servis pro klienty.
          </p>

          <div className="hero-anim delay-300 flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link
              href="/prihlaseni"
              className="w-full sm:w-auto px-8 py-4 bg-white text-[#0a0f29] rounded-full text-base font-bold tracking-wide hover:bg-slate-200 transition-all hover:scale-105 shadow-[0_0_30px_rgba(255,255,255,0.3)] text-center min-h-[44px] flex items-center justify-center gap-2"
            >
              Portál Aidvisora <ArrowRight size={18} />
            </Link>
          </div>

          <div className="hero-anim delay-400 flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16 pt-10 border-t border-white/10 max-w-3xl mx-auto">
            <div><div className="text-3xl font-jakarta font-bold text-white mb-1">24/7</div><div className="text-xs font-bold uppercase tracking-widest text-slate-500">Klientský portál 24/7</div></div>
            <div className="hidden md:block w-px h-10 bg-white/10"></div>
            <div><div className="text-3xl font-jakarta font-bold text-white mb-1">—</div><div className="text-xs font-bold uppercase tracking-widest text-slate-500">Digitální workflow</div></div>
            <div className="hidden md:block w-px h-10 bg-white/10"></div>
            <div><div className="text-3xl font-jakarta font-bold text-white mb-1">15 hod.</div><div className="text-xs font-bold uppercase tracking-widest text-emerald-400">Odhad úspor času s AI</div></div>
          </div>
        </div>
      </section>

      {/* --- NEKONEČNÝ PÁS RECENZÍ (Marquee) --- */}
      <section className="py-12 border-y border-white/10 bg-white/5 relative z-10 backdrop-blur-sm overflow-hidden">
        <div className="max-w-[1400px] mx-auto px-6 mb-8 text-center">
             <h3 className="font-jakarta text-sm uppercase tracking-[0.2em] text-slate-400 font-bold">Poradci, kteří už neztrácejí čas</h3>
        </div>

        <div className="relative w-full overflow-hidden flex">
          {/* Levý a pravý fade effect pro plynulý okraj */}
          <div className="absolute top-0 left-0 w-32 h-full bg-gradient-to-r from-[#0a0f29] to-transparent z-10"></div>
          <div className="absolute top-0 right-0 w-32 h-full bg-gradient-to-l from-[#0a0f29] to-transparent z-10"></div>
          
          <div className="animate-marquee gap-6 px-3">
            {/* Duplikujeme pole, aby marquee běželo nekonečně a plynule */}
            {[...REVIEWS, ...REVIEWS].map((review, idx) => (
              <div key={idx} className="w-[350px] bg-white/5 border border-white/10 p-6 rounded-[24px] flex-shrink-0 flex flex-col">
                <div className="flex text-amber-400 mb-4"><Star size={14} className="fill-current"/><Star size={14} className="fill-current"/><Star size={14} className="fill-current"/><Star size={14} className="fill-current"/><Star size={14} className="fill-current"/></div>
                <p className="text-slate-300 text-sm leading-relaxed mb-6 flex-1">"{review.text}"</p>
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

      {/* --- EVOLUCE PRAXE (Srovnání Dnes vs S Aidvisorou) --- */}
      <section className="py-24 relative overflow-hidden bg-[#060918]">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-indigo-500/10 rounded-[100%] blur-[120px] pointer-events-none"></div>
        
        <div className="max-w-[1200px] mx-auto px-6 relative z-10">
          <ScrollReveal>
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
      <section id="aplikace" className="py-32 relative bg-[#060918]">
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

          {/* 3. MINDMAPY (INTERAKTIVNÍ, SVĚTLÝ DESIGN) */}
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <ScrollReveal className="lg:w-1/2 space-y-6" direction="right">
              <div className="w-14 h-14 bg-orange-500/20 text-orange-400 rounded-2xl flex items-center justify-center mb-6 border border-orange-500/30"><Network size={28}/></div>
              <h3 className="font-jakarta text-4xl font-bold text-white leading-tight">Struktura portfolia rodiny na jednom plátně.</h3>
              <p className="text-lg text-slate-400 leading-relaxed">
                Interaktivní mindmapa umožňuje vizualizovat vztahy a portfolio rodiny. Uzly lze přidávat a přesouvat.
              </p>
            </ScrollReveal>

            <ScrollReveal className="lg:w-1/2 w-full" direction="left">
              <div className="bg-[#f8fafc] rounded-[32px] border border-slate-200 shadow-[0_0_50px_rgba(99,102,241,0.05)] relative overflow-hidden h-[400px]">
                <div className="absolute inset-0 mindmap-dots pointer-events-none"></div>
                {/* Interaktivní komponenta s uzly (Nyní světlá s Plus tlačítkem) */}
                <InteractiveMindmap />
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
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-2 block">Budoucí hodnota (Při 7% p.a.)</span>
                  <div className="text-4xl sm:text-5xl font-black text-white mb-2">{formatNumber(futureValue)} <span className="text-xl sm:text-2xl text-slate-500">Kč</span></div>
                  <button className="mt-4 px-4 py-2 bg-emerald-500 text-white rounded-lg text-xs font-bold hover:bg-emerald-600 transition-colors w-full">Vložit do PDF Reportu</button>
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
                <div className="bg-purple-600 text-white p-4 rounded-xl shadow-md flex items-center justify-between">
                  <div className="flex items-center gap-2"><Sparkles size={16}/> <span className="text-sm font-bold">AI Shrnutí týmu</span></div>
                  <button className="text-xs bg-white text-purple-700 px-3 py-1.5 rounded-lg font-bold">Generovat</button>
                </div>
                <div className="bg-red-50 border border-red-100 p-3 rounded-xl flex items-center gap-3">
                  <AlertTriangle size={16} className="text-red-500 shrink-0"/>
                  <span className="text-sm text-red-800 font-medium"><strong>Jan Svoboda:</strong> Žádná evidovaná schůzka za 14 dní.</span>
                </div>
              </div>
            </ScrollReveal>
          </div>

        </div>
      </section>

      {/* --- TYPICKÝ DEN (Workflow Storytelling) --- */}
      <section id="workflow" className="py-32 relative bg-[#0a0f29] border-t border-white/5">
        <div className="max-w-[1000px] mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-24">
              <h2 className="font-jakarta text-4xl md:text-5xl font-bold text-white mb-4">Váš nový pracovní den.</h2>
              <p className="text-xl text-slate-400">Jak může vypadat váš pracovní den s Aidvisorou.</p>
            </div>
          </ScrollReveal>

          <div className="relative">
            <div className="absolute left-[28px] md:left-1/2 top-0 bottom-0 w-[2px] bg-white/10 md:-translate-x-1/2 rounded-full overflow-hidden">
               <div className="timeline-glow"></div>
            </div>

            <ScrollReveal className="relative flex flex-col md:flex-row items-start md:items-center justify-between mb-16 md:mb-24 group">
              <div className="hidden md:block md:w-5/12 text-right pr-12">
                 <h3 className="font-jakarta text-2xl font-bold text-white mb-2">Ranní káva a brífing</h3>
                 <p className="text-slate-400">AI Asistent projde vaše data a sestaví seznam priorit. Ukáže vám, komu končí fixace a na co se dnes soustředit.</p>
              </div>
              <div className="absolute left-0 md:left-1/2 w-14 h-14 bg-[#0a0f29] border-4 border-slate-800 rounded-full flex items-center justify-center md:-translate-x-1/2 z-10 shadow-[0_0_20px_rgba(251,191,36,0.2)] group-hover:border-amber-500 transition-colors">
                <Sunrise className="text-amber-500" size={24} />
              </div>
              <div className="w-full pl-20 md:pl-0 md:w-5/12 md:text-left md:pl-12">
                 <SpotlightCard className="p-6">
                   <div className="flex items-center gap-3 mb-3"><Bot className="text-purple-400" size={20}/><span className="text-sm font-bold text-white">AI Brífing (08:00)</span></div>
                   <p className="text-sm text-slate-400 italic">"Dobré ráno! Dnes máte 3 schůzky. Klient Petr Malý slaví narozeniny a rodině Novákově chybí podpis na smlouvě."</p>
                 </SpotlightCard>
              </div>
            </ScrollReveal>

            <ScrollReveal className="relative flex flex-col md:flex-row items-start md:items-center justify-between mb-16 md:mb-24 group">
              <div className="w-full pl-20 md:pl-0 md:w-5/12 md:text-right md:pr-12 order-2 md:order-1">
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
              <div className="hidden md:block md:w-5/12 text-left pl-12 order-3">
                 <h3 className="font-jakarta text-2xl font-bold text-white mb-2">Schůzky na kliknutí</h3>
                 <p className="text-slate-400">Otevřete interaktivní kalkulačku, vytvoříte s klientem vizuální finanční plán a jedním kliknutím vygenerujete PDF report.</p>
              </div>
            </ScrollReveal>

            <ScrollReveal className="relative flex flex-col md:flex-row items-start md:items-center justify-between mb-16 md:mb-24 group">
              <div className="hidden md:block md:w-5/12 text-right pr-12">
                 <h3 className="font-jakarta text-2xl font-bold text-white mb-2">Klientská zóna pracuje za vás</h3>
                 <p className="text-slate-400">Zatímco jste na obědě, klient vám přes svůj portál sám bezpečně nahraje chybějící občanku a napíše rychlý dotaz do chatu.</p>
              </div>
              <div className="absolute left-0 md:left-1/2 w-14 h-14 bg-[#0a0f29] border-4 border-slate-800 rounded-full flex items-center justify-center md:-translate-x-1/2 z-10 shadow-[0_0_20px_rgba(16,185,129,0.2)] group-hover:border-emerald-500 transition-colors">
                <Smartphone className="text-emerald-500" size={24} />
              </div>
              <div className="w-full pl-20 md:pl-0 md:w-5/12 md:text-left md:pl-12">
                 <SpotlightCard className="p-6 border-emerald-500/30">
                   <div className="flex items-center gap-3 mb-3"><Bell className="text-emerald-400" size={20}/><span className="text-sm font-bold text-white">Nová notifikace (14:30)</span></div>
                   <p className="text-sm text-slate-300">Klient <strong className="text-white">Jan Novák</strong> nahrál soubor "Obcanka.pdf" a píše novou zprávu.</p>
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
              <div className="hidden md:block md:w-5/12 text-left pl-12 order-3">
                 <h3 className="font-jakarta text-2xl font-bold text-white mb-2">Čistý stůl</h3>
                 <p className="text-slate-400">Přesouváte obchody v Kanbanu, delegujete úkoly na asistentku a odcházíte s čistou hlavou. Přehled úkolů a obchodů máte v jednom místě, nic nepřeskočí.</p>
              </div>
            </ScrollReveal>

          </div>
        </div>
      </section>

      {/* --- PRO KOHO JE AIDVISORA (Cílové skupiny) --- */}
      <section id="pro-koho" className="py-32 relative bg-[#060918]">
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
                <h3 className="font-jakarta text-2xl font-bold text-white mb-2">Tým / Manažer</h3>
                <p className="text-slate-400 mb-6 leading-relaxed">Ztrácíte přehled o tom, na čem vaši lidé pracují, a excelové reporty produkce jsou věčně neaktuální.</p>
                <div className="mt-auto p-4 bg-white/5 rounded-2xl border border-white/10">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1 block">Klíčový modul</span>
                  <p className="text-sm text-slate-300 font-medium">Sdílené pohledy a <strong className="text-white">KPI Produkce</strong> v reálném čase.</p>
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
                <p className="text-slate-400 mb-6 leading-relaxed">Potřebujete zajistit 100% soulad s GDPR a mít nástroj, který lidé reálně rádi používají.</p>
                <div className="mt-auto p-4 bg-white/5 rounded-2xl border border-white/10">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1 block">Klíčový modul</span>
                  <p className="text-sm text-slate-300 font-medium"><strong className="text-white">Multi-tenant architektura</strong> s pokročilým řízením rolí.</p>
                </div>
              </SpotlightCard>
            </ScrollReveal>

          </div>
        </div>
      </section>

      {/* --- KLIENTSKÁ ZÓNA (DVA SVĚTY) --- */}
      <section id="klientska-zona" className="py-32 relative bg-[#060918]">
        <div className="max-w-[1400px] mx-auto px-6 border-t border-white/10 pt-20">
          <ScrollReveal>
            <div className="text-center mb-16">
              <h2 className="font-jakarta text-4xl md:text-6xl font-bold text-white mb-6">Dva světy. Jedna platforma.</h2>
              <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">Vy řídíte obchod a vztahy. Klient má jednoduchý digitální servis. Když něco potřebuje, zadá požadavek v portálu a vám se okamžitě vytvoří navazující krok.</p>
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

      {/* --- AI ASISTENT & DŮVĚRYHODNOST --- */}
      <section id="ai-asistent" className="py-32 relative overflow-hidden bg-[#060918]">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-purple-600/10 rounded-full blur-[150px] pointer-events-none z-0"></div>
        
        <div className="max-w-[1400px] mx-auto px-6 relative z-10 border-t border-white/10 pt-20">
          <ScrollReveal>
            <div className="bg-white/5 border border-white/10 rounded-[48px] p-8 md:p-16 lg:p-24 backdrop-blur-md flex flex-col lg:flex-row items-center gap-16 shadow-2xl mb-16">
              
              <div className="lg:w-1/2">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-bold uppercase tracking-widest mb-8">
                  <Bot size={16}/> AI jako pomocník v praxi.
                </div>
                <h2 className="font-jakarta text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
                  AI, které hlídá priority, follow-upy a <span className="text-glow-shimmer">data ze smluv.</span>
                </h2>
                <p className="text-lg text-slate-400 mb-12 leading-relaxed">
                  Naše AI nedělá jen souhrny textů. Pomáhá analyzovat klientovo portfolio. Umí vyčíst data z PDF smluv a včas pošle notifikaci na úkol, který hoří.
                </p>

                <div className="space-y-4">
                  {[
                    { icon: Activity, title: 'Analýza mezer (Gap Analysis)', desc: 'AI projde portfolio a řekne: „Klientovi chybí zajištění invalidity, navrhněte schůzku.“' },
                    { icon: FileText, title: 'Extrakce dat z PDF', desc: 'Nahrajete naskenovanou smlouvu a systém sám doplní částky a data fixace do CRM.' },
                    { icon: Bell, title: 'Hlídání úkolů a priorit', desc: 'Každé ráno připraví brífink toho nejurgentnějšího a ohlídá zapomenuté follow-upy.' }
                  ].map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <div key={i} className="flex items-start gap-4 p-4 rounded-2xl hover:bg-white/5 transition-colors border border-transparent hover:border-white/10">
                        <div className="mt-1 bg-purple-500/20 p-3 rounded-xl text-purple-400 border border-purple-500/30"><Icon size={20}/></div>
                        <div>
                          <h4 className="text-white font-bold text-lg mb-1">{item.title}</h4>
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
          <ScrollReveal delay={200}>
            <div className="max-w-4xl mx-auto text-center border border-white/10 bg-white/5 rounded-3xl p-10">
               <h3 className="font-jakarta text-2xl font-bold text-white mb-3">AI navrhuje, <span className="text-purple-400">poradce rozhoduje.</span></h3>
               <p className="text-slate-400 mb-8 max-w-xl mx-auto">Věříme, že umělá inteligence je užitečný pomocník, ale u peněz má poslední slovo vždy člověk. Proto jsme nastavili jasná pravidla.</p>
               
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
                  <div className="flex flex-col gap-2">
                    <CheckCircle2 size={24} className="text-emerald-400 mb-2"/>
                    <h4 className="font-bold text-white">Lidská kontrola</h4>
                    <p className="text-sm text-slate-400">AI nikdy nemění klientská data bez vašeho výslovného souhlasu na 1 klik.</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Search size={24} className="text-emerald-400 mb-2"/>
                    <h4 className="font-bold text-white">Auditovatelnost</h4>
                    <p className="text-sm text-slate-400">Vždy přesně víte, z jakého dokumentu a věty AI daný údaj vyčetla.</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Lock size={24} className="text-emerald-400 mb-2"/>
                    <h4 className="font-bold text-white">Bezpečné zpracování</h4>
                    <p className="text-sm text-slate-400">Data z PDF se po analýze nikde netrénují a zůstávají v uzavřeném sandboxu.</p>
                  </div>
               </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* --- INFRASTRUKTURA A BEZPEČNOST (Interaktivní Jádro) --- */}
      <section id="infrastruktura" className="py-32 relative overflow-hidden bg-[#060918]">
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
                  <p className="text-slate-400 leading-relaxed text-lg pl-10">Kompletní evidence souhlasů, automatický audit log všech akcí v systému a jednoduchý export dat na žádost klienta. Data jsou v EU.</p>
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
                    <h3 className="font-bold text-xl text-white">Škálovatelný Cloud</h3>
                  </div>
                  <p className="text-slate-400 leading-relaxed text-lg pl-10">Zapomeňte na instalace. Aplikace běží na zabezpečených serverech, je bleskově rychlá a přístupná odkudkoliv, i z mobilu či tabletu.</p>
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
                    <h3 className="font-bold text-xl text-white">Izolace a Role (RBAC)</h3>
                  </div>
                  <p className="text-slate-400 leading-relaxed text-lg pl-10">Precizní řízení přístupů (Manažer, Poradce, Asistent). Každá firma má svůj izolovaný datový prostor (Multi-tenant architektura).</p>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </section>

      {/* --- NOVÉ: ROI KALKULAČKA --- */}
      <section id="roi-kalkulacka" className="py-24 relative overflow-hidden bg-[#060918]">
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
                  <span className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Ušetřený čas s AI (Měsíčně)</span>
                  <div className="text-3xl font-black text-white">{roiSavedHours} <span className="text-lg text-slate-400">hodin</span></div>
                  <p className="text-xs text-emerald-400 mt-1">Snížení administrativy o 40 %</p>
                </div>
                <div className="w-full h-px bg-white/10"></div>
                <div>
                  <span className="block text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Nové příležitosti z follow-upů (Ročně)</span>
                  <div className="text-3xl font-black text-white">+{roiExtraDeals} <span className="text-lg text-slate-400">obchodů</span></div>
                  <p className="text-xs text-emerald-400 mt-1">Zvýšení konverze o 5 % díky hlídání termínů</p>
                </div>
                <div className="w-full h-px bg-white/10"></div>
                <div>
                  <span className="block text-xs font-black uppercase tracking-widest text-indigo-300 mb-1">Hodnota vrácená do byznysu (Měsíčně)*</span>
                  <div className="text-4xl md:text-5xl font-black text-emerald-400">{formatNumber(roiValue)} <span className="text-2xl text-slate-400">Kč</span></div>
                </div>
              </div>
            </ScrollReveal>
          </div>
          <p className="text-center text-[10px] text-slate-500 mt-6">*Odhad kalkuluje hodnotu ušetřené hodiny (1 000 Kč) a průměrnou provizi z jednoho zachráněného obchodu (15 000 Kč).</p>
        </div>
      </section>

      {/* --- INTEGRACE --- */}
      <section id="integrace" className="py-24 relative overflow-hidden bg-[#060918]">
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

      {/* --- CENÍK --- */}
      <section id="cenik" className="py-32 relative bg-[#060918] border-t border-white/10">
        <div className="max-w-[1200px] mx-auto px-6">
          <ScrollReveal>
             <div className="text-center mb-16">
               <h2 className="font-jakarta text-4xl md:text-5xl font-bold text-white mb-6">Férové a transparentní ceny.</h2>
               <p className="text-xl text-slate-400 max-w-2xl mx-auto">Vyberte si tarif podle toho, jak velký je váš byznys. Můžete kdykoliv přejít na vyšší nebo nižší plán.</p>
               
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
                   <li className="flex items-center gap-3 text-slate-300 text-sm"><Check size={18} className="text-indigo-400"/> Základní AI Asistent</li>
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
                     <li className="flex items-center gap-3 text-white text-sm font-medium"><Check size={18} className="text-emerald-400"/> Pokročilé AI a extrakce PDF</li>
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

      {/* --- NOVÉ: ONBOARDING / JAK ZAČÍT --- */}
      <section id="jak-zacit" className="py-24 relative overflow-hidden bg-[#060918]">
        <div className="max-w-[1200px] mx-auto px-6 border-t border-white/10 pt-24 text-center">
          <ScrollReveal>
            <h2 className="font-jakarta text-4xl md:text-5xl font-bold text-white mb-6">Začnete bez složité migrace.</h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-16 leading-relaxed">
              Přechod na nový systém nemusí být složitý. Pomůžeme vám s importem dat i prvním nastavením tak, abyste mohli začít pracovat co nejdříve.
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

      {/* --- FAQ SEKCE --- */}
      <section id="faq" className="py-24 bg-[#060918] border-t border-white/10">
        <div className="max-w-[800px] mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-16">
              <h2 className="font-jakarta text-4xl font-bold text-white mb-4">Často kladené dotazy</h2>
              <p className="text-slate-400">Vše, co potřebujete vědět před spuštěním.</p>
            </div>
          </ScrollReveal>

          <div className="space-y-4 max-w-3xl mx-auto">
            {FAQS.map((faq) => (
              <ScrollReveal key={faq.id} delay={100}>
                <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden transition-all">
                  <button 
                    onClick={() => setOpenFaq(openFaq === faq.id ? null : faq.id)}
                    className="w-full px-6 py-5 flex items-center justify-between text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-2xl"
                  >
                    <span className="font-bold text-white pr-4">{faq.q}</span>
                    <ChevronDown size={20} className={`text-slate-400 shrink-0 transition-transform duration-200 ${openFaq === faq.id ? 'rotate-180' : ''}`} />
                  </button>
                  {openFaq === faq.id && (
                    <div className="px-6 pb-5 pt-0">
                      <p className="text-slate-400 leading-relaxed text-sm max-w-prose animate-in fade-in slide-in-from-top-2 duration-200">
                        {faq.a}
                      </p>
                    </div>
                  )}
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* --- FOOTER CTA --- */}
      <section className="py-40 relative overflow-hidden border-t border-white/10">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-indigo-900/20 pointer-events-none"></div>
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <ScrollReveal>
            <h2 className="font-jakarta text-4xl md:text-6xl font-extrabold text-white tracking-tight mb-6">
              Portál Aidvisora
            </h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              Přihlaste se do pracovního prostředí – CRM, klientská zóna, kalendář a dokumenty na jednom místě.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
              <Link
                href="/prihlaseni"
                className="w-full sm:w-auto px-10 py-5 bg-white text-[#0a0f29] rounded-full text-lg font-bold tracking-wide shadow-[0_0_40px_rgba(255,255,255,0.4)] hover:scale-105 transition-all text-center min-h-[44px] flex items-center justify-center gap-2"
              >
                Otevřít portál <ArrowRight size={18} />
              </Link>
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
          <div className="max-w-[1400px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-12 mb-16">
            
            <div className="lg:col-span-2">
              <Link href="/" className="flex items-center gap-3 mb-6">
                <img src="/Aidvisora logo A.png" alt="" className="h-10 w-10 object-contain shrink-0 brightness-0 invert" aria-hidden />
                <span className="font-jakarta font-bold text-2xl tracking-tight text-white">Aidvisora</span>
              </Link>
              <p className="text-sm max-w-sm leading-relaxed mb-6">Pracovní systém pro finanční poradce a týmy. CRM, klientská zóna a workflow na jednom místě.</p>
              <p className="text-xs">
                <a href="mailto:podpora@aidvisora.cz" className="hover:text-white transition-colors">podpora@aidvisora.cz</a>
              </p>
            </div>

            <div>
              <h4 className="text-white font-bold mb-6 font-jakarta text-lg">Produkt</h4>
              <ul className="space-y-4 text-sm">
                <li><a href="#aplikace" className="hover:text-white transition-colors">Vlastnosti CRM</a></li>
                <li><a href="#klientska-zona" className="hover:text-white transition-colors">Klientská zóna</a></li>
                <li><Link href="/prihlaseni" className="hover:text-white transition-colors">Portál Aidvisora</Link></li>
                <li><a href="#ai-asistent" className="hover:text-white transition-colors">AI Asistent</a></li>
                <li><a href="#cenik" className="hover:text-white transition-colors">Ceník a tarify</a></li>
                <li><a href="#integrace" className="hover:text-white transition-colors">Integrace</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-bold mb-6 font-jakarta text-lg">Use Cases (SEO)</h4>
              <ul className="space-y-4 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">CRM pro poradce</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Klientská zóna pro poradce</a></li>
                <li><a href="#" className="hover:text-white transition-colors">AI pro finance</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Pipeline pro hypotéky</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Digitální správa klientů</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-bold mb-6 font-jakarta text-lg">Blog & Návody</h4>
              <ul className="space-y-4 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Jak digitalizovat praxi</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Jak zvýšit follow-up rate</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Využití AI v poradenství</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Průvodce klientskou zónou</a></li>
              </ul>
            </div>

            <div>
               <h4 className="text-white font-bold mb-6 font-jakarta text-lg">Právní a Bezpečnost</h4>
               <ul className="space-y-4 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Obchodní podmínky</a></li>
                <li><Link href="/gdpr" className="hover:text-white transition-colors">Zásady ochrany (GDPR)</Link></li>
                <li><a href="#" className="hover:text-white transition-colors">Nastavení Cookies</a></li>
                <li><a href="#" className="hover:text-white transition-colors">SLA a Onboarding Support</a></li>
                <li><a href="#" className="hover:text-emerald-400 transition-colors flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Status systému</a></li>
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
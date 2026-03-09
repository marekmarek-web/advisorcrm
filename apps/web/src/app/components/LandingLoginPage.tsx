"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ThemeId = "original" | "darkElegance";

const themes: Record<ThemeId, {
  id: ThemeId;
  name: string;
  bg: string;
  wave1: string;
  wave2: string;
  wave3: string;
  wave4: string;
  cardStyle: string;
  logoBox: string;
  btnStyle: string;
}> = {
  original: {
    id: "original",
    name: "Barevný",
    bg: "linear-gradient(60deg, rgba(84,58,183,1) 0%, rgba(0,172,193,1) 100%)",
    wave1: "rgba(255,255,255,0.7)",
    wave2: "rgba(255,255,255,0.5)",
    wave3: "rgba(255,255,255,0.3)",
    wave4: "#ffffff",
    cardStyle: "bg-white/95 text-slate-800 shadow-blue-900/20 border-white",
    logoBox: "bg-[#1a1c2e] text-white",
    btnStyle: "bg-[#1a1c2e] hover:bg-[#2a2d4a] text-white",
  },
  darkElegance: {
    id: "darkElegance",
    name: "Tmavý",
    bg: "linear-gradient(60deg, #10121f 0%, #1a1c2e 100%)",
    wave1: "rgba(99, 102, 241, 0.1)",
    wave2: "rgba(168, 85, 247, 0.15)",
    wave3: "rgba(59, 130, 246, 0.2)",
    wave4: "#0a0b14",
    cardStyle: "bg-[#1a1c2e]/70 border-white/10 text-white shadow-2xl shadow-indigo-500/10 backdrop-blur-xl",
    logoBox: "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30",
    btnStyle: "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25",
  },
};

export function LandingLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/portal/today";

  const [activeTheme, setActiveTheme] = useState<ThemeId>("darkElegance");
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const current = themes[activeTheme];

  const inputClasses = `w-full px-4 py-3.5 rounded-xl border outline-none transition-all duration-300 ${
    activeTheme === "darkElegance"
      ? "bg-white/5 border-white/10 focus:border-indigo-400 focus:bg-white/10 text-white placeholder-white/30"
      : "bg-slate-50 border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 text-slate-800"
  }`;

  const googleBtnClasses = `w-full flex items-center justify-center gap-3 py-3.5 rounded-xl border font-bold transition-all duration-300 ${
    activeTheme === "darkElegance"
      ? "bg-white/5 border-white/10 text-white hover:bg-white/10"
      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm"
  }`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const supabase = createClient();
    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setMessage(error.message);
        return;
      }
      const nextPath = next.startsWith("/") ? next : "/portal/today";
      window.location.href = `/register/complete?next=${encodeURIComponent(nextPath)}`;
    } else {
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
      setLoading(false);
      if (error) {
        setMessage(error.message);
        return;
      }
      setMessage("Zkontrolujte e-mail pro potvrzení registrace.");
    }
  }

  async function handleGoogleSignIn() {
    const supabase = createClient();
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${baseUrl}/auth/callback?next=${encodeURIComponent(next || "/register/complete")}`,
      },
    });
  }

  function openPortal() {
    router.push("/portal");
  }

  return (
    <div
      className="min-h-screen relative overflow-hidden flex flex-col transition-all duration-1000 ease-in-out"
      style={{ background: current.bg }}
    >
      <style>{`
        .landing-waves {
          position: relative;
          width: 100%;
          height: 15vh;
          margin-bottom: -7px;
          min-height: 100px;
          max-height: 150px;
        }
        .landing-parallax use {
          animation: landing-move-forever 25s cubic-bezier(.55,.5,.45,.5) infinite;
        }
        .landing-parallax use:nth-child(1) { animation-delay: -2s; animation-duration: 7s; }
        .landing-parallax use:nth-child(2) { animation-delay: -3s; animation-duration: 10s; }
        .landing-parallax use:nth-child(3) { animation-delay: -4s; animation-duration: 13s; }
        .landing-parallax use:nth-child(4) { animation-delay: -5s; animation-duration: 20s; }
        @keyframes landing-move-forever {
          0% { transform: translate3d(-90px,0,0); }
          100% { transform: translate3d(85px,0,0); }
        }
        @media (max-width: 768px) {
          .landing-waves { height: 60px; min-height: 60px; }
        }
      `}</style>

      {/* Přepínač stylů: Barevný / Tmavý */}
      <div className="absolute top-6 left-0 right-0 flex justify-center z-50">
        <div className="bg-black/20 backdrop-blur-md p-1.5 rounded-full shadow-lg border border-white/10 flex gap-1">
          {Object.values(themes).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTheme(t.id)}
              className={`px-4 py-2 rounded-full font-bold text-sm transition-all duration-300 ${
                activeTheme === t.id ? "bg-white/20 text-white shadow-sm" : "text-white/60 hover:text-white hover:bg-white/10"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex justify-center items-center z-10 px-4 pt-16">
        <div className={`w-full max-w-md p-10 rounded-[32px] border transition-colors duration-700 ${current.cardStyle}`}>
          <div className="flex flex-col items-center mb-10">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold mb-4 transition-colors duration-700 ${current.logoBox}`}>
              W
            </div>
            <h1 className="font-light text-[24px] md:text-[48px] tracking-[2px] mb-1" style={{ fontFamily: "var(--wp-font)" }}>
              WePlan
            </h1>
            <p className="text-[14px] tracking-[1px] opacity-80 transition-all" style={{ fontFamily: "var(--wp-font)" }}>
              {isLogin ? "Vítejte zpět" : "Vytvořit nový účet"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" style={{ fontFamily: "var(--wp-font)" }}>
            {!isLogin && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2 opacity-80">Jméno a příjmení</label>
                <input
                  type="text"
                  placeholder="Např. Martin Novák"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClasses}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-2 opacity-80">Email</label>
              <input
                type="email"
                placeholder="vase@adresa.cz"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClasses}
                required
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold uppercase tracking-wider opacity-80">Heslo</label>
                {isLogin && (
                  <Link href="/login" className="text-xs font-bold opacity-60 hover:opacity-100 transition-opacity">
                    Zapomenuté heslo?
                  </Link>
                )}
              </div>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClasses}
                required
              />
            </div>

            {message && (
              <p className={`text-sm rounded-lg px-3 py-2 ${activeTheme === "darkElegance" ? "bg-red-500/20 text-red-200 border border-red-400/30" : "text-red-600 bg-red-50 border border-red-200"}`}>
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full mt-6 py-4 rounded-xl font-bold tracking-wide transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 ${current.btnStyle}`}
            >
              {loading ? "…" : isLogin ? "PŘIHLÁSIT SE" : "VYTVOŘIT ÚČET"}
            </button>

            <div className="flex items-center gap-4 my-6 opacity-60">
              <div className={`h-[1px] flex-1 ${activeTheme === "darkElegance" ? "bg-white/20" : "bg-slate-300"}`} />
              <span className="text-xs font-bold uppercase tracking-wider">Nebo</span>
              <div className={`h-[1px] flex-1 ${activeTheme === "darkElegance" ? "bg-white/20" : "bg-slate-300"}`} />
            </div>

            <button type="button" onClick={handleGoogleSignIn} className={googleBtnClasses}>
              <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Google
            </button>

            <p className="mt-8 text-center text-sm opacity-80 pt-4">
              {isLogin ? "Nemáte ještě účet?" : "Již máte účet?"}
              <button
                type="button"
                onClick={() => { setIsLogin(!isLogin); setMessage(""); }}
                className="ml-2 font-bold hover:underline transition-all"
              >
                {isLogin ? "Zaregistrujte se" : "Přihlaste se"}
              </button>
            </p>

            <div className="pt-6 border-t border-white/10 mt-6">
              <button
                type="button"
                onClick={openPortal}
                className={`w-full py-3.5 rounded-xl font-bold tracking-wide transition-all duration-300 border-2 ${activeTheme === "darkElegance" ? "border-white/30 text-white hover:bg-white/10" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}
              >
                Otevřít Portál
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="relative mt-auto w-full">
        <svg
          className="landing-waves"
          xmlns="http://www.w3.org/2000/svg"
          xmlnsXlink="http://www.w3.org/1999/xlink"
          viewBox="0 24 150 28"
          preserveAspectRatio="none"
          shapeRendering="auto"
        >
          <defs>
            <path id="landing-gentle-wave" d="M-160 44c30 0 58-18 88-18s 58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z" />
          </defs>
          <g className="landing-parallax transition-colors duration-1000">
            <use href="#landing-gentle-wave" x="48" y="0" fill={current.wave1} />
            <use href="#landing-gentle-wave" x="48" y="3" fill={current.wave2} />
            <use href="#landing-gentle-wave" x="48" y="5" fill={current.wave3} />
            <use href="#landing-gentle-wave" x="48" y="7" fill={current.wave4} />
          </g>
        </svg>
      </div>
    </div>
  );
}

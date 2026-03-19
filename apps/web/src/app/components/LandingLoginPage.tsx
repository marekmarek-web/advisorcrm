"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, Mail, Lock, ArrowRight, AlertCircle, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { acceptClientInvitation } from "@/app/actions/auth";
import { useKeyboardAware } from "@/lib/ui/useKeyboardAware";

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

function getInitialMessage(errorParam: string | null): string {
  if (!errorParam) return "";
  if (errorParam === "otp_expired") return "Odkaz z e-mailu vypršel. Přihlaste se heslem nebo zaregistrujte se znovu.";
  if (errorParam === "database_error") return "Problém s připojením k databázi. Zkuste to za chvíli znovu.";
  if (errorParam === "auth_error") return "Přihlášení se nezdařilo. Zkontrolujte údaje nebo to zkuste znovu po chvíli.";
  try {
    return decodeURIComponent(errorParam);
  } catch {
    return errorParam;
  }
}

type Role = "advisor" | "client";

export function LandingLoginPage() {
  const searchParams = useSearchParams();
  const { keyboardInset, keyboardOpen } = useKeyboardAware();
  const next = searchParams.get("next") || "/portal/today";
  const token = searchParams.get("token");
  const registerParam = searchParams.get("register");
  const errorParam = searchParams.get("error");

  const [role, setRole] = useState<Role>(() => (token ? "client" : "advisor"));
  const [isLogin, setIsLogin] = useState(() => !registerParam && !token);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [gdprConsent, setGdprConsent] = useState(false);
  const [message, setMessage] = useState(() => getInitialMessage(errorParam));
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (token) setRole("client");
  }, [token]);

  const hasError = Boolean(message);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setMessage("");

    const supabase = createClient();

    if (token) {
      // Nejprve zkusit přihlášení (existující účet); jinak registrace (nový klient)
      let { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const isInvalidCredentials = error.message.toLowerCase().includes("invalid") || error.message.toLowerCase().includes("credentials");
        if (isInvalidCredentials) {
          const signUpRes = await supabase.auth.signUp({ email, password });
          error = signUpRes.error;
          if (error?.message?.toLowerCase().includes("already registered") || error?.message?.toLowerCase().includes("already exists")) {
            setMessage("Tento e-mail již má účet. Zadejte své heslo a odešlete znovu (přihlášení).");
            setIsLoading(false);
            return;
          }
        }
      }
      if (error) {
        setIsLoading(false);
        setMessage(error.message);
        return;
      }
      const result = await acceptClientInvitation(token, gdprConsent);
      setIsLoading(false);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      window.location.href = "/client";
      return;
    }

    if (role === "client") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setIsLoading(false);
      if (error) {
        setMessage(error.message);
        return;
      }
      const nextPath = next.startsWith("/") ? next : "/client";
      window.location.href = `/register/complete?next=${encodeURIComponent(nextPath)}`;
      return;
    }

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setIsLoading(false);
      if (error) {
        setMessage(error.message);
        return;
      }
      const nextPath = next.startsWith("/") ? next : "/portal/today";
      window.location.href = `/register/complete?next=${encodeURIComponent(nextPath)}`;
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      });
      setIsLoading(false);
      if (error) {
        if (error.message.toLowerCase().includes("rate limit") || error.message.toLowerCase().includes("email rate")) {
          setMessage("Příliš mnoho pokusů. Zkuste to za 10–15 minut.");
        } else {
          setMessage(error.message);
        }
        return;
      }
      const nextPath = next.startsWith("/") ? next : "/portal/today";
      window.location.href = `/register/complete?next=${encodeURIComponent(nextPath)}`;
    }
  }

  async function handleOAuthSignIn(provider: "google" | "apple") {
    const supabase = createClient();
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${baseUrl}/auth/callback?next=${encodeURIComponent(next || "/register/complete")}`,
      },
    });
  }

  return (
    <div
      className={`min-h-screen bg-[#0a0f29] font-inter text-slate-300 flex flex-col items-center relative overflow-hidden selection:bg-indigo-500 selection:text-white ${keyboardOpen ? "justify-start pt-4" : "justify-center"}`}
      style={{ paddingBottom: `calc(var(--safe-area-bottom) + ${keyboardInset}px)` }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@500;700;800&display=swap');
        .font-inter { font-family: 'Inter', sans-serif; }
        .font-jakarta { font-family: 'Plus Jakarta Sans', sans-serif; }
        @keyframes float-slow {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(50px, 50px) rotate(5deg); }
          50% { transform: translate(0px, 100px) rotate(0deg); }
          75% { transform: translate(-50px, 50px) rotate(-5deg); }
        }
        .orb-1 { animation: float-slow 20s ease-in-out infinite; }
        .orb-2 { animation: float-slow 25s ease-in-out infinite reverse; }
        .waves {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 25vh;
          min-height: 150px;
          max-height: 300px;
          z-index: 0;
        }
        .parallax > use { animation: move-forever 25s cubic-bezier(.55,.5,.45,.5) infinite; }
        .parallax > use:nth-child(1) { animation-delay: -2s; animation-duration: 7s; }
        .parallax > use:nth-child(2) { animation-delay: -3s; animation-duration: 10s; }
        .parallax > use:nth-child(3) { animation-delay: -4s; animation-duration: 13s; }
        .parallax > use:nth-child(4) { animation-delay: -5s; animation-duration: 20s; }
        @keyframes move-forever {
          0% { transform: translate3d(-90px,0,0); }
          100% { transform: translate3d(85px,0,0); }
        }
        .glass-input {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: white;
          transition: all 0.3s ease;
        }
        .glass-input:focus {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(99, 102, 241, 0.6);
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15);
          outline: none;
        }
        .glass-input::placeholder { color: rgba(255, 255, 255, 0.3); }
        .glass-input.client-focus:focus {
          border-color: rgba(16, 185, 129, 0.6);
          box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.15);
        }
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-card { animation: slideUpFade 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>

      {/* Pozadí */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div
          className={`absolute top-[-10%] left-[-10%] w-[50%] h-[50%] blur-[120px] rounded-full orb-1 transition-colors duration-700 ${role === "client" ? "bg-emerald-600/20" : "bg-indigo-600/20"}`}
        />
        <div className="absolute top-[20%] right-[-10%] w-[40%] h-[60%] bg-purple-600/20 blur-[120px] rounded-full orb-2" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      {/* Vlny */}
      <svg
        className="waves"
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
        viewBox="0 24 150 28"
        preserveAspectRatio="none"
        shapeRendering="auto"
      >
        <defs>
          <path id="gentle-wave" d="M-160 44c30 0 58-18 88-18s 58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z" />
        </defs>
        <g className="parallax transition-colors duration-700">
          <use
            href="#gentle-wave"
            x="48"
            y="0"
            fill={role === "client" ? "rgba(16, 185, 129, 0.1)" : "rgba(99, 102, 241, 0.1)"}
          />
          <use href="#gentle-wave" x="48" y="3" fill="rgba(168, 85, 247, 0.15)" />
          <use
            href="#gentle-wave"
            x="48"
            y="5"
            fill={role === "client" ? "rgba(5, 150, 105, 0.2)" : "rgba(59, 130, 246, 0.2)"}
          />
          <use href="#gentle-wave" x="48" y="7" fill="rgba(10, 15, 41, 1)" />
        </g>
      </svg>

      {/* Top header */}
      <div className="absolute top-6 left-0 right-0 px-4 sm:px-8 flex justify-between items-center z-20">
        <Link href="/" className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-sm shadow-lg border border-white/10 transition-colors duration-500 ${
              role === "client"
                ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/30"
                : "bg-gradient-to-br from-indigo-500 to-purple-600 shadow-indigo-500/30"
            }`}
          >
            A
          </div>
          <span className="font-jakarta font-black text-lg tracking-tight text-white hidden sm:block">Aidvisora</span>
        </Link>
        <div className="flex gap-6 text-sm font-bold">
          {!token && (
            <button
              type="button"
              onClick={() => {
                setRole(role === "advisor" ? "client" : "advisor");
                setMessage("");
              }}
              className="text-slate-400 hover:text-white transition-colors min-h-[44px] px-2"
            >
              {role === "advisor" ? "Jsem klient" : "Jsem poradce"}
            </button>
          )}
          <Link href="/" className="text-slate-400 hover:text-white transition-colors min-h-[44px] px-2 inline-flex items-center">
            Zjistit více
          </Link>
        </div>
      </div>

      {/* Přihlašovací karta */}
      {isMounted && (
        <div className="relative z-10 w-full max-w-[440px] px-6 animate-card">
          {/* Přepínač rolí nad kartou */}
          {!token && (
            <div className="flex bg-white/5 border border-white/10 rounded-full p-1 mb-8 mx-auto w-fit backdrop-blur-md shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setRole("advisor");
                  setIsLogin(true);
                  setMessage("");
                }}
                className={`px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all duration-300 ${
                  role === "advisor" ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30" : "text-slate-400 hover:text-white"
                }`}
              >
                Poradce
              </button>
              <button
                type="button"
                onClick={() => {
                  setRole("client");
                  setIsLogin(true);
                  setMessage("");
                }}
                className={`px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all duration-300 ${
                  role === "client" ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30" : "text-slate-400 hover:text-white"
                }`}
              >
                Klient
              </button>
            </div>
          )}

          <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[32px] p-8 md:p-10 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] shadow-indigo-900/20 relative overflow-hidden">
            <div className="flex flex-col items-center mb-8">
              <div
                className={`w-14 h-14 rounded-[16px] flex items-center justify-center text-white font-black text-2xl shadow-xl border border-white/20 mb-5 transition-colors duration-500 ${
                  role === "client"
                    ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/30"
                    : "bg-gradient-to-br from-indigo-500 to-purple-600 shadow-indigo-500/30"
                }`}
              >
                A
              </div>
              <h1 className="font-jakarta text-2xl md:text-3xl font-bold text-white tracking-tight mb-2 text-center">
                {token
                  ? "Registrace do klientské zóny"
                  : role === "client"
                    ? "Klientský portál"
                    : isLogin
                      ? "Vítejte zpět"
                      : "Založit účet"}
              </h1>
              <p className="text-slate-400 text-sm font-medium text-center">
                {token
                  ? "Dokončete registraci a vstupte do klientské zóny."
                  : role === "client"
                    ? "Přihlaste se ke svým smlouvám a financím."
                    : isLogin
                      ? "Přihlaste se do svého pracovního prostředí."
                      : "Začněte využívat CRM ještě dnes."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {token && (
                <label className="flex items-center gap-2 text-sm text-white/90">
                  <input
                    type="checkbox"
                    checked={gdprConsent}
                    onChange={(e) => setGdprConsent(e.target.checked)}
                    required
                  />
                  Souhlasím s{" "}
                  <Link href="/gdpr" target="_blank" rel="noopener noreferrer" className="font-bold hover:underline opacity-90">
                    zpracováním osobních údajů (GDPR)
                  </Link>
                </label>
              )}

              {role === "advisor" && !isLogin && !token && (
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">
                    Jméno a příjmení
                  </label>
                  <div className="relative group">
                    <input
                      type="text"
                      required
                      placeholder="Např. Martin Novák"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      enterKeyHint="next"
                      className="glass-input w-full pl-4 pr-4 py-3.5 rounded-xl text-sm font-bold"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">
                  E-mail
                </label>
                <div className="relative group">
                  <div
                    className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 transition-colors ${
                      role === "client" ? "group-focus-within:text-emerald-400" : "group-focus-within:text-indigo-400"
                    }`}
                  >
                    <Mail size={18} />
                  </div>
                  <input
                    type="email"
                    required
                    placeholder="jmeno@email.cz"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    inputMode="email"
                    autoComplete="email"
                    enterKeyHint="next"
                    className={`glass-input w-full pl-11 pr-4 py-3.5 rounded-xl text-sm font-bold ${role === "client" ? "client-focus" : ""}`}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2 ml-1">
                  <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Heslo</label>
                  {isLogin && !token && (
                    <Link
                      href="/forgot-password"
                      className={`text-xs font-bold transition-colors ${
                        role === "client" ? "text-emerald-400 hover:text-emerald-300" : "text-indigo-400 hover:text-indigo-300"
                      }`}
                    >
                      Zapomněli jste?
                    </Link>
                  )}
                </div>
                <div className="relative group">
                  <div
                    className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 transition-colors ${
                      role === "client" ? "group-focus-within:text-emerald-400" : "group-focus-within:text-indigo-400"
                    }`}
                  >
                    <Lock size={18} />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    enterKeyHint="go"
                    className={`glass-input w-full pl-11 pr-12 py-3.5 rounded-xl text-sm font-bold ${role === "client" ? "client-focus" : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-2 pl-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors"
                    aria-label={showPassword ? "Skrýt heslo" : "Zobrazit heslo"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {hasError && (
                <>
                  <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 flex items-start gap-3 text-rose-400 animate-in fade-in slide-in-from-top-2">
                    <AlertCircle size={18} className="shrink-0 mt-0.5" />
                    <p className="text-xs font-medium leading-relaxed">{message}</p>
                  </div>
                  {(errorParam === "auth_error" || errorParam === "database_error") && (
                    <p className="mt-2 text-sm text-slate-400">
                      <button
                        type="button"
                        onClick={async () => {
                          const supabase = createClient();
                          await supabase.auth.signOut();
                          window.location.href = "/prihlaseni";
                        }}
                        className="font-medium text-indigo-400 hover:text-indigo-300 underline hover:no-underline"
                      >
                        Odhlásit se a zkusit znovu
                      </button>
                    </p>
                  )}
                </>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className={`w-full mt-2 text-white font-black uppercase tracking-widest text-sm py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-70 group ${
                  role === "client"
                    ? "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                    : "bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 shadow-[0_0_20px_rgba(99,102,241,0.3)]"
                }`}
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    {token
                      ? "Vstoupit do klientské zóny"
                      : role === "client"
                        ? "Vstoupit do portálu"
                        : isLogin
                          ? "Přihlásit se"
                          : "Vytvořit účet"}
                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 mb-6 flex items-center gap-4 opacity-50">
              <div className="h-[1px] bg-white flex-1" />
              <span className="text-[10px] font-black uppercase tracking-widest text-white">Nebo</span>
              <div className="h-[1px] bg-white flex-1" />
            </div>

            <button
              type="button"
              onClick={() => handleOAuthSignIn("google")}
              className="w-full flex items-center justify-center gap-3 py-3.5 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl text-white font-bold text-sm transition-colors shadow-sm"
            >
              <GoogleIcon /> Pokračovat s Google
            </button>

            {role === "advisor" && !token && (
              <p className="mt-8 text-center text-sm font-medium text-slate-400">
                {isLogin ? "Nemáte ještě účet?" : "Již máte účet?"}
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(!isLogin);
                    setMessage("");
                  }}
                  className="ml-2 text-indigo-400 font-bold hover:text-indigo-300 hover:underline transition-all"
                >
                  {isLogin ? "Zaregistrujte se" : "Přihlaste se"}
                </button>
              </p>
            )}

            {role === "client" && !token && (
              <p className="mt-8 text-center text-xs font-medium text-slate-400 leading-relaxed">
                Přístup do klientské zóny zakládá výhradně váš finanční poradce. Pokud účet nemáte, prosím kontaktujte ho.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="relative mt-8 w-full px-4 sm:px-8 pb-[calc(var(--safe-area-bottom)+1rem)] flex justify-center sm:justify-between items-center z-20 text-[11px] font-black uppercase tracking-widest text-slate-500">
        <div className="hidden sm:block">© 2026 Aidvisora s.r.o.</div>
        <div className="flex gap-6 hover:[&>a]:text-white">
          <Link href="/gdpr" className="transition-colors flex items-center gap-1.5 min-h-[44px] px-1">
            <ShieldCheck size={14} /> GDPR
          </Link>
          <Link href="/" className="transition-colors min-h-[44px] px-1 inline-flex items-center">
            Zpět na úvod
          </Link>
        </div>
      </div>
    </div>
  );
}

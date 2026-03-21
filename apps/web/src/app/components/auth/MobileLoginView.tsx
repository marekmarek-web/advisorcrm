"use client";

import Link from "next/link";
import { AlertCircle, ArrowRight, ChevronLeft, Eye, EyeOff, Lock, Mail, ScanFace } from "lucide-react";
import { useKeyboardAware } from "@/lib/ui/useKeyboardAware";
import { AppleIcon, GoogleIcon } from "./loginIcons";
import type { AidvisoraLoginState } from "./useAidvisoraLogin";

const IS_BIOMETRIC_UI = true;

export function MobileLoginView({ login }: { login: AidvisoraLoginState }) {
  const { keyboardInset, keyboardOpen } = useKeyboardAware();
  const {
    token,
    role,
    setRole,
    isLogin,
    setIsLogin,
    showPassword,
    setShowPassword,
    isLoading,
    email,
    setEmail,
    password,
    setPassword,
    name,
    setName,
    gdprConsent,
    setGdprConsent,
    message,
    setMessage,
    isMounted,
    isClient,
    hasError,
    formRef,
    handleSubmit,
    handleOAuthSignIn,
    handleBiometricLogin,
  } = login;

  const inputClass = `w-full pl-12 pr-12 py-4 bg-white/10 border border-white/10 rounded-[20px] text-base font-bold text-white outline-none focus:bg-white/15 focus:ring-4 transition-all placeholder:text-slate-400 placeholder:font-medium backdrop-blur-md ${
    isClient ? "focus:border-emerald-400 focus:ring-emerald-500/20" : "focus:border-indigo-400 focus:ring-indigo-500/20"
  }`;

  return (
    <div className="min-h-dvh w-full bg-[#060918] relative overflow-hidden flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@500;700;800;900&display=swap');
        .font-sans { font-family: 'Inter', sans-serif; }
        .font-display { font-family: 'Plus Jakarta Sans', sans-serif; }

        @keyframes float-slow {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(20px, 30px); }
        }

        @keyframes subtle-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }

        .animate-subtle-shake { animation: subtle-shake 0.3s ease-in-out; }
        .orb-1 { animation: float-slow 15s ease-in-out infinite; }
        .orb-2 { animation: float-slow 18s ease-in-out infinite reverse; }
        .mobile-waves { position: absolute; bottom: 0; left: 0; width: 100%; height: 120px; z-index: 0; }
        .parallax > use { animation: move-forever 25s cubic-bezier(.55,.5,.45,.5) infinite; }
        .parallax > use:nth-child(1) { animation-delay: -2s; animation-duration: 7s; }
        .parallax > use:nth-child(2) { animation-delay: -3s; animation-duration: 10s; }
        .parallax > use:nth-child(3) { animation-delay: -4s; animation-duration: 13s; }
        @keyframes move-forever { 0% { transform: translate3d(-90px,0,0); } 100% { transform: translate3d(85px,0,0); } }
        .hide-scroll::-webkit-scrollbar { display: none; }
        .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="absolute inset-0 z-0 pointer-events-none transition-colors duration-700">
        <div
          className={`absolute top-0 left-0 w-[150%] h-[50%] blur-[100px] rounded-full orb-1 -translate-x-1/4 -translate-y-1/4 transition-colors duration-700 ${
            role === "client" ? "bg-emerald-600/20" : "bg-indigo-600/30"
          }`}
        />
        <div className="absolute top-1/3 right-[-20%] w-[100%] h-[40%] bg-purple-600/20 blur-[80px] rounded-full orb-2" />
        <svg className="mobile-waves opacity-80" xmlns="http://www.w3.org/2000/svg" viewBox="0 24 150 28" preserveAspectRatio="none">
          <defs>
            <path id="gentle-wave-mobile" d="M-160 44c30 0 58-18 88-18s 58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z" />
          </defs>
          <g className="parallax transition-colors duration-700">
            <use href="#gentle-wave-mobile" x="48" y="0" fill={role === "client" ? "rgba(16, 185, 129, 0.15)" : "rgba(99, 102, 241, 0.15)"} />
            <use href="#gentle-wave-mobile" x="48" y="3" fill="rgba(168, 85, 247, 0.2)" />
            <use href="#gentle-wave-mobile" x="48" y="5" fill="rgba(10, 15, 41, 1)" />
          </g>
        </svg>
      </div>

      {isMounted && (
        <div
          className={`flex-1 flex flex-col relative z-10 overflow-y-auto hide-scroll px-6 pb-8 ${keyboardOpen ? "pt-14" : "pt-16"}`}
          style={{ paddingBottom: `calc(var(--safe-area-bottom) + ${keyboardInset}px + 1rem)` }}
        >
          {!isLogin && (
            <button
              type="button"
              onClick={() => setIsLogin(true)}
              className="absolute top-14 left-4 p-2 text-white hover:bg-white/10 rounded-full transition-colors min-h-[44px] min-w-[44px]"
              aria-label="Zpět na přihlášení"
            >
              <ChevronLeft size={24} />
            </button>
          )}

          <div className="flex bg-white/10 p-1 rounded-full w-fit mx-auto mb-6 backdrop-blur-md border border-white/10 shadow-lg">
            <button
              type="button"
              onClick={() => {
                setRole("advisor");
                setIsLogin(true);
                setMessage("");
              }}
              className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-300 min-h-[44px] ${
                !isClient ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-white"
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
              className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-300 min-h-[44px] ${
                isClient ? "bg-emerald-600 text-white shadow-md" : "text-slate-400 hover:text-white"
              }`}
            >
              Klient
            </button>
          </div>

          <div className="flex flex-col items-center mb-10 animate-in fade-in duration-500">
            <img
              src="/Aidvisora logo.png"
              alt="Aidvisora"
              className="w-[220px] max-w-[82%] mb-5 object-contain"
              style={{ filter: "brightness(0) invert(1)" }}
            />
            <h1 className="font-display text-3xl font-black text-white tracking-tight mb-2 text-center">
              {isClient ? "Klientská zóna" : isLogin ? "Vítejte zpět" : "Založit účet"}
            </h1>
            <p className="text-slate-400 text-sm font-medium text-center max-w-[250px]">
              {isClient ? "Přihlaste se ke svým financím." : isLogin ? "Přihlaste se do pracovního prostředí." : "Získejte přehled o svých klientech."}
            </p>
          </div>

          <form ref={formRef} onSubmit={handleSubmit} className="w-full space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 flex-1 flex flex-col">
            {token && (
              <label className="flex items-center gap-2 text-sm text-white/90">
                <input type="checkbox" checked={gdprConsent} onChange={(e) => setGdprConsent(e.target.checked)} required />
                Souhlasím s{" "}
                <Link href="/gdpr" target="_blank" rel="noopener noreferrer" className="font-bold hover:underline opacity-90">
                  GDPR
                </Link>
              </label>
            )}

            {!isLogin && !isClient && (
              <div>
                <div className="relative group">
                  <div
                    className={`absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-slate-400 transition-colors ${
                      isClient ? "group-focus-within:text-emerald-400" : "group-focus-within:text-indigo-400"
                    }`}
                  >
                    <span className="font-bold font-display text-lg">@</span>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Jméno a příjmení"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            <div>
              <div className="relative group">
                <div
                  className={`absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-slate-400 transition-colors ${
                    isClient ? "group-focus-within:text-emerald-400" : "group-focus-within:text-indigo-400"
                  }`}
                >
                  <Mail size={20} />
                </div>
                <input
                  type="email"
                  required
                  placeholder="Váš e-mail"
                  inputMode="email"
                  autoCapitalize="none"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <div className="relative group">
                <div
                  className={`absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-slate-400 transition-colors ${
                    isClient ? "group-focus-within:text-emerald-400" : "group-focus-within:text-indigo-400"
                  }`}
                >
                  <Lock size={20} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Heslo"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-5 flex items-center text-slate-400 hover:text-white transition-colors min-h-[44px] min-w-[44px] justify-center"
                  aria-label={showPassword ? "Skrýt heslo" : "Zobrazit heslo"}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {isLogin && (
                <div className="flex justify-end mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = "/forgot-password";
                    }}
                    className={`text-xs font-bold transition-colors py-2 min-h-[44px] ${
                      isClient ? "text-emerald-400 hover:text-emerald-300" : "text-indigo-400 hover:text-indigo-300"
                    }`}
                  >
                    Zapomněli jste heslo?
                  </button>
                </div>
              )}
            </div>

            {hasError && (
              <div className="flex items-center justify-center gap-2 text-rose-300 bg-rose-500/10 border border-rose-500/20 py-3.5 px-4 rounded-xl text-sm font-bold animate-in fade-in animate-subtle-shake backdrop-blur-sm">
                <AlertCircle size={18} className="shrink-0" />
                {message || "Nesprávný e-mail nebo heslo"}
              </div>
            )}

            <div className="flex gap-3 pt-2 mt-auto pb-4">
              <button
                type="submit"
                disabled={isLoading}
                className={`flex-1 text-white font-black uppercase tracking-widest text-sm py-4 rounded-[20px] shadow-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-70 group min-h-[48px] ${
                  isClient ? "bg-gradient-to-r from-emerald-500 to-teal-600 shadow-emerald-600/30" : "bg-gradient-to-r from-indigo-600 to-purple-600 shadow-indigo-600/30"
                }`}
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    {isClient ? "Vstoupit" : isLogin ? "Přihlásit" : "Vytvořit účet"}
                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>

              {isLogin && IS_BIOMETRIC_UI && (
                <button
                  type="button"
                  onClick={handleBiometricLogin}
                  className="w-14 h-14 min-w-[56px] min-h-[56px] bg-white/10 backdrop-blur-md border border-white/20 rounded-[20px] flex items-center justify-center text-white hover:bg-white/20 transition-all active:scale-[0.95] shrink-0"
                  aria-label="Přihlásit pomocí biometrie"
                >
                  <ScanFace size={24} strokeWidth={1.5} />
                </button>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4 opacity-40">
                <div className="h-[1px] bg-white flex-1" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white">Nebo</span>
                <div className="h-[1px] bg-white flex-1" />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleOAuthSignIn("apple")}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 min-h-[48px] bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 rounded-[16px] text-white font-bold text-sm transition-colors active:scale-[0.98]"
                >
                  <AppleIcon /> Apple
                </button>
                <button
                  type="button"
                  onClick={() => handleOAuthSignIn("google")}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 min-h-[48px] bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 rounded-[16px] text-white font-bold text-sm transition-colors active:scale-[0.98]"
                >
                  <GoogleIcon /> Google
                </button>
              </div>
            </div>

            {!isClient ? (
              <div className="text-center pt-4">
                <p className="text-sm font-medium text-slate-400">
                  {isLogin ? "Nemáte ještě účet?" : "Zpět na přihlášení."}
                  <button
                    type="button"
                    onClick={() => {
                      setIsLogin(!isLogin);
                      setMessage("");
                    }}
                    className="ml-2 text-white font-bold hover:text-indigo-300 transition-colors min-h-[44px] px-1"
                  >
                    {isLogin ? "Založit účet" : "Přihlásit se"}
                  </button>
                </p>
              </div>
            ) : (
              <div className="text-center pt-4">
                <p className="text-[11px] font-medium text-slate-500 leading-relaxed px-4">
                  Přístup do klientské zóny zakládá váš poradce. Pokud nemáte údaje, kontaktujte jej.
                </p>
              </div>
            )}
          </form>
        </div>
      )}

      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1/3 max-w-[120px] h-1.5 bg-white/30 rounded-full z-50 md:hidden" aria-hidden />
    </div>
  );
}

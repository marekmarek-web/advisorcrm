"use client";

import Link from "next/link";
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
import { GoogleIcon } from "./loginIcons";
import type { AidvisoraLoginState } from "./useAidvisoraLogin";

export function WebLoginView({ login }: { login: AidvisoraLoginState }) {
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
  } = login;

  return (
    <div className="min-h-dvh bg-[#0a0f29] font-inter text-slate-300 flex flex-col justify-center items-center relative overflow-hidden selection:bg-indigo-500 selection:text-white px-4 py-8 sm:py-12">
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

        .waves-web {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 25vh;
          min-height: 150px;
          max-height: 300px;
          z-index: 0;
        }
        .parallax-web > use { animation: move-forever 25s cubic-bezier(.55,.5,.45,.5) infinite; }
        .parallax-web > use:nth-child(1) { animation-delay: -2s; animation-duration: 7s; }
        .parallax-web > use:nth-child(2) { animation-delay: -3s; animation-duration: 10s; }
        .parallax-web > use:nth-child(3) { animation-delay: -4s; animation-duration: 13s; }
        .parallax-web > use:nth-child(4) { animation-delay: -5s; animation-duration: 20s; }
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

      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div
          className={`absolute top-[-10%] left-[-10%] w-[50%] h-[50%] blur-[120px] rounded-full orb-1 transition-colors duration-700 ${
            role === "client" ? "bg-emerald-600/20" : "bg-indigo-600/20"
          }`}
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

      <svg
        className="waves-web"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 24 150 28"
        preserveAspectRatio="none"
        shapeRendering="auto"
      >
        <defs>
          <path id="gentle-wave-web" d="M-160 44c30 0 58-18 88-18s 58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z" />
        </defs>
        <g className="parallax-web transition-colors duration-700">
          <use href="#gentle-wave-web" x="48" y="0" fill={role === "client" ? "rgba(16, 185, 129, 0.1)" : "rgba(99, 102, 241, 0.1)"} />
          <use href="#gentle-wave-web" x="48" y="3" fill="rgba(168, 85, 247, 0.15)" />
          <use href="#gentle-wave-web" x="48" y="5" fill={role === "client" ? "rgba(5, 150, 105, 0.2)" : "rgba(59, 130, 246, 0.2)"} />
          <use href="#gentle-wave-web" x="48" y="7" fill="rgba(10, 15, 41, 1)" />
        </g>
      </svg>

      <div className="absolute top-6 left-0 right-0 px-4 sm:px-8 flex justify-between items-center z-20 max-w-[1200px] mx-auto w-full">
        <Link href="/" className="flex items-center min-h-[44px] min-w-[44px]">
          <img
            src="/logos/Aidvisora%20logo%20new.png"
            alt="Aidvisora"
            className="h-9 w-auto max-w-[200px] object-contain object-left shrink-0 brightness-0 invert"
          />
        </Link>
        {!token && (
          <div className="flex flex-wrap gap-4 sm:gap-6 text-sm font-bold justify-end">
            <button
              type="button"
              onClick={() => {
                setRole(role === "advisor" ? "client" : "advisor");
                setIsLogin(true);
                setMessage("");
              }}
              className="text-slate-400 hover:text-white transition-colors min-h-[44px] px-1"
            >
              {role === "advisor" ? "Jsem klient" : "Jsem poradce"}
            </button>
            <Link href="/#aplikace" className="text-slate-400 hover:text-white transition-colors min-h-[44px] flex items-center">
              Zjistit více
            </Link>
          </div>
        )}
      </div>

      {isMounted && (
        <div className="relative z-10 w-full max-w-[440px] px-2 sm:px-6 animate-card mt-16 sm:mt-12">
          <div className="flex bg-white/5 border border-white/10 rounded-full p-1 mb-8 mx-auto w-fit backdrop-blur-md shadow-lg">
            <button
              type="button"
              onClick={() => {
                setRole("advisor");
                setIsLogin(true);
                setMessage("");
              }}
              className={`px-5 sm:px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all duration-300 min-h-[44px] ${
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
              className={`px-5 sm:px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all duration-300 min-h-[44px] ${
                role === "client" ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30" : "text-slate-400 hover:text-white"
              }`}
            >
              Klient
            </button>
          </div>

          <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[32px] p-6 sm:p-10 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] shadow-indigo-900/20 relative overflow-hidden">
            <div className="flex flex-col items-center mb-8">
              <img
                src="/logos/Aidvisora%20logo%20new.png"
                alt="Aidvisora"
                className="h-12 w-auto max-w-[200px] mb-5 object-contain brightness-0 invert"
              />
              <h1 className="font-jakarta text-2xl md:text-3xl font-bold text-white tracking-tight mb-2 text-center">
                {role === "client" ? "Klientský portál" : isLogin ? "Vítejte zpět" : "Založit účet"}
              </h1>
              <p className="text-slate-400 text-sm font-medium text-center">
                {role === "client"
                  ? "Přihlaste se ke svým smlouvám a financím."
                  : isLogin
                    ? "Přihlaste se do svého pracovního prostředí."
                    : "Začněte využívat CRM budoucnosti ještě dnes."}
              </p>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
              {token && (
                <label className="flex items-start gap-3 text-sm text-white/90">
                  <input type="checkbox" className="mt-1" checked={gdprConsent} onChange={(e) => setGdprConsent(e.target.checked)} required />
                  <span>
                    Souhlasím s{" "}
                    <Link href="/gdpr" target="_blank" rel="noopener noreferrer" className="font-bold text-indigo-300 hover:underline">
                      GDPR
                    </Link>
                  </span>
                </label>
              )}

              {role === "advisor" && !isLogin && (
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">Jméno a příjmení</label>
                  <input
                    type="text"
                    required
                    placeholder="Např. Martin Novák"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="glass-input w-full pl-4 pr-4 py-3.5 rounded-xl text-sm font-bold min-h-[48px]"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">E-mail</label>
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
                    autoComplete="email"
                    className={`glass-input w-full pl-11 pr-4 py-3.5 rounded-xl text-sm font-bold min-h-[48px] ${
                      role === "client" ? "client-focus" : ""
                    }`}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2 ml-1 gap-2">
                  <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Heslo</label>
                  {isLogin && (
                    <Link
                      href="/forgot-password"
                      className={`text-xs font-bold transition-colors min-h-[44px] flex items-center ${
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
                    className={`glass-input w-full pl-11 pr-12 py-3.5 rounded-xl text-sm font-bold min-h-[48px] ${
                      role === "client" ? "client-focus" : ""
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-slate-300 transition-colors min-h-[48px] min-w-[44px]"
                    aria-label={showPassword ? "Skrýt heslo" : "Zobrazit heslo"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {hasError && (
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 flex items-start gap-3 text-rose-400 animate-in fade-in slide-in-from-top-2">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <p className="text-xs font-medium leading-relaxed">{message || "Přihlášení se nezdařilo. Zkontrolujte údaje nebo to zkuste znovu po chvíli."}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className={`w-full mt-2 text-white font-black uppercase tracking-widest text-sm py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-70 group min-h-[52px] ${
                  role === "client"
                    ? "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                    : "bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 shadow-[0_0_20px_rgba(99,102,241,0.3)]"
                }`}
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    {role === "client" ? "Vstoupit do portálu" : isLogin ? "Přihlásit se" : "Vytvořit účet"}
                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            {!token && (
              <>
                <div className="mt-8 mb-6 flex items-center gap-4 opacity-50">
                  <div className="h-[1px] bg-white flex-1" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-white">Nebo</span>
                  <div className="h-[1px] bg-white flex-1" />
                </div>

                <button
                  type="button"
                  onClick={() => handleOAuthSignIn("google")}
                  className="w-full flex items-center justify-center gap-3 py-3.5 min-h-[48px] bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl text-white font-bold text-sm transition-colors shadow-sm"
                >
                  <GoogleIcon /> Pokračovat s Google
                </button>
              </>
            )}

            {token && (
              <p className="mt-6 text-center text-xs font-medium text-slate-400 leading-relaxed">
                Pro dokončení pozvánky použijte e-mail a heslo (stejný e-mail jako v pozvánce). Přihlášení přes Google zde
                není k dispozici.
              </p>
            )}

            {role === "advisor" && (
              <p className="mt-8 text-center text-sm font-medium text-slate-400">
                {isLogin ? "Nemáte ještě účet?" : "Již máte účet?"}
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(!isLogin);
                    setMessage("");
                  }}
                  className="ml-2 text-indigo-400 font-bold hover:text-indigo-300 hover:underline transition-all min-h-[44px] px-1"
                >
                  {isLogin ? "Zaregistrujte se" : "Přihlaste se"}
                </button>
              </p>
            )}

            {role === "client" && (
              <p className="mt-8 text-center text-xs font-medium text-slate-400 leading-relaxed">
                Přístup do klientské zóny zakládá výhradně váš finanční poradce. Pokud účet nemáte, prosím kontaktujte ho.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="absolute bottom-6 w-full px-4 sm:px-8 flex flex-col sm:flex-row justify-center sm:justify-between items-center gap-4 z-20 text-[11px] text-slate-500 max-w-[1200px] mx-auto left-0 right-0">
        <div className="flex flex-col gap-1 normal-case font-medium tracking-normal text-center sm:text-left text-[10px] sm:text-[11px]">
          <span>
            © {new Date().getFullYear()} Aidvisora. Všechna práva vyhrazena.
          </span>
          <span>
            Vytvořila{" "}
            <a
              href="https://www.m2digitalagency.cz"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-white underline-offset-2 hover:underline font-semibold"
            >
              M2DigitalAgency
            </a>
          </span>
        </div>
        <div className="flex flex-wrap gap-6 justify-center font-black uppercase tracking-widest hover:[&>a]:text-white">
          <Link href="/gdpr" className="transition-colors flex items-center gap-1.5 min-h-[44px]">
            <ShieldCheck size={14} /> GDPR
          </Link>
          <Link href="/" className="transition-colors min-h-[44px] flex items-center">
            Zpět na úvod
          </Link>
        </div>
      </div>
    </div>
  );
}

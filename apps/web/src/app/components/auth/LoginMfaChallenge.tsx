"use client";

import { Shield } from "lucide-react";

type Props = {
  isLoading: boolean;
  message: string;
  code: string;
  setCode: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  variant: "web" | "mobile";
};

export function LoginMfaChallenge({ isLoading, message, code, setCode, onSubmit, onCancel, variant }: Props) {
  const isWeb = variant === "web";
  return (
    <form
      onSubmit={onSubmit}
      className={
        isWeb
          ? "w-full max-w-md space-y-5 animate-card"
          : "w-full max-w-md mx-auto space-y-5 mt-4"
      }
    >
      <div className={`flex items-center gap-3 ${isWeb ? "text-white" : "text-white"}`}>
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl ${isWeb ? "bg-indigo-500/30" : "bg-indigo-500/40"}`}
        >
          <Shield className="h-6 w-6 text-indigo-300" />
        </div>
        <div>
          <h2 className={`font-bold ${isWeb ? "text-lg" : "text-xl"}`}>Dvoufázové ověření</h2>
          <p className={`text-sm ${isWeb ? "text-slate-400" : "text-slate-400"}`}>
            Zadejte 6místný kód z aplikace Authenticator. 2FA jste si zapnuli dobrovolně jako dodatečnou ochranu účtu.
          </p>
        </div>
      </div>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="123456"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
        className={
          isWeb
            ? "glass-input w-full rounded-2xl px-5 py-4 text-center text-2xl font-mono font-bold tracking-[0.3em]"
            : "w-full py-4 bg-white/10 border border-white/10 rounded-[20px] text-center text-2xl font-mono font-bold tracking-[0.3em] text-white outline-none focus:bg-white/15 focus:ring-4 focus:ring-indigo-500/20"
        }
        autoFocus
      />
      {message ? (
        <p className={`text-sm flex items-center gap-2 ${isWeb ? "text-rose-300" : "text-rose-300"}`}>
          {message}
        </p>
      ) : null}
      <div className="flex flex-col gap-3">
        <button
          type="submit"
          disabled={isLoading || code.replace(/\s/g, "").length < 6}
          className={
            isWeb
              ? "w-full rounded-2xl bg-indigo-600 py-4 text-sm font-black uppercase tracking-widest text-white hover:bg-indigo-500 disabled:opacity-50 min-h-[52px]"
              : "w-full py-4 rounded-[20px] bg-indigo-600 text-white font-black uppercase tracking-widest text-sm disabled:opacity-50 min-h-[52px]"
          }
        >
          {isLoading ? "Ověřuji…" : "Pokračovat"}
        </button>
        <button
          type="button"
          disabled={isLoading}
          onClick={onCancel}
          className={
            isWeb
              ? "w-full rounded-2xl border border-white/20 py-3 text-sm font-semibold text-slate-300 hover:bg-white/5 min-h-[44px]"
              : "w-full py-3 rounded-[20px] border border-white/20 text-sm font-semibold text-slate-300 min-h-[44px]"
          }
        >
          Zpět k přihlášení
        </button>
      </div>
    </form>
  );
}

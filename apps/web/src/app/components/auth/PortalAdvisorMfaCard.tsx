"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { syncMembershipMfaEnabled } from "@/app/actions/auth";
import { Shield } from "lucide-react";
import type { Factor } from "@supabase/supabase-js";

/**
 * TOTP 2FA v nastavení účtu — vyžaduje zapnuté MFA v projektu Supabase (Auth → MFA).
 */
export function PortalAdvisorMfaCard() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollFactorId, setEnrollFactorId] = useState<string | null>(null);
  const [enrollQr, setEnrollQr] = useState<string | null>(null);
  const [enrollSecret, setEnrollSecret] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data, error: listErr } = await supabase.auth.mfa.listFactors();
    if (listErr) {
      setError(listErr.message);
      setFactors([]);
    } else {
      setError(null);
      setFactors([...(data?.totp ?? [])]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const verifiedFactors = factors.filter((f) => f.status === "verified");

  const startEnroll = async () => {
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { data, error: enErr } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Aidvisora",
    });
    setBusy(false);
    if (enErr) {
      setError(enErr.message);
      return;
    }
    if (data?.id && data.totp) {
      setEnrollFactorId(data.id);
      setEnrollQr(data.totp.qr_code ?? null);
      setEnrollSecret(data.totp.secret ?? null);
      setVerifyCode("");
      setEnrolling(true);
    }
  };

  const cancelEnroll = () => {
    setEnrolling(false);
    setEnrollFactorId(null);
    setEnrollQr(null);
    setEnrollSecret(null);
    setVerifyCode("");
    setError(null);
  };

  const completeEnroll = async () => {
    if (!enrollFactorId || verifyCode.replace(/\s/g, "").length < 6) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enrollFactorId });
    if (chErr || !ch?.id) {
      setError(chErr?.message ?? "Nepodařilo se zahájit ověření. Zkuste znovu.");
      setBusy(false);
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: enrollFactorId,
      challengeId: ch.id,
      code: verifyCode.replace(/\s/g, ""),
    });
    setBusy(false);
    if (vErr) {
      setError(vErr.message);
      return;
    }
    cancelEnroll();
    await refresh();
    try {
      await syncMembershipMfaEnabled(true);
    } catch {
      /* přihlášení v pořádku; DB zrcadlo je best-effort */
    }
  };

  const removeFactor = async (factorId: string) => {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: uErr } = await supabase.auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (uErr) setError(uErr.message);
    else {
      await refresh();
      try {
        await syncMembershipMfaEnabled(false);
      } catch {
        /* best-effort */
      }
    }
  };

  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-[24px] shadow-lg text-white">
      <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center mb-4">
        <Shield size={20} className="text-white" />
      </div>
      <h3 className="font-bold text-lg mb-2">Dvoufázové ověření</h3>
      <p className="text-sm font-medium text-slate-300 leading-relaxed mb-3">
        V Aidvisoře pracujete s citlivými údaji — <strong className="text-white">doporučujeme</strong> zapnout 2FA
        (TOTP z aplikace Authenticator, 1Password apod.). Zapnutí je <strong className="text-white">dobrovolné</strong>;
        bez 2FA nesete vyšší riziko zneužití účtu při úniku hesla nebo kompromitaci zařízení. Po zapnutí zadáte kód z aplikace při každém přihlášení — i po Google nebo Apple.
      </p>
      <p className="text-xs text-slate-400 leading-relaxed mb-4 border-t border-white/10 pt-3">
        Zabezpečení vašeho účtu, hesla a zařízení je především na vás. Aidvisora neručí za následky rozhodnutí nepoužívat
        2FA ani za škody vzniklé neoprávněným přístupem v takovém případě.
      </p>

      {loading ? (
        <p className="text-sm text-slate-400">Načítám stav…</p>
      ) : enrolling && enrollFactorId ? (
        <div className="space-y-4">
          <p className="text-xs text-slate-300">Naskenujte QR kód nebo zadejte tajný klíč ručně:</p>
          {enrollQr ? (
            <div className="rounded-xl bg-white p-2 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={enrollQr} alt="QR kód pro TOTP" className="w-40 h-40" />
            </div>
          ) : null}
          {enrollSecret ? (
            <p className="text-xs font-mono break-all bg-black/30 rounded-lg p-2 text-slate-200">{enrollSecret}</p>
          ) : null}
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6místný kód"
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
            className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-slate-500 text-sm"
          />
          {error ? <p className="text-xs text-rose-300">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || verifyCode.replace(/\s/g, "").length < 6}
              onClick={() => void completeEnroll()}
              className="flex-1 bg-indigo-500 hover:bg-indigo-400 py-3 rounded-xl text-xs font-black uppercase tracking-widest min-h-[44px] disabled:opacity-50"
            >
              {busy ? "Ověřuji…" : "Potvrdit a aktivovat"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={cancelEnroll}
              className="px-4 py-3 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 min-h-[44px]"
            >
              Zrušit
            </button>
          </div>
        </div>
      ) : (
        <>
          {verifiedFactors.length > 0 ? (
            <div className="space-y-3 mb-4">
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">Aktivní faktor</p>
              <ul className="space-y-2">
                {verifiedFactors.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between gap-2 text-sm bg-white/5 rounded-xl px-3 py-2"
                  >
                    <span className="truncate">{f.friendly_name ?? "Authenticator"}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeFactor(f.id)}
                      className="text-rose-300 text-xs font-bold shrink-0 hover:underline disabled:opacity-50"
                    >
                      Odebrat
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {error ? <p className="text-xs text-rose-300 mb-3">{error}</p> : null}
          {verifiedFactors.length === 0 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void startEnroll()}
              className="w-full bg-white text-slate-900 py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-50 transition-colors min-h-[44px] disabled:opacity-50"
            >
              {busy ? "Připravuji…" : "Aktivovat 2FA"}
            </button>
          ) : (
            <p className="text-xs text-slate-400">2FA je zapnuté. Pro nový faktor nejdřív odeberte stávající.</p>
          )}
        </>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Calendar, Loader2, CheckCircle } from "lucide-react";

type Slot = { start: string; end: string };

type MetaResponseOk = {
  ok: true;
  timezone: string;
  advisorName: string;
  companyName: string;
  slotMinutes: number;
  slots: Slot[];
};

type MetaResponseErr = {
  ok: false;
  error?: string;
  message?: string;
};

type MetaResponse = MetaResponseOk | MetaResponseErr;

function formatSlotLabel(isoStart: string): string {
  const d = new Date(isoStart);
  return d.toLocaleString("cs-CZ", {
    timeZone: "Europe/Prague",
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PublicBookingClient({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<MetaResponseOk | null>(null);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [clientName, setClientName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/booking/${encodeURIComponent(token)}?days=21`, {
        cache: "no-store",
      });
      const data = (await res.json()) as MetaResponse;
      if (!res.ok || !data.ok) {
        const errBody = data as MetaResponseErr;
        setError(
          typeof errBody.message === "string"
            ? errBody.message
            : "Tento odkaz není platný nebo rezervace není aktivní.",
        );
        setMeta(null);
        return;
      }
      setMeta(data);
    } catch {
      setError("Nepodařilo se načíst dostupné termíny. Zkuste to prosím znovu.");
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) {
      setSubmitErr("Vyberte termín.");
      return;
    }
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const res = await fetch(`/api/public/booking/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: selected.start,
          end: selected.end,
          clientName: clientName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          note: note.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setSubmitErr(
          typeof data.message === "string" ? data.message : "Odeslání se nezdařilo. Zkuste jiný termín.",
        );
        if (res.status === 409) void load();
        return;
      }
      setDone(true);
    } catch {
      setSubmitErr("Síťová chyba. Zkuste to znovu.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-4">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" aria-hidden />
        <p className="text-sm text-slate-600">Načítám volné termíny…</p>
      </div>
    );
  }

  if (error || !meta) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center px-4 max-w-md mx-auto text-center">
        <p className="text-slate-800 font-semibold mb-2">Rezervace není k dispozici</p>
        <p className="text-sm text-slate-600">{error}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center px-4 max-w-md mx-auto text-center gap-4">
        <CheckCircle className="w-14 h-14 text-emerald-600" aria-hidden />
        <h1 className="text-xl font-bold text-slate-900">Děkujeme</h1>
        <p className="text-sm text-slate-600">
          Termín byl zapsán. Poradce uvidí schůzku ve svém kalendáři v Aidvisoře. Případně vás bude kontaktovat.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8 pb-16">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-700">
          <Calendar className="w-6 h-6" aria-hidden />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900 leading-tight">Domluva termínu schůzky</h1>
          <p className="text-sm text-slate-600">
            {meta.advisorName}
            {meta.companyName ? ` · ${meta.companyName}` : ""}
          </p>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Časy jsou v časovém pásmu {meta.timezone}. Tento formulář slouží jen k domluvě administrativního termínu, nejedná se o investiční doporučení.
      </p>
      <p className="text-xs text-slate-500 mb-3">
        Zobrazují se jen <strong className="font-semibold text-slate-600">volné termíny</strong> — konkrétní obsazené schůzky (s kým nebo o čem jsou) se neukazují.
      </p>
      <p className="text-xs text-slate-500 mb-6">
        Nejčasnější nabízené časy začínají nejdříve za 2 hodiny od teď (kvůli přípravě).
      </p>

      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">1. Vyberte termín</h2>
      {meta.slots.length === 0 ? (
        <p className="text-sm text-slate-600 mb-6">V tomto období nejsou volné sloty. Zkuste to později nebo kontaktujte poradce přímo.</p>
      ) : (
        <ul className="flex flex-col gap-2 mb-8 max-h-[min(50vh,420px)] overflow-y-auto pr-1">
          {meta.slots.map((s) => {
            const active = selected?.start === s.start && selected?.end === s.end;
            return (
              <li key={s.start}>
                <button
                  type="button"
                  onClick={() => setSelected(s)}
                  className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-semibold min-h-[48px] transition-colors ${
                    active
                      ? "border-indigo-600 bg-indigo-50 text-indigo-900"
                      : "border-slate-200 bg-white text-slate-800 hover:border-indigo-300"
                  }`}
                >
                  {formatSlotLabel(s.start)} ({meta.slotMinutes} min)
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">2. Vaše údaje</h2>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Jméno a příjmení</label>
          <input
            required
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm min-h-[48px]"
            autoComplete="name"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">E-mail</label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm min-h-[48px]"
            autoComplete="email"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Telefon (volitelně)</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm min-h-[48px]"
            autoComplete="tel"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Poznámka (volitelně)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm resize-none"
          />
        </div>
        {submitErr && <p className="text-sm text-rose-600">{submitErr}</p>}
        <button
          type="submit"
          disabled={submitting || meta.slots.length === 0}
          className="w-full py-3.5 rounded-xl bg-indigo-600 text-white text-sm font-bold min-h-[48px] hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
          {submitting ? "Odesílám…" : "Odeslat rezervaci"}
        </button>
      </form>
    </div>
  );
}

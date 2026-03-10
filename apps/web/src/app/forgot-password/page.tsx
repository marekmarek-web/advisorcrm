"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const supabase = createClient();
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${baseUrl}/auth/callback?next=/portal/today`,
    });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "linear-gradient(60deg, #10121f 0%, #1a1c2e 100%)", fontFamily: "var(--wp-font)" }}
    >
      <div className="w-full max-w-md p-10 rounded-[32px] border border-white/10 bg-[#1a1c2e]/70 shadow-2xl shadow-indigo-500/10 backdrop-blur-xl text-white">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500 flex items-center justify-center text-2xl font-bold mb-4 shadow-lg shadow-indigo-500/30">
            W
          </div>
          <h1 className="font-light text-2xl md:text-3xl tracking-[2px] mb-1">Aidvisora</h1>
          <p className="text-sm tracking-[1px] opacity-80">Obnovení hesla</p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <p className="text-sm text-white/90">
              Pokud účet s e-mailem <strong>{email}</strong> existuje, poslali jsme na něj odkaz pro obnovení hesla.
            </p>
            <p className="text-xs text-white/60">
              Zkontrolujte e-mail (i složku spam). Odkaz je platný omezenou dobu.
            </p>
            <Link href="/" className="block w-full py-3.5 rounded-xl font-bold text-center bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
              Zpět na přihlášení
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-2 opacity-80">E-mail</label>
              <input
                type="email"
                placeholder="vas@email.cz"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl border border-white/10 bg-white/5 focus:border-indigo-400 focus:bg-white/10 text-white placeholder-white/30 outline-none transition-all"
                required
              />
            </div>
            {message && (
              <p className="text-sm text-red-200 bg-red-500/20 border border-red-400/30 rounded-lg px-3 py-2">
                {message}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors"
            >
              {loading ? "Odesílám…" : "Poslat odkaz na obnovení hesla"}
            </button>
            <Link href="/" className="block text-center text-sm text-white/70 hover:text-white transition-colors">
              ← Zpět na přihlášení
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}

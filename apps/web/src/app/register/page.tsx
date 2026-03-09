"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { acceptClientInvitation } from "@/app/actions/auth";

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-400">Načítám…</div>}>
      <RegisterPageInner />
    </Suspense>
  );
}

function RegisterPageInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [gdprConsent, setGdprConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setLoading(false);
      setMessage(error.message);
      return;
    }
    if (token) {
      const result = await acceptClientInvitation(token, gdprConsent);
      if (!result.ok) {
        setMessage(result.error);
        setLoading(false);
        return;
      }
      window.location.href = "/client";
      return;
    }
    window.location.href = "/register/complete";
  }

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-monday-surface border-b border-monday-border px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg text-monday-text">
          Advisor CRM
        </Link>
        <Link href="/login" className="text-monday-text-muted hover:text-monday-text text-sm">
          Už mám účet
        </Link>
      </nav>

      <main className="flex-1 max-w-md mx-auto px-4 py-12 w-full">
        <div className="rounded-xl border border-monday-border bg-monday-surface p-6 md:p-8">
          <h1 className="text-xl font-bold mb-6 text-monday-text">
            {token ? "Registrace do Client Zone" : "Registrace poradce"}
          </h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-monday-text-muted mb-1">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-monday-border bg-monday-surface px-4 py-2.5 text-monday-text focus:outline-none focus:ring-2 focus:ring-monday-blue/50"
                placeholder="vas@email.cz"
                required
              />
            </div>
            {token && (
              <label className="flex items-center gap-2 text-sm text-monday-text">
                <input type="checkbox" checked={gdprConsent} onChange={(e) => setGdprConsent(e.target.checked)} required={!!token} />
                Souhlasím s <a href="/gdpr" target="_blank" rel="noopener noreferrer" className="text-monday-blue">zpracováním osobních údajů (GDPR)</a>
              </label>
            )}
            <div>
              <label className="block text-sm font-semibold text-monday-text-muted mb-1">Heslo</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-monday-border bg-monday-surface px-4 py-2.5 text-monday-text focus:outline-none focus:ring-2 focus:ring-monday-blue/50"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
            {message && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {message}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-2.5 font-semibold text-white bg-monday-blue disabled:opacity-50"
            >
              {loading ? "Vytvářím účet…" : token ? "Vstoupit do Client Zone" : "Zaregistrovat se"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

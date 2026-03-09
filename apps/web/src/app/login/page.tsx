"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-400">Načítám…</div>}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/portal/today";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    // Vždy projít ensureMembership (vytvoří tenant + membership, pokud neexistují)
    const nextPath = next.startsWith("/") ? next : "/portal/today";
    window.location.href = `/register/complete?next=${encodeURIComponent(nextPath)}`;
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

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-white border-b border-[var(--brand-border)] px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg" style={{ color: "var(--brand-main)" }}>
          Advisor CRM
        </Link>
        <Link href="/" className="text-slate-600 hover:text-slate-900 text-sm">
          ← Zpět
        </Link>
      </nav>

      <main className="flex-1 max-w-md mx-auto px-4 py-12 w-full">
        <div className="rounded-xl border border-[var(--brand-border)] bg-white p-6 md:p-8 shadow-sm">
          <h1 className="text-xl font-bold mb-6" style={{ color: "var(--brand-dark)" }}>
            Přihlášení
          </h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-4 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/50"
                placeholder="vas@email.cz"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Heslo</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-[var(--brand-border)] bg-white px-4 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]/50"
                placeholder="••••••••"
                required
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
              className="w-full rounded-xl py-2.5 font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--brand-main)" }}
            >
              {loading ? "Přihlašuji…" : "Přihlásit se"}
            </button>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full rounded-xl py-2.5 font-semibold border border-monday-border bg-monday-surface text-monday-text hover:bg-monday-row-hover"
            >
              Přihlásit se přes Google
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-monday-text-muted">
            Nemáte účet? <Link href="/register" className="text-monday-blue font-medium">Zaregistrujte se</Link>
          </p>
        </div>
      </main>
    </div>
  );
}

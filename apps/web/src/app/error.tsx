"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isProd = process.env.NODE_ENV === "production";
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50">
      <div className="max-w-lg w-full rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-slate-800 mb-2">Došlo k chybě</h1>
        <p className="text-slate-600 text-sm mb-4">
          {error.message || "Na serveru došlo k neočekávané chybě."}
        </p>
        {error.digest && (
          <p className="text-slate-400 text-xs font-mono mb-4">Digest: {error.digest}</p>
        )}
        {isProd && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-left text-sm text-amber-900 mb-4">
            <p className="font-semibold mb-2">Co zkontrolovat na Vercelu:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <strong>Logy:</strong> Vercel → Projekt → Deployments → poslední deploy → „Functions“ nebo „Runtime Logs“ – tam uvidíš skutečnou chybu.
              </li>
              <li>
                <strong>DATABASE_URL:</strong> Musí být celý connection string včetně hostu (např. <code className="bg-white/80 px-1 rounded">...@db.xxx.supabase.co:5432/postgres</code>). Pro Vercel je vhodný pooler na portu 6543.
              </li>
              <li>
                <strong>Schéma DB:</strong> V Supabase musí být vytvořené tabulky – lokálně spusť <code className="bg-white/80 px-1 rounded">pnpm db:apply-schema</code> s <code className="bg-white/80 px-1 rounded">DATABASE_URL</code> nastavenou na ten samý Supabase projekt.
              </li>
              <li>
                <strong>Redirect URLs:</strong> V Supabase → Authentication → URL Configuration přidej produkční URL (např. <code className="bg-white/80 px-1 rounded">https://tvuj-projekt.vercel.app/**</code>).
              </li>
            </ul>
          </div>
        )}
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Zkusit znovu
          </button>
          <a
            href="/"
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200"
          >
            Úvodní stránka
          </a>
        </div>
      </div>
    </div>
  );
}

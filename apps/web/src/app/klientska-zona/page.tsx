import Link from "next/link";
import { ArrowRight, User } from "lucide-react";

/**
 * Vstupní stránka klientské zóny. Odkaz "Pro klienty" na landingu sem vede.
 * Po přihlášení s next=/client jde klient do /client, poradce je přesměrován do /portal.
 */
export default function KlientskaZonaPage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{
        background: "linear-gradient(180deg, #060918 0%, #0f1424 50%, #060918 100%)",
        fontFamily: "var(--wp-font)",
      }}
    >
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 border border-white/20 text-white mb-8">
          <User size={28} />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4 font-[family-name:var(--wp-font-jakarta)]">
          Klientská zóna
        </h1>
        <p className="text-slate-400 text-lg mb-10 leading-relaxed">
          Přihlaste se do svého klientského účtu. Zde máte přehled smluv, dokumentů a komunikace s vaším poradcem.
        </p>
        <div className="flex flex-col gap-4">
          <Link
            href="/prihlaseni?next=/client"
            className="flex items-center justify-center gap-2 w-full py-4 px-6 bg-white text-[#0a0f29] rounded-full text-base font-bold hover:bg-slate-200 transition-all min-h-[48px]"
          >
            Přihlásit se do klientské zóny
            <ArrowRight size={18} />
          </Link>
          <p className="text-slate-500 text-sm">
            Jste finanční poradce?{" "}
            <Link href="/prihlaseni" className="text-indigo-400 hover:text-white transition-colors font-medium">
              Přihlaste se do portálu
            </Link>
          </p>
        </div>
        <p className="mt-10 text-slate-500 text-sm">
          Do klientské zóny vás může přivést také odkaz od vašeho poradce (e-mail s přihlášením).
        </p>
        <Link href="/" className="inline-block mt-6 text-slate-400 hover:text-white text-sm transition-colors">
          ← Zpět na úvodní stránku
        </Link>
      </div>
    </div>
  );
}

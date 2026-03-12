/**
 * Úvodní stránka Aidvisora – přihlášení s animovaným pozadím.
 * Témata: Barevný přechod a Tmavá elegance. Funkční přihlášení a tlačítko Otevřít Portál.
 * V demo režimu (NEXT_PUBLIC_SKIP_AUTH=true) přesměruje rovnou na /portal.
 */
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LandingLoginPage } from "./components/LandingLoginPage";

function LandingFallback() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "linear-gradient(60deg, #10121f 0%, #1a1c2e 100%)", fontFamily: "var(--wp-font)" }}
    >
      <p className="text-white/70 text-sm">Načítám…</p>
    </div>
  );
}

export default function HomePage() {
  if (process.env.NEXT_PUBLIC_SKIP_AUTH === "true") {
    redirect("/portal");
  }
  return (
    <Suspense fallback={<LandingFallback />}>
      <LandingLoginPage />
    </Suspense>
  );
}

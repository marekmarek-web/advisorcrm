/**
 * Úvodní stránka Advisor CRM – přihlášení s animovaným pozadím.
 * Témata: Barevný přechod a Tmavá elegance. Funkční přihlášení a tlačítko Otevřít Portál.
 */
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
  return (
    <Suspense fallback={<LandingFallback />}>
      <LandingLoginPage />
    </Suspense>
  );
}

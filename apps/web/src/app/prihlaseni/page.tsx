/**
 * Stránka přihlášení a registrace – formulář s motivy (Barevný/Tmavý).
 * Z hlavní landing stránky (/) sem vedou odkazy Přihlásit se a Založit účet.
 */
import { Suspense } from "react";
import { LandingLoginPage } from "../components/LandingLoginPage";

function LoginFallback() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "linear-gradient(60deg, #10121f 0%, #1a1c2e 100%)", fontFamily: "var(--wp-font)" }}
    >
      <p className="text-white/70 text-sm">Načítám…</p>
    </div>
  );
}

export default function PrihlaseniPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LandingLoginPage />
    </Suspense>
  );
}

/**
 * Hlavní (landing) stránka Aidvisora – marketingová stránka před přihlášením.
 * Přihlášení/registrace je na /prihlaseni. V demo režimu (NEXT_PUBLIC_SKIP_AUTH=true) přesměruje rovnou na /portal.
 */
import { redirect } from "next/navigation";
import { Suspense } from "react";
import PremiumLandingPage from "./components/PremiumLandingPage";

function LandingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0f29]">
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
      <PremiumLandingPage />
    </Suspense>
  );
}

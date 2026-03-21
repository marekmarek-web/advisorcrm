/**
 * Hlavní (landing) stránka Aidvisora – marketingová stránka před přihlášením.
 * Přihlášení/registrace je na /prihlaseni. V demo režimu (NEXT_PUBLIC_SKIP_AUTH=true) přesměruje rovnou na /portal.
 */
import { redirect } from "next/navigation";
import { Suspense } from "react";
import PremiumLandingPage from "./components/PremiumLandingPage";
import { createClient } from "@/lib/supabase/server";

function LandingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0f29]">
      <p className="text-white/70 text-sm">Načítám…</p>
    </div>
  );
}

export default async function HomePage() {
  if (process.env.NEXT_PUBLIC_SKIP_AUTH === "true") {
    redirect("/portal");
  }

  // If OAuth lands on "/" after login, immediately continue to app flow.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    redirect("/register/complete?next=/portal/today");
  }

  return (
    <Suspense fallback={<LandingFallback />}>
      <PremiumLandingPage />
    </Suspense>
  );
}

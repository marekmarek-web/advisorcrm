/**
 * Hlavní (landing) stránka Aidvisora – marketingová stránka před přihlášením.
 * Přihlášení/registrace je na /prihlaseni. V demo režimu (NEXT_PUBLIC_SKIP_AUTH=true) přesměruje rovnou na /portal.
 */
import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/server";

const PremiumLandingPage = dynamic(() => import("./components/PremiumLandingPage"), {
  loading: () => (
    <div className="min-h-[40vh] flex items-center justify-center text-slate-500 text-sm" aria-busy="true">
      Načítám…
    </div>
  ),
});
import { LANDING_FAQS } from "@/data/landing-faq";

function LandingFaqJsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: LANDING_FAQS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
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
    <>
      <LandingFaqJsonLd />
      <PremiumLandingPage />
    </>
  );
}

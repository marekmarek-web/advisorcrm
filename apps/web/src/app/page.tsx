/**
 * Hlavní (landing) stránka Aidvisora – marketingová stránka před přihlášením.
 * Přihlášení/registrace je na /prihlaseni. V demo režimu (NEXT_PUBLIC_SKIP_AUTH=true) přesměruje rovnou na /portal.
 *
 * Auth-based redirect pro už přihlášeného uživatele řeší proxy (AIDV header)
 * i `<NativeOAuthDeepLinkBridge />`. Landing route zůstává bez auth dat a bez
 * request-time závislostí, aby byla jednoduchá a stabilní i v dev režimu.
 */
import { redirect } from "next/navigation";
import PremiumLandingPage from "./components/PremiumLandingPage";
import { LANDING_FAQS } from "@/data/landing-faq";

/**
 * Musí být statické literály (Turbopack / segment config); podmíněný export podle NODE_ENV build zablokuje.
 * ISR ~300s v produkci. V `next dev` se změny promítají přes Fast Refresh i bez `force-dynamic`.
 */
export const dynamic = "force-static";
export const revalidate = 300;

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

export default function HomePage() {
  if (process.env.NEXT_PUBLIC_SKIP_AUTH === "true") {
    redirect("/portal");
  }

  return (
    <>
      <LandingFaqJsonLd />
      <PremiumLandingPage />
    </>
  );
}

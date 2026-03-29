/**
 * Hlavní (landing) stránka Aidvisora – marketingová stránka před přihlášením.
 * Přihlášení/registrace je na /prihlaseni. V demo režimu (NEXT_PUBLIC_SKIP_AUTH=true) přesměruje rovnou na /portal.
 */
import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { headers } from "next/headers";
import { AIDV_PROXY_AUTH_USER_HEADER } from "@/lib/auth/proxy-headers";

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

  // Session už ověřil proxy.ts — nepoužívat druhé getUser (TTFB).
  const headerList = await headers();
  if (headerList.get(AIDV_PROXY_AUTH_USER_HEADER)) {
    redirect("/register/complete?next=/portal/today");
  }

  return (
    <>
      <LandingFaqJsonLd />
      <PremiumLandingPage />
    </>
  );
}

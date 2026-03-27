import type { Metadata } from "next";
import termsBlocks from "@/app/legal/content/terms-blocks.json";
import type { LegalBlock } from "@/app/legal/LegalBlocks";
import { LegalBlocks } from "@/app/legal/LegalBlocks";
import { LegalDocumentLayout } from "@/app/legal/LegalDocumentLayout";
import { LEGAL_EFFECTIVE_CS } from "@/app/legal/legal-meta";

export const metadata: Metadata = {
  title: "Obchodní podmínky | Aidvisora",
  description: `B2B obchodní podmínky služby Aidvisora pro finanční poradce. Účinnost od ${LEGAL_EFFECTIVE_CS}.`,
};

export default function TermsPage() {
  const blocks = termsBlocks as LegalBlock[];

  return (
    <LegalDocumentLayout
      title="Obchodní podmínky a rámec poskytování služby Aidvisora"
      documentSlug="terms"
      showPricingLink
    >
      <LegalBlocks blocks={blocks} />
    </LegalDocumentLayout>
  );
}

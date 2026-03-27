import type { Metadata } from "next";
import dpaBlocks from "@/app/legal/content/dpa-blocks.json";
import type { LegalBlock } from "@/app/legal/LegalBlocks";
import { LegalBlocks } from "@/app/legal/LegalBlocks";
import { LegalDocumentLayout } from "@/app/legal/LegalDocumentLayout";
import { LEGAL_EFFECTIVE_CS } from "@/app/legal/legal-meta";

export const metadata: Metadata = {
  title: "Zpracovatelská smlouva (DPA) | Aidvisora",
  description: `Zpracovatelská smlouva podle čl. 28 GDPR pro provoz platformy Aidvisora. Účinnost dokumentace od ${LEGAL_EFFECTIVE_CS}.`,
};

export default function DpaPage() {
  const blocks = dpaBlocks as LegalBlock[];

  return (
    <LegalDocumentLayout
      title="Zpracovatelská smlouva (DPA) pro Aidvisoru"
      documentSlug="dpa"
      showPricingLink={false}
    >
      <LegalBlocks blocks={blocks} />
    </LegalDocumentLayout>
  );
}

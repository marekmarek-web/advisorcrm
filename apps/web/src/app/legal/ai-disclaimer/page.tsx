import type { Metadata } from "next";
import aiBlocks from "@/app/legal/content/ai-disclaimer-blocks.json";
import type { LegalBlock } from "@/app/legal/LegalBlocks";
import { LegalBlocks } from "@/app/legal/LegalBlocks";
import { LegalDocumentLayout } from "@/app/legal/LegalDocumentLayout";
import { LEGAL_EFFECTIVE_CS } from "@/app/legal/legal-meta";

export const metadata: Metadata = {
  title: "AI režim a disclaimer | Aidvisora",
  description: `Veřejná příloha k internímu použití funkcí AI v Aidvisoře. Účinnost od ${LEGAL_EFFECTIVE_CS}.`,
};

export default function AiDisclaimerPage() {
  const blocks = aiBlocks as LegalBlock[];

  return (
    <LegalDocumentLayout title="Příloha – AI režim, disclaimer a zakázané formulace" documentSlug="ai-disclaimer">
      <LegalBlocks blocks={blocks} />
    </LegalDocumentLayout>
  );
}

import type { Metadata } from "next";
import privacyBlocks from "@/app/legal/content/privacy-blocks.json";
import type { LegalBlock } from "@/app/legal/LegalBlocks";
import { LegalBlocks } from "@/app/legal/LegalBlocks";
import { LegalDataExportNotice } from "@/app/legal/LegalDataExportNotice";
import { LegalDocumentLayout } from "@/app/legal/LegalDocumentLayout";
import { LegalSubprocessorsTable } from "@/app/legal/LegalSubprocessorsTable";
import { LEGAL_EFFECTIVE_CS } from "@/app/legal/legal-meta";

export const metadata: Metadata = {
  title: "Zásady zpracování osobních údajů | Aidvisora",
  description: `Informace o zpracování osobních údajů v souvislosti se službou Aidvisora. Účinnost od ${LEGAL_EFFECTIVE_CS}.`,
};

function splitAtSection7(blocks: LegalBlock[]) {
  const idx = blocks.findIndex((b) => b.type === "h1" && b.text.startsWith("7. Předání"));
  if (idx === -1) return { head: blocks, tail: [] as LegalBlock[] };
  return { head: blocks.slice(0, idx), tail: blocks.slice(idx) };
}

export default function PrivacyPage() {
  const all = privacyBlocks as LegalBlock[];
  const { head, tail } = splitAtSection7(all);

  return (
    <LegalDocumentLayout title="Zásady zpracování osobních údajů Aidvisora" documentSlug="privacy">
      <LegalBlocks blocks={head} />
      <LegalSubprocessorsTable />
      <LegalBlocks blocks={tail} sectionIdPrefix="p2-" />
      <LegalDataExportNotice />
    </LegalDocumentLayout>
  );
}

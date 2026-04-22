import { requireClientZoneAuth } from "@/lib/auth/require-auth";
import { getDocumentsForClient } from "@/app/actions/documents";
import { DocumentPreviewToggle } from "./DocumentPreviewToggle";
import { ClientDocumentUpload } from "../ClientDocumentUpload";
import { EmptyState } from "@/app/components/ui/primitives";
import { Download, File, MessageSquarePlus } from "lucide-react";

export default async function ClientDocumentsPage() {
  const auth = await requireClientZoneAuth();
  if (!auth.contactId) return null;

  const documentsList = await getDocumentsForClient(auth.contactId);

  return (
    <div className="space-y-6 client-fade-in">
      <div>
        <h2 className="text-3xl font-display font-black text-[color:var(--wp-text)] tracking-tight">
          Trezor dokumentů
        </h2>
        <p className="text-sm font-medium text-[color:var(--wp-text-secondary)] mt-2">
          Bezpečné sdílení dokumentů mezi vámi a poradcem.
        </p>
      </div>

      <div className="bg-white rounded-[24px] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden">
        <div className="px-6 sm:px-8 py-6 border-b border-[color:var(--wp-surface-card-border)] flex items-center justify-between bg-[color:var(--wp-main-scroll-bg)]/30 rounded-t-[24px]">
          <h3 className="text-xl font-black text-[color:var(--wp-text)]">Správce souborů</h3>
          <span className="text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
            {documentsList.length} dokumentů
          </span>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          <ClientDocumentUpload />

          {documentsList.length === 0 ? (
            <EmptyState
              tone="card"
              size="md"
              icon={File}
              title="Zatím nemáte žádné dokumenty"
              description="Po nahrání dokumentu se zde zobrazí jeho přehled."
              primaryAction={{
                label: "Napište poradci",
                href: "/client/messages",
                icon: MessageSquarePlus,
                variant: "link",
              }}
            />
          ) : (
            <div className="space-y-3">
              {documentsList.map((document) => {
                const isPdf = document.mimeType === "application/pdf";
                return (
                  <div
                    key={document.id}
                    className="flex items-center gap-4 p-4 border border-[color:var(--wp-surface-card-border)] rounded-2xl hover:bg-[color:var(--wp-main-scroll-bg)] transition-colors"
                  >
                    <div className="p-3 bg-rose-50 text-rose-500 rounded-xl">
                      <File size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-sm text-[color:var(--wp-text)] truncate">{document.name}</h4>
                      <p className="text-xs font-bold text-[color:var(--wp-text-tertiary)]">
                        {new Date(document.createdAt).toLocaleDateString("cs-CZ")}
                      </p>
                      {document.tags && document.tags.length > 0 && (() => {
                        const clientVisibleTags = document.tags.filter((tag) => {
                          if (!tag || typeof tag !== "string") return false;
                          const t = tag.trim().toLowerCase();
                          // Odstranit interní technické štítky
                          if (t === "ai-smlouva" || t === "ai_smlouva") return false;
                          if (t.startsWith("review:")) return false;
                          if (t.startsWith("ai-review:")) return false;
                          if (t.startsWith("source:")) return false;
                          return true;
                        });
                        if (clientVisibleTags.length === 0) return null;
                        return (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {clientVisibleTags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-block rounded-lg bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                      {isPdf && <DocumentPreviewToggle documentId={document.id} />}
                    </div>
                    <a
                      href={`/api/documents/${document.id}/download`}
                      className="p-2 text-[color:var(--wp-text-tertiary)] hover:text-indigo-600 transition-colors"
                      aria-label={`Stáhnout ${document.name}`}
                    >
                      <Download size={20} />
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

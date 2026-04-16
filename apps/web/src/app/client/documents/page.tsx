import Link from "next/link";
import { requireClientZoneAuth } from "@/lib/auth/require-auth";
import { getDocumentsForClient } from "@/app/actions/documents";
import { DocumentPreviewToggle } from "./DocumentPreviewToggle";
import { ClientDocumentUpload } from "../ClientDocumentUpload";
import { Download, File } from "lucide-react";

export default async function ClientDocumentsPage() {
  const auth = await requireClientZoneAuth();
  if (!auth.contactId) return null;

  const documentsList = await getDocumentsForClient(auth.contactId);

  return (
    <div className="space-y-6 client-fade-in">
      <div>
        <h2 className="text-3xl font-display font-black text-slate-900 tracking-tight">
          Trezor dokumentů
        </h2>
        <p className="text-sm font-medium text-slate-500 mt-2">
          Bezpečné sdílení dokumentů mezi vámi a poradcem.
        </p>
      </div>

      <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 sm:px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/30 rounded-t-[32px]">
          <h3 className="text-xl font-black text-slate-900">Správce souborů</h3>
          <span className="text-xs font-black uppercase tracking-widest text-slate-400">
            {documentsList.length} dokumentů
          </span>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          <ClientDocumentUpload />

          {documentsList.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-center">
              <p className="text-slate-500 text-sm font-medium">
                Zatím nemáte žádné dokumenty.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Máte dotaz?{" "}
                <Link href="/client/messages" className="text-indigo-600 font-bold hover:underline">
                  Napište poradci
                </Link>
                .
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {documentsList.map((document) => {
                const isPdf = document.mimeType === "application/pdf";
                return (
                  <div
                    key={document.id}
                    className="flex items-center gap-4 p-4 border border-slate-100 rounded-2xl hover:bg-slate-50 transition-colors"
                  >
                    <div className="p-3 bg-rose-50 text-rose-500 rounded-xl">
                      <File size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-sm text-slate-800 truncate">{document.name}</h4>
                      <p className="text-xs font-bold text-slate-400">
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
                      className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
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

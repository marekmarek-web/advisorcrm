import Link from "next/link";
import { requireAuth } from "@/lib/auth/require-auth";
import { getDocumentsForClient } from "@/app/actions/documents";
import { DocumentPreviewToggle } from "./DocumentPreviewToggle";

export default async function ClientDocumentsPage() {
  const auth = await requireAuth();
  if (auth.roleName !== "Client" || !auth.contactId) return null;

  const documentsList = await getDocumentsForClient(auth.contactId);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold text-monday-text">Dokumenty</h1>

      {documentsList.length === 0 ? (
        <div className="rounded-xl border border-monday-border bg-monday-surface p-6 text-center">
          <p className="text-monday-text-muted text-sm">
            Žádné dokumenty ke stažení.
          </p>
          <p className="mt-2 text-sm text-monday-text-muted">
            Máte dotaz?{" "}
            <Link href="/client/messages" className="text-monday-blue font-medium hover:underline">
              Napište poradci
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {documentsList.map((d) => {
            const isPdf = d.mimeType === "application/pdf";
            return (
              <div
                key={d.id}
                className="rounded-xl border border-monday-border bg-monday-surface p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-monday-text">{d.name}</span>
                    <span className="text-monday-text-muted text-xs ml-2">
                      {new Date(d.createdAt).toLocaleDateString("cs-CZ")}
                    </span>
                    {d.tags && d.tags.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {d.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-block rounded-lg bg-monday-blue/10 px-2 py-0.5 text-[11px] font-medium text-monday-blue"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={`/api/documents/${d.id}/download`}
                      className="rounded-[6px] px-3 py-1.5 text-xs font-semibold text-white bg-monday-blue hover:opacity-90"
                    >
                      Stáhnout
                    </a>
                  </div>
                </div>
                {isPdf && <DocumentPreviewToggle documentId={d.id} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

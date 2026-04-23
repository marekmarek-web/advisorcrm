"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveContentSource,
  previewArticleMetadata,
  deleteContentSource,
  type ContentSourceRow,
} from "@/app/actions/email-content-sources";
import type { ArticleMetadata } from "@/lib/email/article-fetcher-shared";
import { ARTICLE_FETCHER_ALLOWED_DOMAINS } from "@/lib/email/article-fetcher-shared";
import { useConfirm } from "@/app/components/ConfirmDialog";

type Props = {
  initialSources: ContentSourceRow[];
};

export default function ContentSourcesClient({ initialSources }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Smazat zdroj",
      message: "Opravdu smazat tento zdroj?",
      confirmLabel: "Smazat",
      variant: "destructive",
    });
    if (!ok) return;
    await deleteContentSource(id);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-[color:var(--wp-text-tertiary)]">
          Povolené domény: {ARTICLE_FETCHER_ALLOWED_DOMAINS.join(", ")}
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--wp-primary)] px-4 py-2 text-sm font-black text-white shadow-sm hover:brightness-110"
        >
          + Přidat článek
        </button>
      </div>

      {initialSources.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[color:var(--wp-surface-card-border)] bg-white px-4 py-10 text-center text-sm text-[color:var(--wp-text-tertiary)]">
          Zatím žádné zdroje obsahu. Přidejte odkaz na článek, který budete chtít
          v blízké době použít v newsletteru.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {initialSources.map((s) => (
            <article
              key={s.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-white shadow-sm"
            >
              {s.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.imageUrl}
                  alt=""
                  className="h-40 w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-40 items-center justify-center bg-[color:var(--wp-main-scroll-bg)] text-xs text-[color:var(--wp-text-tertiary)]">
                  bez obrázku
                </div>
              )}
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                  {s.sourceName ?? "—"}
                  {s.isEvergreen ? " · evergreen" : ""}
                </div>
                <h3 className="line-clamp-2 text-sm font-black text-[color:var(--wp-text)]">
                  {s.title ?? s.url}
                </h3>
                {s.description ? (
                  <p className="line-clamp-3 text-xs text-[color:var(--wp-text-secondary)]">
                    {s.description}
                  </p>
                ) : null}
                <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-[11px] text-[color:var(--wp-text-tertiary)]">
                  <a
                    href={s.canonicalUrl ?? s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate font-bold hover:text-[color:var(--wp-primary)]"
                  >
                    {new URL(s.canonicalUrl ?? s.url).hostname.replace(/^www\./, "")}
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDelete(s.id)}
                    className="rounded-lg p-1 hover:bg-rose-50 hover:text-rose-600"
                    aria-label="Smazat"
                    title="Smazat"
                  >
                    ×
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {creating ? (
        <AddSourceModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function AddSourceModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<ArticleMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tags, setTags] = useState("");
  const [isEvergreen, setIsEvergreen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handlePreview = () => {
    setError(null);
    if (!url.trim()) {
      setError("Zadejte URL článku.");
      return;
    }
    startTransition(async () => {
      try {
        const meta = await previewArticleMetadata(url.trim());
        setPreview(meta);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Náhled se nezdařil.");
      }
    });
  };

  const handleSave = () => {
    startTransition(async () => {
      try {
        await saveContentSource({
          url: url.trim(),
          isEvergreen,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        });
        onSaved();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Uložení se nezdařilo.");
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[color:var(--wp-surface-card-border)] px-5 py-3">
          <h2 className="text-base font-black text-[color:var(--wp-text)]">Přidat článek</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-main-scroll-bg)]"
            aria-label="Zavřít"
          >
            ×
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
              URL článku
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://kurzy.cz/..."
                className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white px-3 py-2 text-sm font-bold"
              />
              <button
                type="button"
                onClick={handlePreview}
                disabled={isPending}
                className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white px-3 py-2 text-sm font-bold hover:bg-[color:var(--wp-main-scroll-bg)] disabled:opacity-50"
              >
                Náhled
              </button>
            </div>
            <p className="mt-1 text-[11px] text-[color:var(--wp-text-tertiary)]">
              Povolené domény: {ARTICLE_FETCHER_ALLOWED_DOMAINS.slice(0, 5).join(", ")}…
            </p>
          </div>

          {preview ? (
            <div className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)] p-3">
              <p className="text-[11px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                {preview.sourceName ?? "—"}
              </p>
              <p className="mt-1 text-sm font-black">{preview.title ?? "(bez názvu)"}</p>
              {preview.description ? (
                <p className="mt-1 text-xs text-[color:var(--wp-text-secondary)]">
                  {preview.description}
                </p>
              ) : null}
              {preview.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.imageUrl}
                  alt=""
                  className="mt-2 h-28 w-full rounded-lg object-cover"
                  loading="lazy"
                />
              ) : null}
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
              Štítky (oddělené čárkou)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="hypotéky, sazby"
              className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white px-3 py-2 text-sm font-bold"
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={isEvergreen}
              onChange={(e) => setIsEvergreen(e.target.checked)}
            />
            Evergreen — článek nestárne, lze používat i za měsíce
          </label>

          {error ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[color:var(--wp-surface-card-border)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white px-4 py-2 text-sm font-bold hover:bg-[color:var(--wp-main-scroll-bg)]"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || !url.trim()}
            className="rounded-xl bg-[color:var(--wp-primary)] px-4 py-2 text-sm font-black text-white hover:brightness-110 disabled:opacity-50"
          >
            {isPending ? "Ukládám…" : "Uložit"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

export default function ContactDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { segment: "portal-contacts-detail" },
      extra: { digest: error.digest },
    });
  }, [error]);

  const isProd = process.env.NODE_ENV === "production";
  const isGenericProdMessage =
    isProd &&
    (error.message?.includes("omitted in production") ||
      error.message?.includes("digest") ||
      !error.message);
  const displayMessage = isGenericProdMessage
    ? "Detail kontaktu se nepodařilo načíst. Zkuste znovu nebo se vraťte na seznam kontaktů."
    : (error.message || "Nastala neočekávaná chyba.");

  return (
    <div className="flex min-h-[min(60dvh,480px)] items-center justify-center px-4 py-8">
      <div className="max-w-md rounded-lg border border-monday-border bg-monday-surface p-6 text-center sm:p-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <span className="text-xl text-red-500">!</span>
        </div>
        <h2 className="mb-2 text-lg font-semibold text-monday-text">Něco se pokazilo</h2>
        <p className="mb-4 text-sm text-monday-text-muted">{displayMessage}</p>
        {!isProd && error.digest ? (
          <p className="mb-4 break-all font-mono text-xs text-monday-text-muted">
            Digest: {error.digest}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="min-h-11 rounded-[6px] px-4 py-2.5 text-sm font-semibold text-white bg-monday-blue hover:opacity-90 active:opacity-90"
          >
            Zkusit znovu
          </button>
          <Link
            href="/portal/contacts"
            className="inline-flex min-h-11 items-center justify-center rounded-[6px] px-4 py-2.5 text-sm font-semibold text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-muted)] hover:bg-[color:var(--wp-surface-card-border)]"
          >
            Zpět na kontakty
          </Link>
        </div>
      </div>
    </div>
  );
}

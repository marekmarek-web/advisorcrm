"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="cs">
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <NextError statusCode={0} />
        <p className="mx-auto max-w-md px-4 pb-8 text-center text-sm text-muted-foreground">
          Něco se pokazilo. Zkus obnovit stránku nebo se vrátit na úvod.
        </p>
      </body>
    </html>
  );
}

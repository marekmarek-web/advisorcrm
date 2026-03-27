"use client";

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isProd = process.env.NODE_ENV === "production";
  const isGenericProdMessage =
    isProd &&
    (error.message?.includes("omitted in production") ||
      error.message?.includes("digest") ||
      !error.message);
  const isServerRenderProd =
    isProd &&
    (error.message?.includes("Server Components") ||
      error.message?.includes("server components"));
  const displayMessage = isServerRenderProd
    ? "Načtení portálu selhalo — často jde o nesoulad databáze s nasazenou verzí (např. chybějící migrace u tabulky dokumentů). Zkuste znovu; pokud to trvá, spusťte SQL migrace podle provozní příručky (documents_schema_sync) nebo kontaktujte správce."
    : isGenericProdMessage
      ? "Došlo k chybě na serveru. Zkuste obnovit stránku nebo se vrátit na úvod."
      : (error.message || "Nastala neočekávaná chyba.");

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="rounded-lg border border-monday-border bg-monday-surface p-8 max-w-md text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <span className="text-red-500 text-xl">!</span>
        </div>
        <h2 className="text-lg font-semibold text-monday-text mb-2">Něco se pokazilo</h2>
        <p className="text-monday-text-muted text-sm mb-4">{displayMessage}</p>
        <div className="flex flex-wrap gap-2 justify-center">
          <button
            onClick={reset}
            className="rounded-[6px] px-4 py-2 text-sm font-semibold text-white bg-monday-blue hover:opacity-90"
          >
            Zkusit znovu
          </button>
          <a
            href="/portal/today"
            className="rounded-[6px] px-4 py-2 text-sm font-semibold text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-muted)] hover:bg-[color:var(--wp-surface-card-border)]"
          >
            Přehled portálu
          </a>
          <a href="/" className="rounded-[6px] px-4 py-2 text-sm font-semibold text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-muted)] hover:bg-[color:var(--wp-surface-card-border)]">
            Úvodní stránka
          </a>
        </div>
      </div>
    </div>
  );
}

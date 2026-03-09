"use client";

export default function ClientError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="rounded-lg border border-monday-border bg-monday-surface p-8 max-w-md text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <span className="text-red-500 text-xl">!</span>
        </div>
        <h2 className="text-lg font-semibold text-monday-text mb-2">Něco se pokazilo</h2>
        <p className="text-monday-text-muted text-sm mb-4">
          {error.message || "Nastala neočekávaná chyba."}
        </p>
        <button
          onClick={reset}
          className="rounded-[6px] px-4 py-2 text-sm font-semibold text-white bg-monday-blue hover:opacity-90"
        >
          Zkusit znovu
        </button>
      </div>
    </div>
  );
}

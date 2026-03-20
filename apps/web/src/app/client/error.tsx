"use client";

export default function ClientError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-[420px] client-fade-in">
      <div className="rounded-[28px] border border-slate-200 bg-white p-8 max-w-md text-center shadow-lg">
        <div className="w-14 h-14 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-4">
          <span className="text-rose-500 text-2xl font-black">!</span>
        </div>
        <h2 className="text-xl font-black text-slate-900 mb-2">Něco se pokazilo</h2>
        <p className="text-slate-500 text-sm mb-6">
          {error.message || "Nastala neočekávaná chyba."}
        </p>
        <button
          onClick={reset}
          className="rounded-xl px-5 py-2.5 text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 min-h-[44px]"
        >
          Zkusit znovu
        </button>
      </div>
    </div>
  );
}

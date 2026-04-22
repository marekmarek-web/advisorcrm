"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { captureAppError, getPortalFriendlyErrorMessage } from "@/lib/observability/production-error-ui";

export default function ClientError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    captureAppError(error, {
      boundary: "client-zone",
      route: pathname,
      digest: error.digest,
      tags: { app_zone: "client" },
    });
  }, [error, pathname]);

  const friendly = getPortalFriendlyErrorMessage(error);

  return (
    <div className="flex items-center justify-center min-h-[420px] client-fade-in">
      <div className="rounded-[24px] border border-[color:var(--wp-surface-card-border)] bg-white p-8 max-w-md text-center shadow-lg">
        <div className="w-14 h-14 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-4">
          <span className="text-rose-500 text-2xl font-black">!</span>
        </div>
        <h2 className="text-xl font-black text-[color:var(--wp-text)] mb-2">Něco se pokazilo</h2>
        <p className="text-[color:var(--wp-text-secondary)] text-sm mb-6">{friendly}</p>
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

"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { NewRequestModal } from "../../NewRequestModal";

/**
 * B1.10: Samostatná stránka pro nový požadavek — URL `/client/requests/new`
 * musí být funkční (deep link z e-mailů / bookmark). Místo dřívějšího redirectu
 * otevřeme modal nad fallback layoutem a po zavření vrátíme klienta na seznam
 * požadavků.
 */
export function NewClientRequestStandalone({ defaultCaseType }: { defaultCaseType?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  function handleClose() {
    setOpen(false);
    // Mírně prodlouženo, aby se modal stačil zavřít před přechodem.
    setTimeout(() => router.push("/client/requests"), 50);
  }

  return (
    <div className="space-y-6 client-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            href="/client/requests"
            className="inline-flex items-center gap-1 text-sm font-bold text-indigo-600 hover:underline"
          >
            <ArrowLeft size={16} />
            Zpět na požadavky
          </Link>
          <h2 className="mt-1 text-3xl font-display font-black text-[color:var(--wp-text)] tracking-tight">
            Nový požadavek
          </h2>
          <p className="text-sm text-[color:var(--wp-text-secondary)] mt-1">
            Vyplňte krátký formulář — poradce vás kontaktuje.
          </p>
        </div>
      </div>
      <div className="bg-white rounded-[24px] border border-[color:var(--wp-surface-card-border)] p-6 sm:p-8 shadow-sm text-sm text-[color:var(--wp-text-secondary)]">
        Pokud se okno s formulářem nezobrazilo,{" "}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-bold text-indigo-600 hover:underline"
        >
          klikněte zde a otevřete jej znovu
        </button>
        .
      </div>
      <NewRequestModal open={open} onClose={handleClose} defaultCaseType={defaultCaseType} />
    </div>
  );
}

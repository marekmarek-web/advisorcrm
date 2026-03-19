"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClientPortalRequest } from "@/app/actions/client-portal-requests";
import { CLIENT_REQUEST_TYPES } from "@/app/lib/client-portal/request-types";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { HelpCircle } from "lucide-react";

export function ClientRequestForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [caseType, setCaseType] = useState<string>(CLIENT_REQUEST_TYPES[0].value);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createClientPortalRequest({
        caseType,
        description: description.trim() || null,
      });
      if (result.success) {
        router.push("/client/requests");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="caseType" className="block text-sm font-medium text-monday-text mb-1">
          O co jde?
        </label>
        <CustomDropdown
          value={caseType}
          onChange={setCaseType}
          options={CLIENT_REQUEST_TYPES.map((opt) => ({ id: opt.value, label: opt.label }))}
          placeholder="O co jde?"
          icon={HelpCircle}
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-monday-text mb-1">
          Popis (nepovinné)
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Např. refinancování hypotéky, nové životní pojištění, změna bydlení…"
          className="w-full rounded-[var(--wp-radius-sm)] border border-monday-border bg-monday-surface px-3 py-2.5 text-monday-text text-sm resize-y"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-[var(--wp-radius-sm)] px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-[var(--wp-radius-sm)] bg-monday-blue px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50 min-h-[44px] min-w-[44px]"
        >
          {pending ? "Odesílám…" : "Odeslat požadavek"}
        </button>
        <Link
          href="/client/requests"
          className="inline-flex items-center justify-center rounded-[var(--wp-radius-sm)] border border-monday-border bg-monday-surface px-4 py-2.5 text-sm font-medium text-monday-text hover:bg-monday-row-hover min-h-[44px]"
        >
          Zrušit
        </Link>
      </div>
    </form>
  );
}

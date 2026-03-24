"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/app/components/Toast";
import { AIReviewExtractionShell } from "@/app/components/ai-review/AIReviewExtractionShell";
import { MOCK_EXTRACTION } from "@/lib/ai-review/mock-data";
import type { ExtractionDocument } from "@/lib/ai-review/types";

export default function AIReviewExtractionPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const id = params.id as string;

  const [doc, setDoc] = useState<ExtractionDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      // TODO: Replace with real API call when backend is ready
      // const res = await fetch(`/api/contracts/review/${id}`);
      // const data = await res.json();
      // setDoc(mapToExtractionDocument(data));
      await new Promise((r) => setTimeout(r, 400));
      setDoc({ ...MOCK_EXTRACTION, id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Načtení detailu selhalo.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleBack = useCallback(() => {
    router.push("/portal/contracts/review");
  }, [router]);

  const handleDiscard = useCallback(() => {
    if (window.confirm("Opravdu zahodit tuto extrakci? Tuto akci nelze vrátit.")) {
      toast.showToast("Extrakce zahozena.", "success");
      router.push("/portal/contracts/review");
    }
  }, [router, toast]);

  const handleApprove = useCallback(async () => {
    setIsApproving(true);
    try {
      // TODO: Wire to approveContractReview(id)
      await new Promise((r) => setTimeout(r, 800));
      toast.showToast("Extrakce schválena do CRM.", "success");
      router.push("/portal/contracts/review");
    } catch {
      toast.showToast("Schválení selhalo.", "error");
    } finally {
      setIsApproving(false);
    }
  }, [router, toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f8fafc]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-sm font-bold text-slate-500">
            Načítám AI extrakci…
          </p>
        </div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f8fafc]">
        <div className="flex flex-col items-center gap-3 max-w-sm text-center">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center">
            <svg
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <p className="text-sm font-bold text-slate-800">
            {error ?? "Dokument nenalezen."}
          </p>
          <button
            onClick={handleBack}
            className="text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            Zpět na seznam
          </button>
        </div>
      </div>
    );
  }

  return (
    <AIReviewExtractionShell
      doc={doc}
      onBack={handleBack}
      onDiscard={handleDiscard}
      onApprove={handleApprove}
      isApproving={isApproving}
    />
  );
}

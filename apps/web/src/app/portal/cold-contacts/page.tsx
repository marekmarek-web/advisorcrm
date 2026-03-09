import type { Metadata } from "next";
import { getCallsReport } from "@/app/actions/events";
import { hasOpenAIKey } from "@/app/actions/ai-extract";
import { ColdContactsClient } from "./ColdContactsClient";

export const metadata: Metadata = {
  title: "AI Import",
  description: "Import kontaktů pomocí AI ze schůzek a hovorů.",
};

export default async function ColdContactsPage() {
  const [calls, showAiImport] = await Promise.all([
    getCallsReport(),
    hasOpenAIKey(),
  ]);
  return (
    <div className="p-4 space-y-6">
      <h1 className="text-lg font-semibold text-slate-800">Studené kontakty</h1>
      <ColdContactsClient initialCalls={calls} showAiImport={showAiImport} />
    </div>
  );
}

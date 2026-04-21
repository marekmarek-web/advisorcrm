import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCallsReport } from "@/app/actions/events";
import { isColdContactsEnabled } from "@/lib/portal/cold-contacts-enabled";
import { ColdContactsClient } from "./ColdContactsClient";

export const metadata: Metadata = {
  title: "Studené kontakty",
  description: "Přehled studených kontaktů a telefonátů.",
};

export default async function ColdContactsPage() {
  if (!isColdContactsEnabled()) notFound();
  const calls = await getCallsReport();
  return (
    <div className="p-4 space-y-6">
      <h1 className="text-lg font-semibold text-[color:var(--wp-text)]">Studené kontakty</h1>
      <ColdContactsClient initialCalls={calls} />
    </div>
  );
}

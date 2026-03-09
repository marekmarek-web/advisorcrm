import { getContactsList } from "@/app/actions/contacts";
import { CsvImportForm } from "@/app/dashboard/contacts/CsvImportForm";
import { ContactsPageClient } from "./ContactsPageClient";

export default async function ContactsPage() {
  const list = await getContactsList();

  return (
    <div className="p-4 space-y-8">
      <ContactsPageClient list={list} />
      <section className="max-w-[1600px] mx-auto">
        <h2 className="text-lg font-bold text-slate-800 mb-3">Import</h2>
        <CsvImportForm />
      </section>
    </div>
  );
}

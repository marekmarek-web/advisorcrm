import { Breadcrumbs } from "@/app/components/Breadcrumbs";

export default function ProfilePage() {
  return (
    <div className="p-4 max-w-[800px] mx-auto">
      <Breadcrumbs items={[{ label: "Profil" }]} />
      <div className="rounded-xl border border-slate-200 bg-white p-6 mt-4">
        <h1 className="text-xl font-semibold text-slate-800">Profil uživatele</h1>
        <p className="text-slate-500 mt-2">Stránka profilu a nastavení účtu bude doplněna.</p>
      </div>
    </div>
  );
}

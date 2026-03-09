import Link from "next/link";

export default function PortalNotFound() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="max-w-md text-center">
        <p className="text-6xl font-bold text-monday-border mb-2">404</p>
        <h2 className="text-lg font-semibold text-monday-text mb-2">
          Stránka nenalezena
        </h2>
        <p className="text-monday-text-muted text-sm mb-6">
          Stránka, kterou hledáte, neexistuje nebo byla přesunuta.
        </p>
        <Link
          href="/portal/today"
          className="inline-block rounded-[6px] px-4 py-2 text-sm font-semibold text-white bg-monday-blue hover:opacity-90"
        >
          Zpět na přehled
        </Link>
      </div>
    </div>
  );
}

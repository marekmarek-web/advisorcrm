/**
 * Stránka přihlášení a registrace – formulář s motivy (Barevný/Tmavý).
 * Z hlavní landing stránky (/) sem vedou odkazy Přihlásit se a Založit účet.
 *
 * `nativeFromUrl` se bere ze serverového requestu, aby první HTML sedělo s hydratací
 * v Capacitoru (`?native=1`). Jinak SSG HTML bez query často vykreslí WebLoginView
 * a klient MobileLoginView → React minifikovaná chyba #418 a prázdná obrazovka.
 */
import { Suspense } from "react";
import { LandingLoginPage } from "../components/LandingLoginPage";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function LoginFallback() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "linear-gradient(60deg, #10121f 0%, #1a1c2e 100%)", fontFamily: "var(--wp-font)" }}
    >
      <p className="text-white/70 text-sm">Načítám…</p>
    </div>
  );
}

function nativeParamIsSet(params: Record<string, string | string[] | undefined>): boolean {
  const raw = params.native;
  if (raw === "1") return true;
  if (Array.isArray(raw)) return raw.includes("1");
  return false;
}

export default async function PrihlaseniPage({ searchParams }: Props) {
  const params = await searchParams;
  const nativeFromUrl = nativeParamIsSet(params ?? {});

  return (
    <Suspense fallback={<LoginFallback />}>
      <LandingLoginPage nativeFromUrl={nativeFromUrl} />
    </Suspense>
  );
}

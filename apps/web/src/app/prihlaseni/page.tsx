/**
 * Stránka přihlášení a registrace – formulář s motivy (Barevný/Tmavý).
 * Z hlavní landing stránky (/) sem vedou odkazy Přihlásit se a Založit účet.
 *
 * Samotný login se načítá v client wrapperu s `ssr: false`, aby v Capacitoru
 * nedocházelo k hydrataci server HTML vs. WebView → React #418.
 */
import { PrihlaseniLoginDynamic } from "./PrihlaseniLoginDynamic";

/** Vždy render podle skutečného requestu (query). */
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function nativeParamIsSet(params: Record<string, string | string[] | undefined>): boolean {
  const raw = params.native;
  if (raw === "1") return true;
  if (Array.isArray(raw)) return raw.includes("1");
  return false;
}

export default async function PrihlaseniPage({ searchParams }: Props) {
  const params = await searchParams;
  const nativeFromUrl = nativeParamIsSet(params ?? {});

  return <PrihlaseniLoginDynamic nativeFromUrl={nativeFromUrl} />;
}

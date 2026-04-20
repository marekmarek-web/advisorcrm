import { redirect } from "next/navigation";
import { isValidSetupTabId } from "@/app/portal/setup/setup-tabs";

/**
 * Bývalá cesta `/portal/profile` — nastavení je jen na `/portal/setup`.
 * Předává se výhradně `tab`, který už je platnou záložkou Nastavení; legacy hodnoty
 * (např. `rezervace`) se ignorují. Ostatní query (`billing`, …) se zachovají.
 */
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const next = new URLSearchParams();

  const rawTab = sp.tab;
  const tabVal = Array.isArray(rawTab) ? rawTab[0] : rawTab;
  if (isValidSetupTabId(tabVal)) {
    next.set("tab", tabVal);
  }

  for (const key of Object.keys(sp)) {
    if (key === "tab") continue;
    const val = sp[key];
    if (val === undefined) continue;
    if (Array.isArray(val)) {
      for (const v of val) next.append(key, v);
    } else {
      next.set(key, val);
    }
  }

  const q = next.toString();
  redirect(q ? `/portal/setup?${q}` : "/portal/setup");
}

import { redirect } from "next/navigation";

/** Legacy URL; Akční centrum bylo zrušeno — přesměrování na nástěnku. */
export default function ActionCenterLegacyRedirectPage() {
  redirect("/portal/today");
}

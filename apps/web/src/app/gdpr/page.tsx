import { redirect } from "next/navigation";

/** Sjednocení s plným textem zásad na `/privacy`. */
export default function GdprPage() {
  redirect("/privacy");
}

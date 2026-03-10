import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  redirect("/portal/today");
}

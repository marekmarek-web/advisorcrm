import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { getContractSegments } from "@/app/actions/contracts";
import { getTerminationRequestDetail } from "@/app/actions/terminations";
import { isTerminationsModuleEnabledOnServer } from "@/lib/terminations/terminations-feature-flag";
import { TerminationRequestDetailClient } from "./TerminationRequestDetailClient";
import type { TerminationRequestDetail } from "@/app/actions/terminations";

export const metadata: Metadata = {
  title: "Detail výpovědi",
};

export const dynamic = "force-dynamic";

export default async function TerminationRequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const auth = await requireAuth();
  if (auth.roleName === "Client" || !hasPermission(auth.roleName, "contacts:read")) {
    notFound();
  }
  if (!isTerminationsModuleEnabledOnServer()) {
    return (
      <div className="p-4 md:p-8">
        <p className="text-sm text-[color:var(--wp-text-secondary)]">Modul výpovědí je vypnutý.</p>
      </div>
    );
  }

  const { requestId } = await params;
  const res = await getTerminationRequestDetail(requestId);
  if (!res.ok) {
    notFound();
  }

  const initial = JSON.parse(JSON.stringify(res.data)) as TerminationRequestDetail;
  const segments = await getContractSegments();
  const canWriteFields = hasPermission(auth.roleName, "contacts:write");

  return (
    <div className="p-4 md:p-8">
      <TerminationRequestDetailClient
        requestId={requestId}
        initial={initial}
        segments={segments.length ? segments : ["ZP"]}
        canWriteFields={canWriteFields}
      />
    </div>
  );
}

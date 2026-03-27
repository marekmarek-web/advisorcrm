import { DriveWorkspace } from "../_components/DriveWorkspace";

export const dynamic = "force-dynamic";

export default function PortalToolsDrivePage() {
  return (
    <div className="flex min-h-[min(560px,calc(100dvh-5rem))] w-full flex-1 flex-col overflow-hidden bg-[color:var(--wp-main-scroll-bg)]">
      <DriveWorkspace />
    </div>
  );
}

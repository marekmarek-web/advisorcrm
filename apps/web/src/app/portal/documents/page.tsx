"use client";

import { useDeviceClass } from "@/lib/ui/useDeviceClass";
import { DocumentsHubScreen } from "../mobile/screens/DocumentsHubScreen";

export default function PortalDocumentsPage() {
  const deviceClass = useDeviceClass();
  return <DocumentsHubScreen deviceClass={deviceClass} />;
}

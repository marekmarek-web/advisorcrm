"use client";

import { Camera, FileUp, Images, ScanLine } from "lucide-react";
import { BaseModal } from "@/app/components/BaseModal";
import { useCaptureCapabilities } from "@/lib/device/useCaptureCapabilities";

export type UploadSourceOption = "camera" | "gallery" | "file" | "scan";

type UploadSourceSheetProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (source: UploadSourceOption) => void;
};

export function UploadSourceSheet({ open, onClose, onSelect }: UploadSourceSheetProps) {
  const { useExpandedUploadSheet } = useCaptureCapabilities();
  const options = useExpandedUploadSheet
    ? [
        { id: "scan" as const, label: "Skenovat dokument", icon: ScanLine },
        { id: "camera" as const, label: "Vyfotit dokument", icon: Camera },
        { id: "gallery" as const, label: "Vybrat z galerie", icon: Images },
        { id: "file" as const, label: "Vybrat soubor", icon: FileUp },
      ]
    : [{ id: "file" as const, label: "Vybrat soubor", icon: FileUp }];

  return (
    <BaseModal open={open} onClose={onClose} title="Zdroj dokumentu" maxWidth="sm" mobileVariant="sheet">
      <div className="p-4 space-y-2">
        {options.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option.id)}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 py-3 flex items-center gap-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <span className="min-h-[44px] min-w-[44px] rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                <Icon size={18} />
              </span>
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </BaseModal>
  );
}

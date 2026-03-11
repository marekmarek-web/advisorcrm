"use client";

import { useState, useEffect } from "react";
import { ProductPicker } from "@/app/components/weplan/ProductPicker";
import type { ProductPickerValue } from "@/app/components/weplan/ProductPicker";
import { getContractsByContact } from "@/app/actions/contracts";
import type { ContractRow } from "@/app/actions/contracts";
import { segmentLabel } from "@/app/lib/segment-labels";

export type ActivityEntry = {
  id: string;
  action: string;
  meta?: { columnId?: string; oldValue?: string; newValue?: string; label?: string; partnerName?: string; productName?: string };
  createdAt: string;
  userId?: string;
};

type TabId = "updates" | "files" | "contracts" | "activity";

export type ContactOption = { id: string; firstName: string; lastName: string };

interface RightPanelProps {
  itemId: string;
  itemName: string;
  onClose: () => void;
  /** Načtení aktivity pro položku (později z API). */
  getActivity?: (itemId: string) => Promise<ActivityEntry[]>;
  /** Přidat záznam do aktivity (demo: in-memory). */
  appendActivity?: (itemId: string, entry: Omit<ActivityEntry, "id" | "createdAt">) => void;
  /** Kontakt pro záložku Smlouvy (volitelné). */
  contactId?: string | null;
  /** Seznam kontaktů pro výběr vazby (volitelné). */
  contacts?: ContactOption[];
  /** Callback při změně vazby na kontakt (volitelné). */
  onContactChange?: (contactId: string | null, contactName: string | null) => void;
  /** Na mobilu zobrazit jako fullscreen overlay (drawer). */
  mobileFullScreen?: boolean;
}

export function RightPanel({ itemId, itemName, onClose, getActivity, appendActivity, contactId, contacts = [], onContactChange, mobileFullScreen }: RightPanelProps) {
  const [tab, setTab] = useState<TabId>("activity");
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [pickerValue, setPickerValue] = useState<ProductPickerValue>({ partnerId: "", productId: "" });

  useEffect(() => {
    if (tab === "activity" && getActivity) {
      setLoading(true);
      getActivity(itemId)
        .then(setActivity)
        .catch(() => setActivity([]))
        .finally(() => setLoading(false));
    }
  }, [itemId, tab, getActivity]);

  useEffect(() => {
    if (tab === "contracts" && contactId) {
      setContractsLoading(true);
      getContractsByContact(contactId)
        .then((list) => setContracts(list))
        .catch(() => setContracts([]))
        .finally(() => setContractsLoading(false));
    }
  }, [tab, contactId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const tabs: { id: TabId; label: string }[] = [
    { id: "updates", label: "Updates" },
    { id: "files", label: "Soubory" },
    { id: "contracts", label: "Smlouvy" },
    { id: "activity", label: "Historie změn" },
  ];

  return (
    <div
      className={
        mobileFullScreen
          ? "fixed inset-0 z-[var(--z-drawer-panel,101)] w-full max-w-full bg-white flex flex-col shadow-[-4px_0_16px_rgba(0,0,0,0.04)] md:relative md:inset-auto md:z-auto md:w-[380px] md:flex-shrink-0 border-l border-[var(--board-border)] h-full"
          : "w-[380px] flex-shrink-0 border-l border-[var(--board-border)] bg-white flex flex-col h-full shadow-[-4px_0_16px_rgba(0,0,0,0.04)]"
      }
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--board-border)] min-h-[44px]">
        <h3 className="font-semibold text-[var(--board-text)] text-[15px] truncate">{itemName}</h3>
        <button
          type="button"
          onClick={onClose}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md hover:bg-[var(--board-cell-hover)] text-[var(--board-text-muted)] transition-colors"
          aria-label="Zavřít"
        >
          ×
        </button>
      </div>
      {onContactChange && (
        <div className="px-3 py-2 border-b border-monday-border bg-monday-surface">
          <p className="text-[11px] text-monday-text-muted mb-1.5">Kontakt</p>
          {contactId ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-monday-text truncate">{itemName}</span>
              <button
                type="button"
                onClick={() => onContactChange(null, null)}
                className="text-[12px] text-monday-text-muted hover:text-monday-blue shrink-0"
              >
                Zrušit vazbu
              </button>
            </div>
          ) : (
            <select
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                const c = contacts.find((x) => x.id === id);
                onContactChange(id, c ? `${c.firstName} ${c.lastName}`.trim() : null);
              }}
              className="w-full text-[13px] border border-monday-border rounded-[6px] px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-monday-blue"
            >
              <option value="">— Vybrat kontakt</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      <div className="flex border-b border-[var(--board-border)] px-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-2.5 text-[13px] font-medium transition-colors ${
              tab === t.id
                ? "text-[var(--board-resize-active)] border-b-2 border-[var(--board-resize-active)]"
                : "text-[var(--board-text-muted)] hover:text-[var(--board-text)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-3">
        {tab === "updates" && (
          <p className="text-monday-text-muted text-sm">Žádné updaty.</p>
        )}
        {tab === "files" && (
          <p className="text-monday-text-muted text-sm">Žádné soubory.</p>
        )}
        {tab === "contracts" && (
          <div className="space-y-3">
            {!contactId ? (
              <p className="text-monday-text-muted text-sm">Pro smlouvy vyberte kontakt v Contacts.</p>
            ) : (
              <>
                {contractsLoading ? (
                  <p className="text-monday-text-muted text-sm">Načítám…</p>
                ) : (
                  <>
                    <p className="text-monday-text-muted text-[11px]">Stávající smlouvy</p>
                    {contracts.length === 0 ? (
                      <p className="text-monday-text-muted text-sm">Žádné smlouvy.</p>
                    ) : (
                      <ul className="space-y-1 text-[13px]">
                        {contracts.map((c) => (
                          <li key={c.id} className="text-monday-text">
                            {c.contractNumber ? (
                              <><span className="font-medium">č. {c.contractNumber}</span> · </>
                            ) : null}
                            {segmentLabel(c.segment)} – {c.partnerName || c.productName || "—"}
                            {c.premiumAmount ? ` • ${Number(c.premiumAmount).toLocaleString("cs-CZ")} Kč` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-monday-text-muted text-[11px] pt-2">Partner → Produkt (náhled)</p>
                    <ProductPicker
                      value={pickerValue}
                      onChange={setPickerValue}
                      onActivityLog={(_, meta) => {
                        appendActivity?.(itemId, {
                          action: "product_change",
                          meta: { partnerName: meta?.partnerName, productName: meta?.productName },
                        });
                      }}
                      className="mt-1"
                    />
                  </>
                )}
              </>
            )}
          </div>
        )}
        {tab === "activity" && (
          <div className="space-y-2">
            {loading && <p className="text-monday-text-muted text-sm">Načítám…</p>}
            {!loading && activity.length === 0 && (
              <p className="text-monday-text-muted text-sm">Žádná historie změn.</p>
            )}
            {!loading &&
              activity.map((entry) => (
                <div
                  key={entry.id}
                  className="text-sm border-l-2 border-monday-border pl-2 py-1"
                >
                  <span className="text-monday-text">
                    {entry.action === "status_change" && "Změna statusu"}
                    {entry.action === "edit" && "Editace"}
                    {entry.action === "product_change" && "Změna produktu"}
                    {!["status_change", "edit", "product_change"].includes(entry.action) && entry.action}
                    {entry.meta?.label != null && ` – ${entry.meta.label}`}
                    {entry.meta?.partnerName != null && entry.meta?.productName != null && (
                      <span className="text-monday-text-muted"> – {entry.meta.partnerName} → {entry.meta.productName}</span>
                    )}
                    {entry.meta?.oldValue != null && entry.meta?.newValue != null && (
                      <span className="text-monday-text-muted">
                        {" "}
                        {entry.meta.oldValue} → {entry.meta.newValue}
                      </span>
                    )}
                  </span>
                  <p className="text-monday-text-muted text-xs mt-0.5">
                    {new Date(entry.createdAt).toLocaleString("cs-CZ")}
                  </p>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useCallback } from "react";
import { ContactContractsOverview } from "./ContactContractsOverview";
import { ContactManualPaymentSection } from "./ContactManualPaymentSection";
import { ManualPaymentSetupModal, type ManualPaymentSetupPrefill } from "./ManualPaymentSetupModal";

export function ContactPortfolioWithPaymentModal({
  contactId,
  baseQueryNoTab,
}: {
  contactId: string;
  baseQueryNoTab: string;
}) {
  const [modalPrefill, setModalPrefill] = useState<ManualPaymentSetupPrefill | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [paymentRefreshKey, setPaymentRefreshKey] = useState(0);

  const openModal = useCallback((prefill?: ManualPaymentSetupPrefill) => {
    setModalPrefill(prefill);
    setModalOpen(true);
  }, []);
  const closeModal = useCallback(() => setModalOpen(false), []);

  function handleSaved() {
    setModalOpen(false);
    setPaymentRefreshKey((k) => k + 1);
  }

  return (
    <>
      <ContactContractsOverview
        contactId={contactId}
        baseQueryNoTab={baseQueryNoTab}
        onOpenPaymentModal={openModal}
      />

      <ContactManualPaymentSection
        key={paymentRefreshKey}
        contactId={contactId}
        onOpenModal={() => openModal()}
      />

      {modalOpen && (
        <ManualPaymentSetupModal
          contactId={contactId}
          onClose={closeModal}
          onSaved={handleSaved}
          prefill={modalPrefill}
        />
      )}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { CustomerAuthModal, type AuthMode } from "@/components/customer-auth-modal";

export function NewVisitorAuthPrompt() {
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("login");
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    // ONLY opens when explicitly triggered by user clicking login/profile button
    // Never auto-prompts or pops up automatically on page load
    const handleOpenAuth = (e: Event) => {
      const ce = e as CustomEvent<{ mode?: AuthMode; reason?: string }>;
      if (ce.detail?.mode) setMode(ce.detail.mode);
      if (ce.detail?.reason) setReason(ce.detail.reason);
      setModalOpen(true);
    };

    window.addEventListener("hmf_open_auth_modal", handleOpenAuth);
    return () => window.removeEventListener("hmf_open_auth_modal", handleOpenAuth);
  }, []);

  if (!modalOpen) return null;

  return (
    <CustomerAuthModal
      open={modalOpen}
      onClose={() => setModalOpen(false)}
      initialMode={mode}
      initialReason={reason}
    />
  );
}

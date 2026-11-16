"use client";

// This module only reports browser connectivity. Catalog, deal, order, profile,
// and store-setting data are always loaded from the Supabase-backed APIs.
export const NETWORK_STATUS_EVENT = "hmf_network_status_change";

export function isAppOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine ?? true;
}

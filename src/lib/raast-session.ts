export type RaastPaymentSession = {
  orderNumber: string;
  amount: number;
  expiresAt: number;
  whatsappMessage: string;
};

const storageKey = "hmf_raast_checkout_session";
const listeners = new Set<() => void>();
let snapshot: RaastPaymentSession | null = null;
let didReadStorage = false;

function notificationMessage(orderNumber: string, amount: number) {
  return `Hi Home Made Food, please verify my MCB Raast payment for order ${orderNumber} (PKR ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(amount)}). I will attach the bank receipt here.`;
}

function getClientSnapshot(): RaastPaymentSession | null {
  if (typeof window === "undefined") return null;
  if (didReadStorage) return snapshot;
  didReadStorage = true;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) throw new Error("Saved Raast session is invalid.");
    const session = value as Record<string, unknown>;
    if (typeof session.orderNumber !== "string" || typeof session.amount !== "number" || typeof session.expiresAt !== "number") {
      throw new Error("Saved Raast session is invalid.");
    }
    snapshot = {
      orderNumber: session.orderNumber,
      amount: session.amount,
      expiresAt: session.expiresAt,
      whatsappMessage: notificationMessage(session.orderNumber, session.amount),
    };
  } catch (error) {
    console.warn("Could not restore the Raast checkout session.", error);
    try { window.sessionStorage.removeItem(storageKey); } catch { /* Session storage is optional. */ }
  }
  return snapshot;
}

function getServerSnapshot(): RaastPaymentSession | null {
  return null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRaastSessionStore() {
  return { subscribe, getClientSnapshot, getServerSnapshot };
}

export function saveRaastSession(session: RaastPaymentSession) {
  snapshot = session;
  didReadStorage = true;
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify({
      orderNumber: session.orderNumber,
      amount: session.amount,
      expiresAt: session.expiresAt,
    }));
  } catch (error) {
    console.warn("The Raast session will not survive a page refresh because session storage is unavailable.", error);
  }
  listeners.forEach((listener) => listener());
}

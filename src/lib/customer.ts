import type { DbOrder } from "@/lib/store-db";

export type CustomerProfile = {
  id?: string;
  name: string;
  email?: string;
  phone: string;
  avatarUrl?: string;
  authProvider?: "google" | "email" | "phone";
  emailVerified?: boolean;
  phoneVerified?: boolean;
  addresses: string[];
  preferredPayment: string;
  createdAt?: string;
};

export type OrderRequest = {
  number: string;
  placedAt: string;
  total: number;
  payment: string;
  items: string;
  status: string;
};

export const CUSTOMER_AUTH_EVENT = "hmf_customer_auth_changed";
let customerProfile: CustomerProfile | null = null;
let customerOrders: OrderRequest[] = [];

export function readCustomerProfile(): CustomerProfile | null {
  return customerProfile;
}

export async function syncCustomerProfile(profile: CustomerProfile) {
  const canSyncEmail = Boolean(profile.email && profile.emailVerified);
  const canSyncPhone = Boolean(profile.phone && profile.phoneVerified);
  if (!canSyncEmail && !canSyncPhone) {
    throw new Error("Verify your email address or mobile number before saving the customer profile.");
  }
  const response = await fetch("/api/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(profile),
  });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error || "Could not synchronize the customer profile with Supabase.");
}

export function saveCustomerProfile(profile: CustomerProfile, syncToServer = true) {
  customerProfile = profile;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CUSTOMER_AUTH_EVENT, { detail: profile }));
  if (syncToServer && ((profile.email && profile.emailVerified) || (profile.phone && profile.phoneVerified))) {
    void syncCustomerProfile(profile).catch((error: unknown) => console.error("Could not synchronize the customer profile with Supabase.", error));
  }
}

export function clearCustomerProfile() {
  customerProfile = null;
  customerOrders = [];
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CUSTOMER_AUTH_EVENT, { detail: null }));
}

export async function loadCustomerProfile(): Promise<CustomerProfile | null> {
  const response = await fetch("/api/auth/email-otp", { cache: "no-store" });
  if (!response.ok) throw new Error(`Customer session lookup failed (${response.status}).`);
  const data = await response.json() as { authenticated?: boolean; customer?: CustomerProfile };
  customerProfile = data.authenticated && data.customer ? data.customer : null;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CUSTOMER_AUTH_EVENT, { detail: customerProfile }));
  return customerProfile;
}

export function isCustomerVerified(): boolean {
  return Boolean((customerProfile?.emailVerified && customerProfile.email) || (customerProfile?.phoneVerified && customerProfile.phone));
}

function toOrderRequest(order: DbOrder): OrderRequest {
  return {
    number: order.number,
    placedAt: order.createdAt,
    total: order.total,
    payment: order.paymentMethod,
    items: order.items.map((item) => `${item.name} (${item.portion}) × ${item.quantity}`).join(", "),
    status: order.paymentStatus === "paid" ? "Paid" : order.paymentStatus === "verification_pending" ? "Process" : order.status,
  };
}

export function readOrderRequests(): OrderRequest[] {
  return customerOrders;
}

export async function loadCustomerOrders(): Promise<OrderRequest[]> {
  const response = await fetch("/api/customer/orders", { cache: "no-store" });
  if (!response.ok) throw new Error(`Customer orders could not be loaded (${response.status}).`);
  const data = await response.json() as { orders?: DbOrder[] };
  customerOrders = (data.orders || []).map(toOrderRequest);
  return customerOrders;
}

export function saveOrderRequest(_order: OrderRequest) {
  // Orders are persisted by POST /api/orders. Refresh the customer list from Supabase.
  if (typeof window !== "undefined") {
    void loadCustomerOrders().catch((error: unknown) => console.error("Could not refresh customer orders from Supabase.", error));
  }
}

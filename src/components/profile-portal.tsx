"use client";

import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import {
  readCustomerProfile,
  loadCustomerOrders,
  saveCustomerProfile,
  syncCustomerProfile,
  clearCustomerProfile,
  CUSTOMER_AUTH_EVENT,
  type CustomerProfile,
  type OrderRequest,
} from "@/lib/customer";
import { CustomerAuthModal } from "@/components/customer-auth-modal";
import { getSupabaseAuthClient } from "@/lib/supabase-auth-client";
import { REALTIME_SYNC_EVENT } from "@/lib/realtime-client";
import { useCart } from "@/components/cart-provider";
import { ScheduledOrdersManager } from "@/components/scheduled-orders-manager";
import { useSiteSettings } from "@/components/site-settings";

const emptyProfile: CustomerProfile = {
  name: "",
  email: "",
  phone: "",
  emailVerified: false,
  addresses: [],
  preferredPayment: "Digital Payment (Raast)",
};

type ActiveTab = "details" | "addresses" | "payment" | "orders" | "requests" | "vouchers";

type MealPlanRequest = {
  id: string;
  plan_type: string;
  days_of_week: string[];
  meal_slot: string;
  status: string;
  start_date: string;
  end_date?: string | null;
};

type ReservationRequest = {
  id: string;
  guest_name: string;
  party_size: number;
  slot_time: string;
  status: string;
  notes?: string;
};

export function ProfilePortal() {
  const { formatCurrency } = useSiteSettings();
  const router = useRouter();
  const { addItem, clearCart } = useCart();
  const [profile, setProfile] = useState<CustomerProfile>(emptyProfile);
  const [orders, setOrders] = useState<OrderRequest[]>([]);
  const [mealPlans, setMealPlans] = useState<MealPlanRequest[]>([]);
  const [reservations, setReservations] = useState<ReservationRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState("");
  const [addressInput, setAddressInput] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [activeTab, setActiveTab] = useState<ActiveTab>("details");
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState("");
  const [reorderError, setReorderError] = useState("");
  const [planActionMessage, setPlanActionMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadCustomerRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const [plansResponse, reservationsResponse] = await Promise.all([
        fetch("/api/subscriptions", { cache: "no-store" }),
        fetch("/api/reservations", { cache: "no-store" }),
      ]);
      const [plansData, reservationsData] = await Promise.all([
        plansResponse.json() as Promise<{ subscriptions?: MealPlanRequest[]; error?: string }>,
        reservationsResponse.json() as Promise<{ reservations?: ReservationRequest[]; error?: string }>,
      ]);
      if (!plansResponse.ok) throw new Error(plansData.error || `Meal plans could not be loaded (HTTP ${plansResponse.status}).`);
      if (!reservationsResponse.ok) throw new Error(reservationsData.error || `Reservations could not be loaded (HTTP ${reservationsResponse.status}).`);
      setMealPlans(Array.isArray(plansData.subscriptions) ? plansData.subscriptions : []);
      setReservations(Array.isArray(reservationsData.reservations) ? reservationsData.reservations : []);
      setRequestsError("");
    } catch (requestError) {
      console.error("Could not load customer meal plans and reservations.", requestError);
      setRequestsError(requestError instanceof Error ? requestError.message : "Customer requests could not be loaded.");
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      setError("Please choose an image under 3 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) return;

      const updated = { ...profile, avatarUrl: dataUrl };
      try {
        await syncCustomerProfile(updated);
        saveCustomerProfile(updated, false);
        setProfile(updated);
        setMessage("Profile avatar updated successfully!");
        setError("");
      } catch (syncError) {
        setError(syncError instanceof Error ? syncError.message : "Could not synchronize the avatar with Supabase.");
      }
    };
    reader.readAsDataURL(file);
  };

  // Sync profile on mount and on storage/custom event
  useEffect(() => {
    const syncProfile = () => {
      const saved = readCustomerProfile();
      if (saved) setProfile(saved);
      if (!saved || !((saved.emailVerified && saved.email) || (saved.phoneVerified && saved.phone))) {
        setOrders([]);
        setMealPlans([]);
        setReservations([]);
        return;
      }
      void loadCustomerOrders().then(setOrders).catch((error: unknown) => console.error("Could not load customer orders from Supabase.", error));
      void loadCustomerRequests();
    };

    syncProfile();

    // Verify session from server cookie as well
    fetch("/api/auth/email-otp", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { authenticated?: boolean; customer?: CustomerProfile }) => {
        if (data.authenticated && data.customer) {
          saveCustomerProfile(data.customer, false);
          setProfile(data.customer);
          void loadCustomerOrders().then(setOrders).catch((loadError: unknown) => console.error("Could not load customer orders from Supabase.", loadError));
          void loadCustomerRequests();
        } else {
          setOrders([]);
          setMealPlans([]);
          setReservations([]);
        }
      })
      .catch(() => undefined);

    const onAuthChanged = (e: Event) => {
      const custom = e as CustomEvent<CustomerProfile | null>;
      if (custom.detail) {
        setProfile(custom.detail);
        if ((custom.detail.emailVerified && custom.detail.email) || (custom.detail.phoneVerified && custom.detail.phone)) {
          void loadCustomerRequests();
        }
      } else {
        setProfile(emptyProfile);
        setOrders([]);
        setMealPlans([]);
        setReservations([]);
      }
    };

    window.addEventListener(CUSTOMER_AUTH_EVENT, onAuthChanged);
    const refreshOrders = (event: Event) => {
      const detail = (event as CustomEvent<{ table?: string }>).detail;
      const currentCustomer = readCustomerProfile();
      if (detail?.table === "orders" && currentCustomer && ((currentCustomer.emailVerified && currentCustomer.email) || (currentCustomer.phoneVerified && currentCustomer.phone))) {
        void loadCustomerOrders().then(setOrders).catch((loadError: unknown) => console.error("Could not refresh customer orders.", loadError));
      }
      if ((detail?.table === "reservations" || detail?.table === "meal_subscriptions") && currentCustomer && ((currentCustomer.emailVerified && currentCustomer.email) || (currentCustomer.phoneVerified && currentCustomer.phone))) {
        void loadCustomerRequests();
      }
    };
    window.addEventListener(REALTIME_SYNC_EVENT, refreshOrders);
    return () => {
      window.removeEventListener(CUSTOMER_AUTH_EVENT, onAuthChanged);
      window.removeEventListener(REALTIME_SYNC_EVENT, refreshOrders);
    };
  }, [loadCustomerRequests]);

  const handleAuthSuccess = useCallback((updated: CustomerProfile) => {
    setProfile(updated);
    void loadCustomerRequests();
    setMessage("Welcome! Your account has been verified successfully.");
    setError("");
    setAuthModalOpen(false);
  }, [loadCustomerRequests]);

  async function handleSignOut() {
    try {
      await fetch("/api/auth/email-otp", { method: "DELETE" });
      await fetch("/api/auth/otp", { method: "DELETE" }).catch(() => undefined);
      const auth = getSupabaseAuthClient();
      if (auth) {
        const { error: signOutError } = await auth.auth.signOut();
        if (signOutError) throw signOutError;
      }
      clearCustomerProfile();
      setProfile(emptyProfile);
      setOrders([]);
      setMealPlans([]);
      setReservations([]);
      setMessage("You have safely signed out of your customer account.");
      setError("");
    } catch {
      setError("Unable to sign out right now. Please try again.");
    }
  }

  async function handleSaveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await syncCustomerProfile(profile);
      saveCustomerProfile(profile, false);
      setMessage("Your customer details and delivery settings have been saved to database.");
    } catch (saveError) {
      console.error("Could not save profile:", saveError);
      setError(saveError instanceof Error ? saveError.message : "Unable to save details to database.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddAddress() {
    const clean = addressInput.trim();
    if (!clean || profile.addresses.includes(clean)) return;
    const updatedAddresses = [...profile.addresses, clean].slice(0, 5);
    const updated = { ...profile, addresses: updatedAddresses };
    try {
      await syncCustomerProfile(updated);
      saveCustomerProfile(updated, false);
      setProfile(updated);
      setAddressInput("");
      setMessage("Delivery address added.");
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save delivery address.");
    }
  }

  async function handleRemoveAddress(target: string) {
    const updated = { ...profile, addresses: profile.addresses.filter((a) => a !== target) };
    try {
      await syncCustomerProfile(updated);
      saveCustomerProfile(updated, false);
      setProfile(updated);
      setMessage("Address removed.");
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to remove address.");
    }
  }

  async function handleReorder(number: string) {
    if (reordering) return;
    setReordering(number);
    setReorderError("");
    try {
      const response = await fetch("/api/orders/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number }),
      });
      const data = await response.json() as {
        items?: Array<{ id: number; name: string; portion: string; price: number; quantity: number; specialInstructions?: string }>;
        error?: string;
      };
      if (!response.ok || !Array.isArray(data.items)) throw new Error(data.error || "This order could not be reordered.");
      clearCart();
      data.items.forEach((item) => addItem(item));
      router.push("/checkout");
    } catch (reorderCause) {
      setReorderError(reorderCause instanceof Error ? reorderCause.message : "This order could not be reordered.");
    } finally {
      setReordering("");
    }
  }

  async function handlePlanAction(id: string, status: "active" | "paused" | "cancelled") {
    setPlanActionMessage("");
    try {
      const response = await fetch("/api/subscriptions/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Meal plan could not be updated.");
      await loadCustomerRequests();
      setPlanActionMessage(`Meal plan ${status}.`);
    } catch (cause) {
      setPlanActionMessage(cause instanceof Error ? cause.message : "Meal plan could not be updated.");
    }
  }

  const isVerified = Boolean((profile.emailVerified && profile.email) || (profile.phoneVerified && profile.phone));
  const displayName = profile.name.trim()
    || profile.email?.split("@")[0]
    || profile.phone
    || "";
  const initials = useMemo(() => {
    const name = profile.name.trim() || profile.email?.split("@")[0] || profile.phone || "";
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }, [profile.name, profile.email, profile.phone]);

  return (
    <>
      <section className="page-hero profile-page-hero">
        <span className="section-kicker">Your Home Made Food account</span>
        <h1>{displayName ? `${displayName}'s profile` : "Your profile"}</h1>
        <p>Manage your delivery details and see recent order requests from this device.</p>
      </section>
      <div
        style={{
          maxWidth: "1080px",
          margin: "0 auto",
          padding: "20px 16px 80px 16px",
        }}
      >
      {/* Main Glassmorphism Hero Card */}
      <div
        style={{
          position: "relative",
          borderRadius: "28px",
          background: "linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(248,250,252,0.85) 100%)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.8)",
          boxShadow: "0 20px 50px -10px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.03)",
          overflow: "hidden",
          marginBottom: "28px",
        }}
      >
        {/* Top Emerald Header Strip */}
        <div
          style={{
            height: "90px",
            background: "linear-gradient(135deg, #173f2b 0%, #0d261a 100%)",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "16px",
              right: "24px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {isVerified ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 14px",
                  borderRadius: "9999px",
                  background: "rgba(255,255,255,0.18)",
                  backdropFilter: "blur(8px)",
                  color: "#86efac",
                  fontSize: "12px",
                  fontWeight: 700,
                  border: "1px solid rgba(134, 239, 172, 0.4)",
                }}
              >
                <span>✓</span> Verified Account
              </span>
            ) : (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 14px",
                  borderRadius: "9999px",
                  background: "rgba(217, 119, 6, 0.25)",
                  backdropFilter: "blur(8px)",
                  color: "#fde68a",
                  fontSize: "12px",
                  fontWeight: 700,
                  border: "1px solid rgba(253, 230, 138, 0.4)",
                }}
              >
                <span>⏳</span> Email OTP Pending
              </span>
            )}
          </div>
        </div>

        {/* Profile Identity Bar */}
        <div style={{ padding: "0 32px 28px 32px", position: "relative" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              flexWrap: "wrap",
              gap: "20px",
              marginTop: "-44px",
              marginBottom: "20px",
            }}
          >
            {/* Avatar */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: "20px" }}>
              <div style={{ position: "relative" }}>
                {profile.avatarUrl ? (
                  <Image
                    src={profile.avatarUrl}
                    alt={profile.name || "Customer avatar"}
                    width={96}
                    height={96}
                    unoptimized
                    style={{
                      borderRadius: "50%",
                      objectFit: "cover",
                      border: "4px solid #ffffff",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                      background: "#ffffff",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "96px",
                      height: "96px",
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #173f2b 0%, #16a34a 100%)",
                      color: "#ffffff",
                      fontSize: "32px",
                      fontWeight: 800,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "4px solid #ffffff",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                    }}
                  >
                    {initials}
                  </div>
                )}
                {isVerified && (
                  <span
                    title="Verified Customer"
                    style={{
                      position: "absolute",
                      bottom: "4px",
                      left: "4px",
                      width: "22px",
                      height: "22px",
                      borderRadius: "50%",
                      background: "#16a34a",
                      color: "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "12px",
                      fontWeight: 800,
                      border: "2px solid #ffffff",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                    }}
                  >
                    ✓
                  </span>
                )}

                {/* Upload Custom Avatar Trigger */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleAvatarUpload}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload / Change Profile Picture"
                  style={{
                    position: "absolute",
                    bottom: "-2px",
                    right: "-2px",
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: "#059669",
                    color: "#ffffff",
                    border: "3px solid #ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "14px",
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                    transition: "transform 0.15s ease",
                  }}
                >
                  📷
                </button>
              </div>

              <div>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 800,
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                    color: "#16a34a",
                  }}
                >
                  CUSTOMER PROFILE
                </span>
                <h1 style={{ margin: "2px 0 4px 0", fontSize: "26px", fontWeight: 800, color: "#0f172a" }}>
                  {displayName || "Your profile"}
                </h1>
                <p style={{ margin: 0, fontSize: "14px", color: "#64748b" }}>
                  {profile.email || "No email address linked yet"}
                </p>
              </div>
            </div>

            {/* Auth Actions */}
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              {isVerified ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode("signup");
                      setAuthModalOpen(true);
                    }}
                    style={{
                      padding: "9px 16px",
                      borderRadius: "12px",
                      border: "1px solid #cbd5e1",
                      background: "#ffffff",
                      color: "#334155",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    }}
                  >
                    Switch Account
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    style={{
                      padding: "9px 18px",
                      borderRadius: "12px",
                      border: "1px solid #fecaca",
                      background: "#fef2f2",
                      color: "#dc2626",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("signup");
                    setAuthModalOpen(true);
                  }}
                  style={{
                    padding: "11px 22px",
                    borderRadius: "14px",
                    border: "none",
                    background: "linear-gradient(135deg, #173f2b 0%, #1f563b 100%)",
                    color: "#ffffff",
                    fontSize: "14px",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "0 4px 14px rgba(23,63,43,0.3)",
                  }}
                >
                  Sign In / Create Account →
                </button>
              )}
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "14px",
              paddingTop: "18px",
              borderTop: "1px solid #f1f5f9",
            }}
          >
            <div
              style={{
                background: "#ffffff",
                padding: "14px 18px",
                borderRadius: "16px",
                border: "1px solid #e2e8f0",
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                Order Requests
              </div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", margin: "4px 0 2px 0" }}>
                {orders.length}
              </div>
              <div style={{ fontSize: "11px", color: "#16a34a" }}>Saved locally</div>
            </div>

            <div
              style={{
                background: "#ffffff",
                padding: "14px 18px",
                borderRadius: "16px",
                border: "1px solid #e2e8f0",
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                Delivery Addresses
              </div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", margin: "4px 0 2px 0" }}>
                {profile.addresses.length} <small style={{ fontSize: "13px", color: "#94a3b8" }}>/ 5</small>
              </div>
              <div style={{ fontSize: "11px", color: "#64748b" }}>Bahawalpur areas</div>
            </div>

            <div
              style={{
                background: "#ffffff",
                padding: "14px 18px",
                borderRadius: "16px",
                border: "1px solid #e2e8f0",
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                Auth Method
              </div>
              <div style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a", margin: "8px 0 2px 0" }}>
                {profile.authProvider === "google" ? "Google OAuth" : "Email Passkey"}
              </div>
              <div style={{ fontSize: "11px", color: isVerified ? "#16a34a" : "#d97706" }}>
                {isVerified ? "Verified Identity" : "Action Needed"}
              </div>
            </div>

            <div
              style={{
                background: "#ffffff",
                padding: "14px 18px",
                borderRadius: "16px",
                border: "1px solid #e2e8f0",
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                VIP Offer
              </div>
              <div style={{ fontSize: "16px", fontWeight: 800, color: "#15803d", margin: "6px 0 2px 0" }}>
                HOME10 (10% Off)
              </div>
              <div style={{ fontSize: "11px", color: "#64748b" }}>Active at checkout</div>
            </div>
          </div>
        </div>
      </div>

      {/* Security Gate Banner if unverified */}
      {!isVerified && (
        <div
          style={{
            background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
            border: "1px solid #fde68a",
            borderRadius: "20px",
            padding: "20px 24px",
            marginBottom: "28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
            boxShadow: "0 4px 16px rgba(217, 119, 6, 0.08)",
          }}
        >
          <div>
            <strong style={{ display: "block", color: "#92400e", fontSize: "16px", marginBottom: "4px" }}>
              🔒 Complete Email OTP Verification to Unlock Checkout
            </strong>
            <p style={{ margin: 0, fontSize: "13px", color: "#b45309", maxWidth: "600px", lineHeight: 1.5 }}>
              Strict security requirement: Customer accounts must confirm a 6-digit email OTP passkey before placing food orders or generating MCB Raast QR codes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setAuthMode("signup");
              setAuthModalOpen(true);
            }}
            style={{
              background: "#d97706",
              color: "#ffffff",
              border: "none",
              borderRadius: "14px",
              padding: "12px 22px",
              fontWeight: 700,
              fontSize: "14px",
              cursor: "pointer",
              boxShadow: "0 3px 10px rgba(217,119,6,0.3)",
            }}
          >
            Verify with Email OTP Now →
          </button>
        </div>
      )}

      {/* Feedback Messages */}
      {message && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: "14px",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            color: "#166534",
            fontSize: "13px",
            marginBottom: "20px",
          }}
        >
          ✓ {message}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: "14px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            fontSize: "13px",
            marginBottom: "20px",
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* Navigation Pills */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          overflowX: "auto",
          paddingBottom: "8px",
          marginBottom: "20px",
        }}
      >
        {(
          [
            ["details", "Personal Details"],
            ["addresses", `Delivery Addresses (${profile.addresses.length})`],
            ["payment", "Payment Preference"],
            ["orders", `Order Requests (${orders.length})`],
            ["requests", `Meal Plans & Reservations (${mealPlans.length + reservations.length})`],
            ["vouchers", "Special Vouchers"],
          ] as const
        ).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "10px 18px",
              borderRadius: "14px",
              border: activeTab === tab ? "1px solid #173f2b" : "1px solid #e2e8f0",
              background: activeTab === tab ? "#173f2b" : "#ffffff",
              color: activeTab === tab ? "#ffffff" : "#475569",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
              boxShadow: activeTab === tab ? "0 4px 12px rgba(23,63,43,0.2)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      <div
        style={{
          borderRadius: "24px",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
          padding: "32px",
        }}
      >
        {/* TAB 1: Personal Details */}
        {activeTab === "details" && (
          <div>
            <div style={{ marginBottom: "20px" }}>
              <h2 style={{ margin: "0 0 6px 0", fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>
                Personal Information
              </h2>
              <p style={{ margin: 0, fontSize: "14px", color: "#64748b" }}>
                Update your contact details for smooth delivery coordination in Bahawalpur.
              </p>
            </div>

            <form onSubmit={handleSaveProfile}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: "18px",
                  marginBottom: "24px",
                }}
              >
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    required
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: "12px",
                      border: "1px solid #cbd5e1",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                    Verified Email Address
                  </label>
                  <input
                    type="email"
                    value={profile.email || ""}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    placeholder="name@example.com"
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: "12px",
                      border: "1px solid #cbd5e1",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      outline: "none",
                      background: isVerified ? "#f8fafc" : "#ffffff",
                    }}
                  />
                  {isVerified && (
                    <small style={{ color: "#16a34a", fontSize: "11px", fontWeight: 600, marginTop: "4px", display: "block" }}>
                      ✓ {profile.phoneVerified ? "Phone number verified" : "Email OTP confirmed on this device"}
                    </small>
                  )}
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                    Mobile Number (Pakistan)
                  </label>
                  <input
                    type="tel"
                    readOnly={Boolean(profile.phoneVerified)}
                    value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    placeholder="03xx xxxxxxx"
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: "12px",
                      border: "1px solid #cbd5e1",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      outline: "none",
                      background: profile.phoneVerified ? "#f8fafc" : "#ffffff",
                    }}
                  />
                  {profile.phoneVerified && <small style={{ display: "block", marginTop: 4, color: "#16a34a", fontSize: 11, fontWeight: 600 }}>✓ Mobile number verified</small>}
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                    Profile Photo URL
                  </label>
                  <input
                    type="url"
                    value={profile.avatarUrl || ""}
                    onChange={(e) => setProfile({ ...profile, avatarUrl: e.target.value })}
                    placeholder="https://images.google.com/..."
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: "12px",
                      border: "1px solid #cbd5e1",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: "12px 24px",
                  borderRadius: "12px",
                  border: "none",
                  background: "#173f2b",
                  color: "#ffffff",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 2px 6px rgba(23,63,43,0.25)",
                }}
              >
                {saving ? "Saving Details…" : "Save Personal Details"}
              </button>
            </form>
          </div>
        )}

        {/* TAB 2: Delivery Addresses */}
        {activeTab === "addresses" && (
          <div>
            <div style={{ marginBottom: "20px" }}>
              <h2 style={{ margin: "0 0 6px 0", fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>
                Saved Delivery Addresses
              </h2>
              <p style={{ margin: 0, fontSize: "14px", color: "#64748b" }}>
                Pre-saved addresses for speedy checkout in Bahawalpur (Model Town, University Chowk, Goheer Town).
              </p>
            </div>

            {profile.addresses.length === 0 ? (
              <p style={{ color: "#64748b", fontSize: "14px", margin: "16px 0" }}>
                No delivery addresses saved yet. Add your house/office location below.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
                {profile.addresses.map((addr, idx) => (
                  <div
                    key={addr}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "14px 18px",
                      borderRadius: "14px",
                      border: "1px solid #e2e8f0",
                      background: "#f8fafc",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "16px", color: "#16a34a" }}>⌖</span>
                      <strong style={{ fontSize: "14px", color: "#1e293b" }}>{addr}</strong>
                      {idx === 0 && (
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#166534", background: "#dcfce7", padding: "2px 8px", borderRadius: "6px" }}>
                          Default
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAddress(addr)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#ef4444",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add Address Form */}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", borderTop: "1px solid #f1f5f9", paddingTop: "18px" }}>
              <input
                type="text"
                placeholder="House, Street, Area (e.g. House 14, Street 3, Model Town B, Bahawalpur)"
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: "260px",
                  padding: "11px 14px",
                  borderRadius: "12px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                  boxSizing: "border-box",
                }}
              />
              <button
                type="button"
                onClick={handleAddAddress}
                disabled={!addressInput.trim() || profile.addresses.length >= 5}
                style={{
                  padding: "11px 20px",
                  borderRadius: "12px",
                  border: "none",
                  background: "#173f2b",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                + Add Address
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: Payment Preferences */}
        {activeTab === "payment" && (
          <div>
            <div style={{ marginBottom: "20px" }}>
              <h2 style={{ margin: "0 0 6px 0", fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>
                Payment Preferences
              </h2>
              <p style={{ margin: 0, fontSize: "14px", color: "#64748b" }}>
                Choose your preselected payment method at checkout.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px", marginBottom: "20px" }}>
              {[
                { title: "Digital Payment (Raast)", desc: "Universal EMVCo Raast QR scannable via MCB, Easypaisa, JazzCash" },
                { title: "Cash on Delivery", desc: "Pay cash in PKR directly upon receiving food at your doorstep" },
                { title: "WhatsApp Order Confirmation", desc: "Attach bank receipt or discuss requirements directly on WhatsApp" },
              ].map((m) => (
                <button
                  key={m.title}
                  type="button"
                  onClick={() => {
                    const updated = { ...profile, preferredPayment: m.title };
                    saveCustomerProfile(updated);
                    setProfile(updated);
                    setMessage(`Default payment set to ${m.title}`);
                  }}
                  style={{
                    padding: "18px",
                    borderRadius: "16px",
                    border: profile.preferredPayment === m.title ? "2px solid #16a34a" : "1px solid #e2e8f0",
                    background: profile.preferredPayment === m.title ? "#f0fdf4" : "#ffffff",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                  }}
                >
                  <strong style={{ display: "block", fontSize: "14px", color: "#0f172a", marginBottom: "6px" }}>
                    {m.title}
                  </strong>
                  <p style={{ margin: 0, fontSize: "12px", color: "#64748b", lineHeight: 1.4 }}>
                    {m.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: Order Requests */}
        {activeTab === "orders" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <div>
                <h2 style={{ margin: "0 0 4px 0", fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>
                  Recent Orders
                </h2>
                <p style={{ margin: 0, fontSize: "14px", color: "#64748b" }}>
                  History of your checkout requests submitted from this browser.
                </p>
              </div>
              {reorderError && <p className="form-error" role="alert">{reorderError}</p>}
              <Link
                href="/track-order"
                style={{
                  padding: "8px 14px",
                  borderRadius: "10px",
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  color: "#166534",
                  fontSize: "12px",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Track Live Order →
              </Link>
            </div>

            {orders.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <div style={{ fontSize: "40px", marginBottom: "12px" }}>🧾</div>
                <h3 style={{ margin: "0 0 6px 0", fontSize: "16px", color: "#0f172a" }}>No previous order requests</h3>
                <p style={{ margin: "0 0 16px 0", fontSize: "13px", color: "#64748b" }}>
                  Your recent checkout requests will be tracked here.
                </p>
                <Link
                  href="/menu"
                  style={{
                    display: "inline-block",
                    padding: "9px 18px",
                    background: "#173f2b",
                    color: "#ffffff",
                    borderRadius: "10px",
                    fontSize: "13px",
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  Explore Today&apos;s Menu →
                </Link>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {orders.map((o) => (
                  <div
                    key={o.number}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "16px 20px",
                      borderRadius: "16px",
                      border: "1px solid #e2e8f0",
                      background: "#f8fafc",
                    }}
                  >
                    <div>
                      <strong style={{ display: "block", fontSize: "14px", color: "#0f172a" }}>
                        Order #{o.number}
                      </strong>
                      <small style={{ color: "#64748b", fontSize: "12px" }}>
                        {new Date(o.placedAt).toLocaleString()} · {o.items}
                      </small>
                    </div>
                    <div style={{ display: "grid", justifyItems: "end", gap: 6, textAlign: "right" }}>
                      <strong style={{ display: "block", fontSize: "15px", color: "#166534" }}>
                        {formatCurrency(o.total)}
                      </strong>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: "6px",
                          background: "#e0f2fe",
                          color: "#0369a1",
                        }}
                      >
                        {o.status}
                      </span>
                      <Link href={`/track-order?order=${encodeURIComponent(o.number)}&phone=${encodeURIComponent(profile.phone)}`} style={{ color: "#176b47", fontSize: 11, fontWeight: 700, textDecoration: "underline" }}>
                        {["pending", "confirmed", "new"].includes(o.status.toLowerCase()) ? "Track / cancel" : "Track order"}
                      </Link>
                      <button type="button" className="checkout-raast-select" disabled={!isVerified || Boolean(reordering)} onClick={() => void handleReorder(o.number)}>
                        {reordering === o.number ? "Preparing cart…" : "Reorder"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "requests" && (
          <div>
            <h2 style={{ margin: "0 0 6px", fontSize: 20, color: "#0f172a" }}>Meal plans &amp; reservations</h2>
            <p style={{ margin: "0 0 18px", color: "#64748b", fontSize: 14 }}>Requests linked to your verified customer account.</p>
            {requestsError && <p className="form-error" role="alert">{requestsError}</p>}
            {planActionMessage && <p role="status">{planActionMessage}</p>}
            {!isVerified && <p role="status">Sign in with a verified account to view saved meal plans and reservations.</p>}
            {requestsLoading && <p role="status">Loading your requests…</p>}
            {isVerified && !requestsLoading && !requestsError && !mealPlans.length && !reservations.length && <p>No meal plans or reservations are linked to your account yet.</p>}
            {mealPlans.length > 0 && <section style={{ marginTop: 18 }}>
              <h3>Meal plans</h3>
              {mealPlans.map((plan) => <article key={plan.id} className="admin-recent-order" style={{ marginBottom: 8 }}>
                <span><strong>{plan.plan_type} · {plan.meal_slot}</strong><small>{(plan.days_of_week || []).join(", ")} · {plan.start_date}{plan.end_date ? ` – ${plan.end_date}` : ""}</small></span>
                <span className="admin-recent-status">{plan.status}</span>
                {plan.status !== "cancelled" && plan.status !== "completed" && <span>
                  {plan.status === "active"
                    ? <button type="button" className="checkout-raast-select" onClick={() => void handlePlanAction(plan.id, "paused")}>Pause</button>
                    : <button type="button" className="checkout-raast-select" onClick={() => void handlePlanAction(plan.id, "active")}>Resume</button>}
                  <button type="button" className="checkout-raast-select" onClick={() => void handlePlanAction(plan.id, "cancelled")}>Cancel</button>
                </span>}
              </article>)}
            </section>}
            {reservations.length > 0 && <section style={{ marginTop: 18 }}>
              <h3>Reservations</h3>
              {reservations.map((reservation) => <article key={reservation.id} className="admin-recent-order" style={{ marginBottom: 8 }}>
                <span><strong>{reservation.party_size} guest{reservation.party_size === 1 ? "" : "s"}</strong><small>{new Date(reservation.slot_time).toLocaleString()}{reservation.notes ? ` · ${reservation.notes}` : ""}</small></span>
                <span className="admin-recent-status">{reservation.status}</span>
              </article>)}
            </section>}
            <ScheduledOrdersManager />
          </div>
        )}

        {/* TAB 5: Vouchers & Discounts */}
        {activeTab === "vouchers" && (
          <div>
            <div style={{ marginBottom: "20px" }}>
              <h2 style={{ margin: "0 0 6px 0", fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>
                Vouchers &amp; Exclusive Deals
              </h2>
              <p style={{ margin: 0, fontSize: "14px", color: "#64748b" }}>
                Special discount coupons for verified customers.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "20px",
                borderRadius: "18px",
                background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
                border: "2px dashed #86efac",
              }}
            >
              <div>
                <span
                  style={{
                    display: "inline-block",
                    padding: "4px 10px",
                    borderRadius: "8px",
                    background: "#166534",
                    color: "#ffffff",
                    fontSize: "12px",
                    fontWeight: 800,
                    marginBottom: "8px",
                  }}
                >
                  HOME10
                </span>
                <strong style={{ display: "block", fontSize: "16px", color: "#14532d" }}>
                  10% OFF on Your First Order
                </strong>
                <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#166534" }}>
                  Enter this code at checkout to receive 10% off your entire food subtotal.
                </p>
              </div>
              <Link
                href="/menu"
                style={{
                  padding: "10px 18px",
                  background: "#166534",
                  color: "#ffffff",
                  borderRadius: "12px",
                  fontSize: "13px",
                  fontWeight: 700,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                Use Voucher →
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Customer Auth Modal */}
      <CustomerAuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
        initialMode={authMode}
        initialReason={
          isVerified
            ? "Switch or verify another customer account."
            : "Complete 6-digit Email OTP verification to activate your customer profile."
        }
      />
      </div>
    </>
  );
}

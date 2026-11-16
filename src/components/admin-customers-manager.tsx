"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Image from "next/image";
import type { DbCustomer } from "@/lib/store-db";

type FilterTab = "all" | "verified" | "google" | "email";

export function AdminCustomersManager() {
  const [customers, setCustomers] = useState<DbCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // New customer modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newProvider, setNewProvider] = useState<"google" | "email">("google");
  const [addBusy, setAddBusy] = useState(false);

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await fetch("/api/customers", { cache: "no-store" });
      const data = await res.json() as { ok?: boolean; customers?: DbCustomer[]; error?: string };
      if (!res.ok || !data.customers) {
        throw new Error(data.error || "Failed to load customers");
      }
      setCustomers(data.customers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error fetching customers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/customers?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete customer");
      setCustomers((prev) => prev.filter((c) => c.id !== id));
      setDeleteConfirmId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newEmail.includes("@")) {
      alert("Please provide a valid email");
      return;
    }
    setAddBusy(true);
    try {
      const avatarUrl =
        newProvider === "google"
          ? `https://ui-avatars.com/api/?name=${encodeURIComponent(newName || "User")}&background=4285F4&color=ffffff&size=150`
          : `https://ui-avatars.com/api/?name=${encodeURIComponent(newName || "User")}&background=173f2b&color=ffffff&size=150`;

      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim() || "Customer",
          email: newEmail.trim().toLowerCase(),
          phone: newPhone.trim(),
          avatarUrl,
          authProvider: newProvider,
          emailVerified: true,
        }),
      });

      const data = await res.json() as { ok?: boolean; customer?: DbCustomer; error?: string };
      if (!res.ok || !data.customer) {
        throw new Error(data.error || "Failed to add customer");
      }

      setCustomers((prev) => [data.customer!, ...prev]);
      setIsAddModalOpen(false);
      setNewName("");
      setNewEmail("");
      setNewPhone("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add customer");
    } finally {
      setAddBusy(false);
    }
  };

  // Filtered customers
  const filteredCustomers = useMemo(() => {
    return customers.filter((cust) => {
      const matchesSearch =
        cust.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cust.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (cust.phone && cust.phone.includes(searchQuery));

      if (!matchesSearch) return false;

      if (activeTab === "verified") return cust.emailVerified;
      if (activeTab === "google") return cust.authProvider === "google";
      if (activeTab === "email") return cust.authProvider === "email";
      return true;
    });
  }, [customers, searchQuery, activeTab]);

  // Statistics
  const totalCount = customers.length;
  const verifiedCount = customers.filter((c) => c.emailVerified).length;
  const googleCount = customers.filter((c) => c.authProvider === "google").length;
  const emailCount = customers.filter((c) => c.authProvider === "email").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Top Header Card */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          background: "#ffffff",
          padding: "24px",
          borderRadius: "16px",
          border: "1px solid #e5e7eb",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
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
            STORE DIRECTORY &amp; AUTH SYNC
          </span>
          <h1 style={{ margin: "4px 0 6px 0", fontSize: "24px", fontWeight: 700, color: "#111827" }}>
            Customer Management
          </h1>
          <p style={{ margin: 0, fontSize: "14px", color: "#6b7280" }}>
            Live customer profiles synchronized from Google OAuth and secure email OTP verifications.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            onClick={fetchCustomers}
            disabled={loading}
            style={{
              padding: "9px 16px",
              borderRadius: "10px",
              border: "1px solid #d1d5db",
              background: "#ffffff",
              color: "#374151",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>↻</span> {loading ? "Syncing…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            style={{
              padding: "9px 18px",
              borderRadius: "10px",
              border: "none",
              background: "#173f2b",
              color: "#ffffff",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 2px 6px rgba(23,63,43,0.25)",
            }}
          >
            <span>+</span> Add Customer
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "16px",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            padding: "20px",
            borderRadius: "16px",
            border: "1px solid #e5e7eb",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>
            Total Customers
          </div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#111827", margin: "6px 0 2px 0" }}>
            {totalCount}
          </div>
          <div style={{ fontSize: "12px", color: "#16a34a", fontWeight: 500 }}>Active registered accounts</div>
        </div>

        <div
          style={{
            background: "#ffffff",
            padding: "20px",
            borderRadius: "16px",
            border: "1px solid #e5e7eb",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>
            Verified Accounts
          </div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#16a34a", margin: "6px 0 2px 0" }}>
            {verifiedCount}
          </div>
          <div style={{ fontSize: "12px", color: "#6b7280" }}>
            {totalCount ? Math.round((verifiedCount / totalCount) * 100) : 0}% OTP confirmed
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            padding: "20px",
            borderRadius: "16px",
            border: "1px solid #e5e7eb",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>
            Google Sign-Ins
          </div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#2563eb", margin: "6px 0 2px 0" }}>
            {googleCount}
          </div>
          <div style={{ fontSize: "12px", color: "#6b7280" }}>OAuth profile sync</div>
        </div>

        <div
          style={{
            background: "#ffffff",
            padding: "20px",
            borderRadius: "16px",
            border: "1px solid #e5e7eb",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>
            Email OTP Accounts
          </div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#7c3aed", margin: "6px 0 2px 0" }}>
            {emailCount}
          </div>
          <div style={{ fontSize: "12px", color: "#6b7280" }}>Direct passkey verification</div>
        </div>
      </div>

      {/* Main Table Card */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          border: "1px solid #e5e7eb",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          overflow: "hidden",
        }}
      >
        {/* Search & Filter Toolbar */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "14px",
          }}
        >
          {/* Tabs */}
          <div style={{ display: "flex", gap: "6px", background: "#f3f4f6", padding: "4px", borderRadius: "10px" }}>
            {(
              [
                ["all", `All (${totalCount})`],
                ["verified", `Verified (${verifiedCount})`],
                ["google", `Google (${googleCount})`],
                ["email", `Email (${emailCount})`],
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  background: activeTab === tab ? "#ffffff" : "transparent",
                  color: activeTab === tab ? "#111827" : "#6b7280",
                  boxShadow: activeTab === tab ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div style={{ position: "relative", minWidth: "260px" }}>
            <span
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "#9ca3af",
                fontSize: "14px",
              }}
            >
              ⌕
            </span>
            <input
              type="text"
              placeholder="Search by name, email, phone…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px 8px 34px",
                borderRadius: "10px",
                border: "1px solid #d1d5db",
                fontSize: "13px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        {/* Table Content */}
        {error && (
          <div style={{ padding: "20px", color: "#dc2626", background: "#fef2f2" }}>⚠️ {error}</div>
        )}

        {filteredCustomers.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: "42px", color: "#9ca3af", marginBottom: "12px" }}>👥</div>
            <h3 style={{ margin: "0 0 6px 0", fontSize: "16px", color: "#111827" }}>No customers found</h3>
            <p style={{ margin: 0, fontSize: "13px", color: "#6b7280" }}>
              {searchQuery
                ? "No customer matches your search filter."
                : "New customer accounts will automatically appear here once email OTP is verified."}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb", color: "#4b5563" }}>
                  <th style={{ padding: "14px 20px", fontWeight: 600 }}>Customer</th>
                  <th style={{ padding: "14px 20px", fontWeight: 600 }}>Email Address</th>
                  <th style={{ padding: "14px 20px", fontWeight: 600 }}>Phone</th>
                  <th style={{ padding: "14px 20px", fontWeight: 600 }}>Provider</th>
                  <th style={{ padding: "14px 20px", fontWeight: 600 }}>Status</th>
                  <th style={{ padding: "14px 20px", fontWeight: 600 }}>Registered</th>
                  <th style={{ padding: "14px 20px", fontWeight: 600, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((cust) => {
                  const initials = cust.name
                    ? cust.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)
                    : "CU";

                  const regDate = cust.createdAt
                    ? new Intl.DateTimeFormat("en-PK", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(cust.createdAt))
                    : "—";

                  return (
                    <tr
                      key={cust.id}
                      style={{
                        borderBottom: "1px solid #f3f4f6",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {/* Name & Avatar */}
                      <td style={{ padding: "14px 20px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          {cust.avatarUrl ? (
                            <Image
                              src={cust.avatarUrl}
                              alt=""
                              width={36}
                              height={36}
                              unoptimized
                              style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "36px",
                                height: "36px",
                                borderRadius: "50%",
                                background: "#173f2b",
                                color: "#ffffff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 700,
                                fontSize: "13px",
                                flexShrink: 0,
                              }}
                            >
                              {initials}
                            </div>
                          )}
                          <div>
                            <strong style={{ display: "block", color: "#111827", fontSize: "14px" }}>
                              {cust.name}
                            </strong>
                            <small style={{ color: "#9ca3af", fontSize: "11px" }}>ID: {cust.id}</small>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td style={{ padding: "14px 20px", color: "#374151" }}>
                        <strong>{cust.email}</strong>
                      </td>

                      {/* Phone */}
                      <td style={{ padding: "14px 20px", color: "#6b7280" }}>
                        {cust.phone || <span style={{ color: "#9ca3af" }}>Not provided</span>}
                      </td>

                      {/* Provider */}
                      <td style={{ padding: "14px 20px" }}>
                        {cust.authProvider === "google" ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              padding: "4px 10px",
                              borderRadius: "9999px",
                              background: "#eff6ff",
                              color: "#1d4ed8",
                              fontWeight: 600,
                              fontSize: "12px",
                              border: "1px solid #bfdbfe",
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24">
                              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z" />
                              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z" />
                              <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
                              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                            </svg>
                            Google
                          </span>
                        ) : (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "4px 10px",
                              borderRadius: "9999px",
                              background: "#f5f3ff",
                              color: "#6d28d9",
                              fontWeight: 600,
                              fontSize: "12px",
                              border: "1px solid #ddd6fe",
                            }}
                          >
                            ✉ Email OTP
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td style={{ padding: "14px 20px" }}>
                        {cust.emailVerified ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "4px 10px",
                              borderRadius: "9999px",
                              background: "#f0fdf4",
                              color: "#15803d",
                              fontWeight: 600,
                              fontSize: "12px",
                              border: "1px solid #bbf7d0",
                            }}
                          >
                            ✓ Verified
                          </span>
                        ) : (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "4px 10px",
                              borderRadius: "9999px",
                              background: "#fffbeb",
                              color: "#b45309",
                              fontWeight: 600,
                              fontSize: "12px",
                              border: "1px solid #fde68a",
                            }}
                          >
                            ⏳ Pending
                          </span>
                        )}
                      </td>

                      {/* Registration Date */}
                      <td style={{ padding: "14px 20px", color: "#6b7280", whiteSpace: "nowrap" }}>
                        {regDate}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: "14px 20px", textAlign: "right" }}>
                        {deleteConfirmId === cust.id ? (
                          <div style={{ display: "inline-flex", gap: "6px" }}>
                            <button
                              type="button"
                              onClick={() => handleDelete(cust.id)}
                              style={{
                                background: "#dc2626",
                                color: "#ffffff",
                                border: "none",
                                borderRadius: "6px",
                                padding: "4px 10px",
                                fontSize: "11px",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(null)}
                              style={{
                                background: "#f3f4f6",
                                color: "#4b5563",
                                border: "1px solid #d1d5db",
                                borderRadius: "6px",
                                padding: "4px 8px",
                                fontSize: "11px",
                                cursor: "pointer",
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(cust.id)}
                            style={{
                              background: "none",
                              border: "1px solid #fecaca",
                              borderRadius: "8px",
                              padding: "5px 10px",
                              color: "#ef4444",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: "pointer",
                              transition: "background 0.15s",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "#fef2f2")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manual Add Customer Modal */}
      {isAddModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99999,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddModalOpen(false);
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "20px",
              padding: "28px",
              width: "100%",
              maxWidth: "440px",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
              <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#111827" }}>
                Add New Customer
              </h2>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#6b7280" }}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateCustomer}>
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#4b5563", marginBottom: "6px" }}>
                  Customer Name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Tariq Mehmood"
                  required
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "10px",
                    border: "1px solid #d1d5db",
                    fontSize: "13px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#4b5563", marginBottom: "6px" }}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="tariq@gmail.com"
                  required
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "10px",
                    border: "1px solid #d1d5db",
                    fontSize: "13px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#4b5563", marginBottom: "6px" }}>
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="0300 1234567"
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "10px",
                    border: "1px solid #d1d5db",
                    fontSize: "13px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#4b5563", marginBottom: "6px" }}>
                  Auth Provider
                </label>
                <select
                  value={newProvider}
                  onChange={(e) => setNewProvider(e.target.value as "google" | "email")}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "10px",
                    border: "1px solid #d1d5db",
                    fontSize: "13px",
                    background: "#ffffff",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="google">Google OAuth</option>
                  <option value="email">Email OTP</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={addBusy}
                style={{
                  width: "100%",
                  padding: "12px",
                  background: "#173f2b",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "12px",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {addBusy ? "Saving…" : "Save Customer"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

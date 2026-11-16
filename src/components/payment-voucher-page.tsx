"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { useCart } from "@/components/cart-provider";
import { isCustomerVerified, CUSTOMER_AUTH_EVENT } from "@/lib/customer";
import { loadCustomerOrders, readCustomerProfile, type OrderRequest } from "@/lib/customer";
import { CustomerAuthModal } from "@/components/customer-auth-modal";
import { useKitchenAvailability } from "@/hooks/use-kitchen-availability";
import { REALTIME_SYNC_EVENT } from "@/lib/realtime-client";
import {
  generateEmvcoRaastQrString,
  RAAST_MERCHANT_IBAN,
  RAAST_MERCHANT_NAME,
  RAAST_REF_NUMBER,
  MCB_NATIVE_QR,
} from "@/lib/emvco-qr";

const money = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 });

export function PaymentVoucherPage() {
  const { items } = useCart();
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const kitchen = useKitchenAvailability();
  const [uploadMessage, setUploadMessage] = useState("");
  const [currentOrder, setCurrentOrder] = useState<OrderRequest | null>(null);
  const challanRef = useRef<HTMLElement>(null);

  const amount = useMemo(() => items.reduce((sum, item) => sum + item.price * item.quantity, 0), [items]);

  const emvcoPayload = useMemo(() => {
    return generateEmvcoRaastQrString({
      merchantName: RAAST_MERCHANT_NAME,
      ref: RAAST_REF_NUMBER,
      iban: RAAST_MERCHANT_IBAN,
      amount,
      city: "Bahawalpur",
      purpose: "Food Order",
    });
  }, [amount]);

  const orderItems = items.map((item) => `${item.name} (${item.portion}) × ${item.quantity}`).join(", ");
  useEffect(() => {
    void loadCustomerOrders().then((orders) => setCurrentOrder(orders[0] || null)).catch((error: unknown) => {
      if (error instanceof Error && !error.message.includes("401")) console.error("Could not load current order from Supabase.", error);
    });
    const onRealtime = (event: Event) => {
      const detail = (event as CustomEvent<{ table?: string }>).detail;
      if (detail?.table === "orders") void loadCustomerOrders().then((orders) => setCurrentOrder(orders[0] || null));
    };
    window.addEventListener(REALTIME_SYNC_EVENT, onRealtime);
    return () => window.removeEventListener(REALTIME_SYNC_EVENT, onRealtime);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setNow(Date.now());
      setIsVerified(isCustomerVerified());
    });

    const handleAuthChange = () => {
      setIsVerified(isCustomerVerified());
    };
    window.addEventListener(CUSTOMER_AUTH_EVENT, handleAuthChange);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener(CUSTOMER_AUTH_EVENT, handleAuthChange);
    };
  }, [amount]);

  function openPaymentQr() {
    if (amount <= 0) return;
    if (!isCustomerVerified()) {
      setAuthModalOpen(true);
      return;
    }
    setIsQrOpen(true);
  }

  async function uploadSlip(file: File) {
    if (!currentOrder) {
      setUploadMessage("Place and save an order first, then upload its receipt.");
      return;
    }
    if (file.size > 5 * 1024 * 1024 || !file.type.startsWith("image/")) {
      setUploadMessage("Upload a JPG, PNG, or WebP image up to 5 MB.");
      return;
    }
    const form = new FormData();
    form.set("number", currentOrder.number);
    form.set("phone", readCustomerProfile()?.phone || "");
    form.set("file", file);
    const response = await fetch("/api/upload-slip", { method: "POST", body: form });
    const data = await response.json() as { error?: string };
    if (!response.ok) throw new Error(data.error || "Payment slip could not be uploaded.");
    setCurrentOrder({ ...currentOrder, status: "Process" });
    setUploadMessage("Payment slip uploaded. Your order is now Process.");
  }

  async function downloadChallanPdf() {
    const challan = challanRef.current;
    if (!challan || !currentOrder) return;
    const previousStyle = challan.getAttribute("style");
    try {
      Object.assign(challan.style, { display: "block", position: "fixed", top: "0", left: "-10000px", width: "760px", zIndex: "-1", background: "#fff" });
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const canvas = await html2canvas(challan, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const margin = 24;
      const ratio = Math.min((pdf.internal.pageSize.getWidth() - margin * 2) / canvas.width, (pdf.internal.pageSize.getHeight() - margin * 2) / canvas.height);
      const width = canvas.width * ratio;
      const height = canvas.height * ratio;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", (pdf.internal.pageSize.getWidth() - width) / 2, margin, width, height);
      pdf.save(`homefood-challan-${currentOrder.number.replace(/[^a-z0-9-]/gi, "")}.pdf`);
    } catch (error) {
      console.error("Could not generate the challan PDF.", error);
      setUploadMessage(error instanceof Error ? error.message : "Could not generate the challan PDF.");
    } finally {
      if (previousStyle === null) challan.removeAttribute("style");
      else challan.setAttribute("style", previousStyle);
    }
  }

  const dueDate = now === null ? "Today" : new Intl.DateTimeFormat("en-PK", { day: "2-digit", month: "2-digit", year: "numeric" }).format(now);

  return (
    <main className="voucher-checkout-page">
      <div className="voucher-page-heading">
        <div>
          <p className="voucher-kicker">CHECKOUT · PAYMENT</p>
          <h1>My Order Payment</h1>
          <p>Review the payable amount, then scan the MCB Raast merchant QR.</p>
        </div>
        <Link href="/menu" className="voucher-back-link">
          ← Back to menu
        </Link>
      </div>

      {items.length === 0 ? (
        <section className="voucher-empty">
          <h2>No order to pay</h2>
          <p>Your cart is empty. Add food from the menu to continue.</p>
          <Link href="/menu" className="voucher-primary-link">
            Browse menu
          </Link>
        </section>
      ) : (
        <>
          {kitchen && !kitchen.available && (
            <section className="notice" role="alert" style={{ marginBottom: 18, borderColor: "#f59e0b" }}>
              <strong>Kitchen currently closed</strong>
              <p>{kitchen.reason}</p>
              <small>Opening schedule: {kitchen.schedule}</small>
            </section>
          )}
          <section className="voucher-table-card" aria-label="Order payment details">
            <div className="voucher-table-title">
              <div>
                <h2>Checkout payment</h2>
                <p>One current order · payment status updates after merchant verification</p>
              </div>
              <span className="voucher-order-count">1 pending order</span>
            </div>
            <div className="voucher-table-scroll">
              <table className="voucher-table">
                <thead>
                  <tr>
                    <th scope="col">Title</th>
                    <th scope="col">Order #</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Due date</th>
                    <th scope="col">Status</th>
                    <th scope="col">Remarks</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <strong>Home Made Food order</strong>
                      <small>{items.reduce((sum, item) => sum + item.quantity, 0)} food items</small>
                    </td>
                    <td className="voucher-ref">{currentOrder?.number || "Awaiting order"}</td>
                    <td className="voucher-amount">PKR {money.format(amount)}</td>
                    <td>{dueDate}</td>
                    <td>
                      <span className={`voucher-status ${currentOrder?.status === "Paid" ? "is-paid" : currentOrder?.status === "Process" ? "is-process" : "is-pending"}`}>
                        {currentOrder?.status === "Paid" ? "Paid" : currentOrder?.status === "Process" ? "Process" : "Pending"}
                      </span>
                    </td>
                    <td className="voucher-remarks">{orderItems || "—"}</td>
                    <td>
                      <div className="voucher-payment-actions">
                        <button type="button" className="voucher-qr-action" onClick={openPaymentQr} disabled={kitchen?.available !== true || !currentOrder}>{!isVerified ? "Verify account to pay" : "RAAST QR (Scan to Pay)"}</button>
                        <label className={`voucher-qr-action ${!currentOrder ? "is-disabled" : ""}`}>Upload Transaction Slip<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!currentOrder || kitchen?.available !== true} hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadSlip(file).catch((error) => setUploadMessage(error instanceof Error ? error.message : "Upload failed.")); event.currentTarget.value = ""; }} /></label>
                        <button type="button" className="voucher-qr-action" onClick={() => void downloadChallanPdf()} disabled={!currentOrder}>Download Challan</button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {uploadMessage && <p className="voucher-footnote" role="status">{uploadMessage}</p>}
            <div className="voucher-total-bar">
              <span>Exact payable amount</span>
              <strong>PKR {money.format(amount)}</strong>
            </div>
            <p className="voucher-footnote">
              Orders and delivery are confirmed by the store. Payment is not marked paid until the merchant verifies the bank transfer.
            </p>
          </section>

          <section ref={challanRef} className="voucher-order-items" aria-label="Printable challan voucher">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {readCustomerProfile()?.avatarUrl && <img src={readCustomerProfile()?.avatarUrl} alt="Customer profile" width={48} height={48} style={{ borderRadius: "50%", objectFit: "cover" }} />}
              <div><h2>Challan voucher</h2><p>Customer details and payment references for PKR {money.format(amount)}.</p></div>
            </div>
            <p>{readCustomerProfile()?.name || "Customer"} · {readCustomerProfile()?.phone || "Phone on order"} · {readCustomerProfile()?.email || "Email on profile"}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 16 }}>
              <div><QRCodeSVG value={emvcoPayload} size={120} /><small>Payment / Cart Total</small></div>
              <div><QRCodeSVG value={MCB_NATIVE_QR} size={120} /><small>Merchant Raast · MUMTAZ ALI · Ref 9955</small></div>
              <div><QRCodeSVG value="https://homefood.engineer/about" size={120} /><small>Restaurant &amp; Social Connect</small></div>
            </div>
          </section>

          <section className="voucher-order-items">
            <h2>Order details</h2>
            {items.map((item) => (
              <div className="voucher-item-row" key={`${item.id}-${item.portion}-${item.specialInstructions ?? ""}`}>
                <span>
                  {item.name}
                  <small>
                    {item.portion} · Qty {item.quantity}
                    {item.specialInstructions ? ` · Note: ${item.specialInstructions}` : ""}
                  </small>
                </span>
                <strong>PKR {money.format(item.price * item.quantity)}</strong>
              </div>
            ))}
            <div className="voucher-item-total">
              <span>Total</span>
              <strong>PKR {money.format(amount)}</strong>
            </div>
          </section>
        </>
      )}

      {/* RAAST QR PAYMENT MODAL */}
      <AnimatePresence>
        {isQrOpen && (
          <motion.div
            className="voucher-qr-backdrop"
            role="presentation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setIsQrOpen(false);
            }}
          >
            <motion.section
              className="voucher-qr-modal voucher-qr-modal-minimal"
              role="dialog"
              aria-modal="true"
              aria-label="Raast payment QR"
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              style={{ maxWidth: "460px", width: "95%" }}
            >
              <button
                type="button"
                className="voucher-qr-close"
                aria-label="Close QR payment"
                onClick={() => setIsQrOpen(false)}
              >
                ×
              </button>

              <div className="voucher-minimal-qr-card"><QRCodeSVG value={emvcoPayload} size={260} level="M" includeMargin style={{ display: "block", maxWidth: "100%", height: "auto" }} /></div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Customer Email OTP Verification Modal */}
      <CustomerAuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={() => {
          setIsVerified(true);
          openPaymentQr();
        }}
        initialMode="signup"
        initialReason="Verify your email or mobile number with a 6-digit code to unlock order payment."
      />
    </main>
  );
}

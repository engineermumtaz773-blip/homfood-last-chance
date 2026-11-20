"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { getLiveOrderStatus, type LiveOrderStatus } from "@/lib/order-api";
import type { StoreSettings } from "@/lib/store-db";
import { generateEmvcoRaastQrString, RAAST_MERCHANT_IBAN, RAAST_MERCHANT_NAME, RAAST_REF_NUMBER } from "@/lib/emvco-qr";

const money = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 });
const cancelWindowMs = 5 * 60 * 1000;

export function OrderConfirmation() {
  const params = useSearchParams();
  const number = params.get("order") || "";
  const phone = params.get("phone") || "";
  const [order, setOrder] = useState<LiveOrderStatus | null>(null);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [receiptName, setReceiptName] = useState("");
  const [receiptPreview, setReceiptPreview] = useState("");
  const [receiptMessage, setReceiptMessage] = useState("");
  const qrRef = useRef<SVGSVGElement>(null);

  const refreshOrder = useCallback(async () => {
    if (!number || phone.replace(/\D/g, "").length < 10) {
      setError("This confirmation link is missing the order number or the phone used at checkout.");
      setLoading(false);
      return;
    }
    try {
      const currentOrder = await getLiveOrderStatus(number, phone);
      setOrder(currentOrder);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not load this order.");
    } finally {
      setLoading(false);
    }
  }, [number, phone]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void refreshOrder(); });
    const poll = window.setInterval(() => void refreshOrder(), 3_000);
    return () => { window.cancelAnimationFrame(frame); window.clearInterval(poll); };
  }, [refreshOrder]);

  useEffect(() => {
    let active = true;
    void fetch("/api/settings", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ settings?: StoreSettings }> : null)
      .then((data) => { if (active && data?.settings) setSettings(data.settings); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!receiptPreview) return () => URL.revokeObjectURL(receiptPreview);
  }, [receiptPreview]);

  useEffect(() => {
    const createdAt = Date.parse(order?.created_at || "");
    const tick = () => setSecondsLeft(Number.isFinite(createdAt) ? Math.max(0, Math.ceil((createdAt + cancelWindowMs - Date.now()) / 1000)) : 0);
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [order?.created_at]);

  const qrValue = useMemo(() => order ? generateEmvcoRaastQrString({
    merchantName: settings?.payments.raastMerchantName || RAAST_MERCHANT_NAME,
    ref: settings?.payments.raastRef || RAAST_REF_NUMBER,
    iban: settings?.payments.bankIban || RAAST_MERCHANT_IBAN,
    amount: order.total,
    city: "Bahawalpur",
    purpose: `Order ${order.number}`,
  }) : "", [order, settings]);

  async function cancelOrder() {
    if (!order || cancelBusy || secondsLeft <= 0) return;
    setCancelBusy(true);
    setError("");
    try {
      const response = await fetch("/api/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: order.number, phone, reason: "Customer requested cancellation" }),
      });
      const data = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !data?.ok) throw new Error(data?.error || "Order cancellation failed.");
      await refreshOrder();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Order cancellation failed.");
    } finally {
      setCancelBusy(false);
    }
  }

  async function uploadReceipt(file: File) {
    if (!order) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024) {
      setReceiptMessage("Choose a JPG, PNG, or WebP receipt under 5 MB.");
      return;
    }
    setReceiptPreview((current) => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(file); });
    setReceiptName(file.name);
    setUploadBusy(true);
    setReceiptMessage("Uploading receipt…");
    const form = new FormData();
    form.set("number", order.number);
    form.set("phone", phone);
    form.set("file", file);
    try {
      const response = await fetch("/api/upload-slip", { method: "POST", body: form });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "Receipt upload failed.");
      setReceiptMessage("Receipt uploaded. Payment is awaiting merchant verification.");
      await refreshOrder();
    } catch (cause) {
      setReceiptMessage(cause instanceof Error ? cause.message : "Receipt upload failed.");
    } finally {
      setUploadBusy(false);
    }
  }

  function downloadQr() {
    if (!qrRef.current || !order) return;
    const svg = qrRef.current.cloneNode(true) as SVGSVGElement;
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${order.number.replace(/[^a-z0-9-]/gi, "-")}-raast-qr.svg`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const canCancel = Boolean(order && (order.status === "new" || order.status === "confirmed") && secondsLeft > 0);

  return <section className="order-confirmation-page">
    <section className="order-confirmation-card raast-print-challan" aria-labelledby="order-confirmation-title">
      <p className="raast-kicker">ORDER CONFIRMATION</p>
      <h1 id="order-confirmation-title">{loading ? "Loading your order…" : order ? "Your order is on its way to the kitchen" : "Order confirmation"}</h1>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!order && !loading && <Link className="checkout-raast-select" href="/track-order">Open order tracking</Link>}
      {order && <>
        <p className="order-confirmation-reference">Order <strong>{order.number}</strong> · Total <strong>PKR {money.format(order.total)}</strong></p>
        <p className="order-confirmation-status" role="status">Kitchen status: <strong>{order.status.replaceAll("_", " ")}</strong> · Payment: <strong>{(order.paymentStatus || "pending").replaceAll("_", " ")}</strong></p>
        <div className="order-confirmation-body">
          <section className="order-confirmation-qr">
            <h2>Pay with MCB Raast</h2>
            <p>Scan this dynamic QR for PKR {money.format(order.total)}. Order reference is included.</p>
            <div className="voucher-minimal-qr-card"><QRCodeSVG ref={qrRef} value={qrValue} size={240} level="M" includeMargin /></div>
            <p><strong>{settings?.payments.raastMerchantName || RAAST_MERCHANT_NAME}</strong> · Ref {settings?.payments.raastRef || RAAST_REF_NUMBER}</p>
            <div className="order-confirmation-actions">
              <button type="button" className="checkout-raast-select" onClick={downloadQr}>Download QR</button>
              <button type="button" className="checkout-raast-select" onClick={() => window.print()}>Print / Save Challan</button>
            </div>
          </section>
          <section className="order-confirmation-proof">
            <h2>Upload payment receipt</h2>
            <p>Payment stays pending until the kitchen verifies the receipt.</p>
            <label className="checkout-raast-select checkout-upload-button">
              {uploadBusy ? "Uploading receipt…" : order.paymentSlipName ? "Replace payment receipt" : "Upload QR / Payment Receipt"}
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadBusy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadReceipt(file); event.currentTarget.value = ""; }} />
            </label>
            {receiptPreview && <div className="order-receipt-preview"><Image src={receiptPreview} alt="Selected payment receipt preview" width={120} height={120} unoptimized /><span>{receiptName}</span></div>}
            {order.paymentSlipName && <p>Saved receipt: <strong>{order.paymentSlipName}</strong></p>}
            {receiptMessage && <p className="checkout-slip-state" role="status">{receiptMessage}</p>}
          </section>
        </div>
        <section className="order-cancel-window">
          <div><strong>Cancellation window</strong><span aria-live="polite">{Math.floor(secondsLeft / 60).toString().padStart(2, "0")}:{(secondsLeft % 60).toString().padStart(2, "0")} remaining</span></div>
          {canCancel ? <button type="button" className="checkout-raast-select" disabled={cancelBusy} onClick={() => void cancelOrder()}>{cancelBusy ? "Cancelling…" : "Cancel Order"}</button> : <p>{order.status === "cancelled" ? "This order has been cancelled." : secondsLeft === 0 ? "The five-minute cancellation window has ended." : "Cancellation is unavailable after kitchen preparation starts."}</p>}
        </section>
        <p className="order-confirmation-live-note">Order status refreshes automatically every few seconds.</p>
        <Link className="checkout-raast-select" href={`/track-order?order=${encodeURIComponent(order.number)}&phone=${encodeURIComponent(phone)}`}>Continue to live order tracking</Link>
      </>}
    </section>
  </section>;
}

"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { useCart } from "@/components/cart-provider";
import { CUSTOMER_AUTH_EVENT, readCustomerProfile, saveCustomerProfile, saveOrderRequest, type CustomerProfile } from "@/lib/customer";
import { whatsappUrl } from "@/lib/data";
import { createLiveOrder } from "@/lib/order-api";
import { saveRaastSession, useRaastSessionStore } from "@/lib/raast-session";
import { useSiteSettings } from "@/components/site-settings";
import { MCB_NATIVE_QR, RAAST_MERCHANT_IBAN, RAAST_MERCHANT_NAME, RAAST_REF_NUMBER, generateEmvcoRaastQrString } from "@/lib/emvco-qr";
import { useKitchenAvailability } from "@/hooks/use-kitchen-availability";
import type { StoreSettings } from "@/lib/store-db";
import { REALTIME_SYNC_EVENT } from "@/lib/realtime-client";

const paymentSessionDuration = 5 * 60 * 1000;
const money = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 });

function vcardValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function CheckoutForm() {
  const { t } = useSiteSettings();
  const { items, removeItem, updateQuantity } = useCart();
  const kitchen = useKitchenAvailability();
  const [payment, setPayment] = useState("Cash on Delivery");
  const [promoInput, setPromoInput] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [promoMessage, setPromoMessage] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<string[]>([]);
  const [selectedSavedAddress, setSelectedSavedAddress] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryArea, setDeliveryArea] = useState("");
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const raastStore = useRaastSessionStore();
  const raastSession = useSyncExternalStore(raastStore.subscribe, raastStore.getClientSnapshot, raastStore.getServerSnapshot);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [timerReady, setTimerReady] = useState(false);
  const [ibanCopied, setIbanCopied] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "verification_pending" | "paid" | "rejected">("pending");
  const [slipUploadMessage, setSlipUploadMessage] = useState("");
  const subtotal = items.reduce((total, item) => total + item.price * item.quantity, 0);
  const discount = promoCode === "HOME10" ? Math.round(subtotal * 0.1) : 0;
  const total = subtotal - discount;
  const restaurantQr = useMemo(() => {
    const restaurant = storeSettings?.restaurant;
    const social = storeSettings?.social;
    return [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${vcardValue(restaurant?.name || "Home Made Food")}`,
      restaurant?.phone ? `TEL;TYPE=WORK,VOICE:${vcardValue(restaurant.phone)}` : "",
      restaurant?.email ? `EMAIL:${vcardValue(restaurant.email)}` : "",
      restaurant?.address ? `ADR;TYPE=WORK:;;${vcardValue(restaurant.address)}` : "",
      "URL:https://www.homefood.engineer",
      social?.facebook ? `X-SOCIALPROFILE;TYPE=facebook:${vcardValue(social.facebook)}` : "",
      social?.instagram ? `X-SOCIALPROFILE;TYPE=instagram:${vcardValue(social.instagram)}` : "",
      social?.tiktok ? `X-SOCIALPROFILE;TYPE=tiktok:${vcardValue(social.tiktok)}` : "",
      "END:VCARD",
    ].filter(Boolean).join("\n");
  }, [storeSettings]);

  useEffect(() => {
    if (!raastSession) return;
    const updateCountdown = () => {
      setSecondsLeft(Math.max(0, Math.ceil((raastSession.expiresAt - Date.now()) / 1000)));
      setTimerReady(true);
    };
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [raastSession]);

  useEffect(() => {
    if (raastSession) setPaymentModalOpen(true);
  }, [raastSession]);

  useEffect(() => {
    if (!raastSession) return;
    let active = true;
    const refreshPaymentStatus = async () => {
      try {
        const params = new URLSearchParams({ number: raastSession.orderNumber, phone: customerPhone });
        const response = await fetch(`/api/orders?${params}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Order status lookup failed (${response.status}).`);
        const data = await response.json() as { order?: { paymentStatus?: string } };
        const value = data.order?.paymentStatus;
        if (active && (value === "pending" || value === "verification_pending" || value === "paid" || value === "rejected")) {
          setPaymentStatus(value);
        }
      } catch (error) {
        console.error("Could not refresh payment status from Supabase.", error);
      }
    };
    void refreshPaymentStatus();
    window.addEventListener(REALTIME_SYNC_EVENT, refreshPaymentStatus);
    return () => {
      active = false;
      window.removeEventListener(REALTIME_SYNC_EVENT, refreshPaymentStatus);
    };
  }, [raastSession, customerPhone]);

  async function uploadPaymentSlip(file: File) {
    if (!raastSession) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setSlipUploadMessage("Choose a JPG, PNG, or WebP receipt under 5 MB.");
      return;
    }
    setSlipUploadMessage("Uploading receipt…");
    const form = new FormData();
    form.set("number", raastSession.orderNumber);
    form.set("phone", customerPhone);
    form.set("file", file);
    const response = await fetch("/api/upload-slip", { method: "POST", body: form });
    const data = await response.json() as { error?: string; order?: { paymentStatus?: string } };
    if (!response.ok) throw new Error(data.error || "Payment receipt upload failed.");
    setPaymentStatus(data.order?.paymentStatus === "verification_pending" ? "verification_pending" : "pending");
    setSlipUploadMessage("Receipt uploaded. Payment is in Process while the kitchen verifies it.");
  }

  async function downloadChallanPdf() {
    const challan = document.querySelector<HTMLElement>(".raast-print-challan");
    if (!challan || !raastSession) return;
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
      pdf.save(`homefood-challan-${raastSession.orderNumber.replace(/[^a-z0-9-]/gi, "")}.pdf`);
    } catch (error) {
      console.error("Could not generate the challan PDF.", error);
      setSubmitError(error instanceof Error ? error.message : "Could not generate the challan PDF.");
    } finally {
      if (previousStyle === null) challan.removeAttribute("style");
      else challan.setAttribute("style", previousStyle);
    }
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const profile = readCustomerProfile();
      setCustomerProfile(profile);
      if (profile) {
        setCustomerName(profile.name);
        setCustomerPhone(profile.phone);
        setCustomerEmail(profile.email || "");
        setSavedAddresses(profile.addresses);
        setDeliveryAddress(profile.addresses[0] || "");
      }
      const preferredPayment = profile?.preferredPayment;
      if (
        preferredPayment === "Cash on Delivery" ||
        preferredPayment === "Digital Payment" ||
        preferredPayment === "Confirm on WhatsApp"
      ) setPayment(preferredPayment);
    });
    const onCustomerAuth = (event: Event) => {
      const profile = (event as CustomEvent<CustomerProfile | null>).detail;
      setCustomerProfile(profile);
      if (!profile) return;
      setCustomerName(profile.name);
      setCustomerPhone(profile.phone);
      setCustomerEmail(profile.email || "");
      setSavedAddresses(profile.addresses);
      setDeliveryAddress(profile.addresses[0] || "");
    };
    window.addEventListener(CUSTOMER_AUTH_EVENT, onCustomerAuth);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener(CUSTOMER_AUTH_EVENT, onCustomerAuth); };
  }, []);

  useEffect(() => {
    let active = true;
    const loadSettings = async () => {
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        if (!response.ok) throw new Error(`Store settings request failed (${response.status}).`);
        const data = await response.json() as { settings?: StoreSettings };
        if (active && data.settings) setStoreSettings(data.settings);
      } catch (error) {
        console.error("Could not refresh checkout store settings from Supabase.", error);
        if (active) setStoreSettings(null);
      }
    };
    void loadSettings();
    const interval = window.setInterval(loadSettings, 5_000);
    window.addEventListener(REALTIME_SYNC_EVENT, loadSettings);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener(REALTIME_SYNC_EVENT, loadSettings);
    };
  }, []);

  function selectSavedAddress(value: string) {
    setSelectedSavedAddress(value);
    if (!value) return;
    const knownAreas = ["Bahawalpur city", "Model Town", "University Chowk", "Other Bahawalpur area"];
    const area = knownAreas.find((candidate) => value.endsWith(`, ${candidate}`));
    setDeliveryArea(area ?? "Other Bahawalpur area");
    setDeliveryAddress(area ? value.slice(0, -(area.length + 2)) : value);
  }

  function applyPromo() {
    const code = promoInput.trim().toUpperCase();
    if (code === "HOME10") {
      setPromoCode(code);
      setPromoMessage("HOME10 applied — 10% off your food subtotal.");
      return;
    }
    setPromoCode("");
    setPromoMessage(code ? "That promo code isn’t available. Try HOME10." : "Enter a promo code first.");
  }

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || raastSession) return;
    setIsSubmitting(true);
    setSubmitError("");
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const area = String(formData.get("area") ?? "").trim();
    const address = String(formData.get("address") ?? "").trim();
    const deliveryTime = String(formData.get("deliveryTime") ?? "As soon as possible").trim();
    const notes = [String(formData.get("notes") ?? "").trim(), `Requested delivery: ${deliveryTime}`].filter(Boolean).join("\n");
    const orderLines = items.map((item) => `- ${item.name} (${item.portion}) x${item.quantity}: Rs. ${item.price * item.quantity}${item.specialInstructions ? `\n  Kitchen note: ${item.specialInstructions}` : ""}`).join("\n");
    let orderNumber: string;
    let orderTotal: number;
    try {
      const order = await createLiveOrder({
        name,
        phone,
        email: email || undefined,
        area,
        address,
        notes: payment === "Digital Payment"
          ? [notes, "Payment method: Dynamic MCB Raast QR with the exact order amount. Payment remains pending merchant verification until approved."].filter(Boolean).join("\n").slice(0, 500)
          : notes,
        payment,
        promo_code: promoCode,
        subtotal,
        discount,
        deliveryFee: 0,
        total,
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          portion: item.portion,
          price: item.price,
          quantity: item.quantity,
          note: item.specialInstructions,
        })),
      });
      orderNumber = order.number;
      orderTotal = order.total;
    } catch (error) {
      console.error("Could not create the order in Supabase.", error);
      setSubmitError(error instanceof Error ? error.message : "The online order service could not confirm your request.");
      setIsSubmitting(false);
      return;
    }

    const paymentLabel = payment === "Digital Payment" ? "MCB Raast dynamic QR (exact amount encoded)" : payment;
    const message = `Hi Home Made Food, my online order request ${orderNumber} was submitted:\n\n${orderLines}\n\nSubtotal: Rs. ${subtotal}${discount ? `\nPromo (${promoCode}): -Rs. ${discount}` : ""}\nDelivery: FREE\nTotal: Rs. ${orderTotal}\nPayment preference: ${paymentLabel}\nName: ${name}\nPhone: ${phone}\nArea: ${area}\nAddress: ${address}${notes ? `\nNotes: ${notes}` : ""}`;
    {
      const currentProfile = readCustomerProfile();
      const previousAddresses = currentProfile?.addresses ?? [];
      const fullAddress = `${address}, ${area}`;
      saveOrderRequest({
        number: orderNumber,
        placedAt: new Date().toISOString(),
        total: orderTotal,
        payment,
        items: items.map((item) => `${item.name} (${item.portion}) × ${item.quantity}`).join(", "),
        status: payment === "Digital Payment" ? "Awaiting Raast payment verification" : "Order received",
      });
      saveCustomerProfile({
        ...(currentProfile || {}),
        name,
        phone,
        ...(email ? { email } : {}),
        addresses: [fullAddress, ...previousAddresses.filter((saved) => saved !== fullAddress)].slice(0, 5),
        preferredPayment: payment,
      });
      setCustomerProfile(readCustomerProfile());
    }
    if (payment === "Digital Payment") {
      const expiresAt = Date.now() + paymentSessionDuration;
      saveRaastSession({
        orderNumber,
        amount: orderTotal,
        expiresAt,
        whatsappMessage: `Hi Home Made Food, please verify my MCB Raast payment for order ${orderNumber} (PKR ${money.format(orderTotal)}). I will attach the bank receipt here.`,
      });
      return;
    }
    window.location.assign(whatsappUrl(message));
  }

  if (!items.length && !raastSession) return <div className="notice">{t("emptyCart")} <Link href="/menu" style={{ textDecoration: "underline" }}>{t("browseMenu")}</Link></div>;

  const paymentChoices = [
    { method: "Cash on Delivery", title: t("codChoice"), description: t("codChoiceDescription") },
    { method: "Digital Payment", title: t("raastChoice"), description: t("raastChoiceDescription") },
    { method: "Confirm on WhatsApp", title: t("whatsappChoice"), description: t("whatsappChoiceDescription") },
  ];
  const deliverySummary = deliveryAddress
    ? [deliveryAddress, deliveryArea].filter(Boolean).join(", ")
    : customerProfile?.addresses[0] || "Delivery address will appear after checkout.";

  return (
    <div className="checkout-grid">
      {kitchen && !kitchen.available && <div className="checkout-closed-notice" role="alert"><strong>Online orders are paused</strong><p>{kitchen.reason}</p><small>{kitchen.schedule}</small></div>}
      <AnimatePresence mode="wait" initial={false}>
      {raastSession ? (
        paymentModalOpen ? <motion.div key="raast-payment-backdrop" className="raast-payment-backdrop" role="presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.section className="form-card raast-payment-card" role="dialog" aria-modal="true" aria-label="Raast payment QR" initial={{ opacity: 0, y: 18, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 14, scale: 0.94 }} transition={{ duration: 0.24, ease: "easeOut" }}>
          <button type="button" className="raast-modal-close" aria-label="Close payment details" onClick={() => setPaymentModalOpen(false)}>×</button>
          <div className="voucher-minimal-qr-card"><QRCodeSVG value={generateEmvcoRaastQrString({ merchantName: RAAST_MERCHANT_NAME, ref: RAAST_REF_NUMBER, iban: RAAST_MERCHANT_IBAN, amount: raastSession.amount, city: "Bahawalpur", purpose: `Order ${raastSession.orderNumber}` })} size={260} level="M" includeMargin style={{ display: "block", maxWidth: "100%", height: "auto" }} /></div>
        </motion.section>
        </motion.div> : <motion.section key="raast-payment-resume" className="form-card raast-payment-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <p className="raast-kicker">MCB · RAAST P2M</p><h2>{t("raastPending")}</h2>
          <p className="raast-order-reference">{t("raastOrder")}: <strong>{raastSession.orderNumber}</strong></p>
          <p className="raast-order-reference">Exact payable total: <strong>PKR {money.format(raastSession.amount)}</strong></p>
          <button type="button" className="add-button" onClick={() => setPaymentModalOpen(true)}>Resume payment</button>
        </motion.section>
      ) : (
      <motion.form key="checkout-form" className="form-card checkout-form-card" onSubmit={placeOrder} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.24 }}>
        <div className="checkout-section-heading"><span>01</span><div><p>DELIVERY DETAILS</p><h2>{t("customerInfo")}</h2></div></div>
        <div className="form-grid">
          <label className="field">{t("fullName")}<input name="name" required autoComplete="name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder={t("fullName")} /></label>
          <label className="field">{t("phoneNumber")}<input name="phone" required autoComplete="tel" type="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="03xx xxxxxxx" /></label>
          <label className="field full">Email (optional)<input name="email" type="email" autoComplete="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="name@example.com" /></label>
          {savedAddresses.length > 0 && <label className="field full">Use a saved address<select value={selectedSavedAddress} onChange={(event) => selectSavedAddress(event.target.value)}><option value="">Enter a new address</option>{savedAddresses.map((saved) => <option key={saved} value={saved}>{saved}</option>)}</select></label>}
          <label className="field full">{t("deliveryArea")}<select name="area" required value={deliveryArea} onChange={(event) => setDeliveryArea(event.target.value)}><option value="" disabled>{t("chooseArea")}</option><option>Bahawalpur city</option><option>Model Town</option><option>University Chowk</option><option>Other Bahawalpur area</option></select></label>
          <label className="field full">{t("fullAddress")}<textarea name="address" required autoComplete="street-address" value={deliveryAddress} onChange={(event) => { setDeliveryAddress(event.target.value); setSelectedSavedAddress(""); }} placeholder={t("fullAddress")} /></label>
          <label className="field full">Delivery timing<select name="deliveryTime" defaultValue="As soon as possible"><option>As soon as possible</option><option>Today · 12:00–2:00 PM</option><option>Today · 2:00–5:00 PM</option><option>Today · 6:00–9:00 PM</option></select></label>
        </div>
        <div className="checkout-section-heading checkout-payment-heading"><span>02</span><div><p>PAYMENT</p><h2>{t("paymentMethod")}</h2></div></div>
        <div className="payment-grid checkout-payment-grid">
          {paymentChoices.map(({ method, title, description }) => <button key={method} type="button" className={`payment-choice ${payment === method ? "selected" : ""}`} aria-pressed={payment === method} onClick={() => setPayment(method)}><strong>{title}</strong><small>{description}</small></button>)}
        </div>
        <label className="field" style={{ marginTop: 22 }}>{t("additionalNotes")}<textarea name="notes" placeholder={t("additionalNotes")} /></label>
        {submitError && <p className="form-error" role="alert">{submitError}</p>}
        {kitchen?.available !== false && <button className="add-button checkout-submit-button" type="submit" disabled={isSubmitting || !kitchen}>{isSubmitting ? t("submittingOrder") : t("submitOrder")} <span aria-hidden="true">→</span></button>}
        <p style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.6 }}>Your request is recorded by the store before WhatsApp opens. Our team confirms preparation and delivery there; no payment is processed on this site.</p>
      </motion.form>
      )}
      </AnimatePresence>
      <aside className="summary-card checkout-summary-card">
        <div className="checkout-section-heading"><span>03</span><div><p>YOUR ORDER</p><h2>{t("orderSummary")}</h2></div></div>
        <section className="checkout-customer-summary" aria-label="Customer and delivery details">
          {customerProfile?.avatarUrl && <img src={customerProfile.avatarUrl} alt="Customer profile" width={48} height={48} />}
          <div><strong>{customerName || customerProfile?.name || "Customer"}</strong><span>{customerEmail || customerProfile?.email || "Email not provided"}</span><span>{customerPhone || customerProfile?.phone || "Phone not provided"}</span><span>{deliverySummary}</span></div>
        </section>
        <div className="checkout-table-scroll">
          <table className="checkout-order-table">
            <thead><tr><th scope="col">Item</th><th scope="col">Qty</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
            <tbody>{items.map((item) => <tr key={`${item.id}-${item.portion}-${item.specialInstructions ?? ""}`}>
              <td><strong>{item.name}</strong><small>{item.portion}{item.specialInstructions ? ` · ${item.specialInstructions}` : ""}</small></td>
              <td><span className="quantity-control checkout-quantity"><button type="button" aria-label={`Decrease ${item.name} quantity`} disabled={Boolean(raastSession)} onClick={() => updateQuantity(item.id, item.portion, item.quantity - 1, item.specialInstructions)}>−</button><span>{item.quantity}</span><button type="button" aria-label={`Increase ${item.name} quantity`} disabled={Boolean(raastSession)} onClick={() => updateQuantity(item.id, item.portion, item.quantity + 1, item.specialInstructions)}>＋</button></span></td>
              <td className="checkout-table-amount">Rs. {money.format(item.price * item.quantity)}</td>
              <td><span className={`checkout-status-pill ${raastSession ? "is-pending" : ""}`}>{raastSession ? "Pending" : "In cart"}</span></td>
              <td>{!raastSession ? <button type="button" onClick={() => removeItem(item.id, item.portion, item.specialInstructions)} className="remove-cart-item">Remove</button> : <span className="checkout-table-note">{item.specialInstructions || "—"}</span>}</td>
            </tr>)}
              <tr className="checkout-payment-row"><td data-label="Title"><strong>Payment method</strong><small>Raast transfer</small></td><td colSpan={2} className="checkout-table-amount" data-label="Amount">PKR {money.format(raastSession?.amount ?? total)}</td><td data-label="Status"><span className={`checkout-status-pill ${paymentStatus === "paid" ? "is-paid" : paymentStatus === "verification_pending" ? "is-process" : raastSession ? "is-pending" : ""}`}>{paymentStatus === "paid" ? "Paid" : paymentStatus === "verification_pending" ? "Process" : raastSession ? "Pending" : payment === "Digital Payment" ? "Selected" : "Not selected"}</span></td><td data-label="Action"><div className="checkout-payment-actions"><button type="button" className="checkout-raast-select" onClick={() => raastSession ? setPaymentModalOpen(true) : setPayment("Digital Payment")}>{raastSession ? "RAAST QR (Scan to Pay)" : payment === "Digital Payment" ? "Raast selected" : "RAAST QR (Scan to Pay)"}</button><label className={`checkout-raast-select ${!raastSession ? "is-disabled" : ""}`}>Upload Transaction Slip<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!raastSession} hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadPaymentSlip(file).catch((error: unknown) => setSlipUploadMessage(error instanceof Error ? error.message : "Receipt upload failed.")); event.currentTarget.value = ""; }} /></label><button type="button" className="checkout-raast-select" disabled={!raastSession} onClick={() => void downloadChallanPdf()}>Download Challan</button></div>{slipUploadMessage && <small className="checkout-slip-status" role="status">{slipUploadMessage}</small>}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="summary-line"><span>{t("subtotal")}</span><strong>Rs. {subtotal}</strong></div>
        <div className="promo-entry"><label htmlFor="promo-code">{t("promoCode")}</label><div><input id="promo-code" value={promoInput} onChange={(event) => setPromoInput(event.target.value)} placeholder={t("enterCode")} /><button type="button" onClick={applyPromo}>{t("apply")}</button></div>{promoMessage && <small className={promoCode ? "promo-success" : "promo-error"} role="status">{promoMessage}</small>}</div>
        {discount > 0 && <div className="summary-line"><span>Discount ({promoCode})</span><strong>− Rs. {discount}</strong></div>}
        <div className="summary-line"><span>Delivery</span><strong>FREE</strong></div>
        <div className="summary-line summary-total"><span>Total</span><strong>{raastSession ? `PKR ${money.format(raastSession.amount)}` : `Rs. ${total}`}</strong></div>
      </aside>
      {raastSession && <section className="raast-print-challan" aria-label="Printable three QR payment challan">
        <header><div><p className="raast-kicker">HOME MADE FOOD · PAYMENT CHALLAN</p><h2>{raastSession.orderNumber}</h2></div><strong>PKR {money.format(raastSession.amount)}</strong></header>
        <div className="raast-challan-customer">
          {customerProfile?.avatarUrl && <img src={customerProfile.avatarUrl} alt="Customer profile" width={52} height={52} />}
          <div><strong>{customerName || customerProfile?.name || "Customer"}</strong><span>{customerEmail || customerProfile?.email || "Email not provided"} · {customerPhone || customerProfile?.phone || "Phone not provided"}</span><span>{deliverySummary}</span></div>
        </div>
        <div className="raast-challan-items">{items.map((item) => <div key={`${item.id}-${item.portion}-${item.specialInstructions ?? ""}`}><span>{item.name} · {item.portion} × {item.quantity}</span><strong>PKR {money.format(item.price * item.quantity)}</strong></div>)}<div className="raast-challan-total"><span>Payable total</span><strong>PKR {money.format(raastSession.amount)}</strong></div></div>
        <div className="raast-challan-qrs">
          <div><QRCodeSVG value={generateEmvcoRaastQrString({ merchantName: RAAST_MERCHANT_NAME, ref: RAAST_REF_NUMBER, iban: RAAST_MERCHANT_IBAN, amount: raastSession.amount, city: "Bahawalpur", purpose: `Order ${raastSession.orderNumber}` })} size={112} /><strong>QR 1 · Auto-pay total</strong></div>
          <div><QRCodeSVG value={MCB_NATIVE_QR} size={112} /><strong>QR 2 · MCB Raast</strong><span>{RAAST_MERCHANT_NAME} · Ref {RAAST_REF_NUMBER}</span></div>
          <div><QRCodeSVG value={restaurantQr} size={112} /><strong>QR 3 · Restaurant info</strong><span>Contact and social channels</span></div>
        </div>
        <p className="raast-challan-iban">IBAN: {RAAST_MERCHANT_IBAN}</p>
      </section>}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { useCart } from "@/components/cart-provider";
import { CUSTOMER_AUTH_EVENT, readCustomerProfile, saveCustomerProfile, saveOrderRequest, type CustomerProfile } from "@/lib/customer";
import { whatsappUrl } from "@/lib/data";
import { createLiveOrder } from "@/lib/order-api";
import { saveRaastSession, useRaastSessionStore } from "@/lib/raast-session";
import { useSiteSettings } from "@/components/site-settings";
import { RAAST_MERCHANT_IBAN, RAAST_MERCHANT_NAME, RAAST_REF_NUMBER, generateEmvcoRaastQrString } from "@/lib/emvco-qr";
import { useKitchenAvailability } from "@/hooks/use-kitchen-availability";
import type { StoreSettings } from "@/lib/store-db";
import { REALTIME_SYNC_EVENT } from "@/lib/realtime-client";
import type { LiveOrderStatus } from "@/lib/order-api";
import { buildOrderWhatsAppMessage, getOrderWhatsAppNumber } from "@/lib/order-whatsapp";
import { CartUpsells } from "@/components/cart-upsells";
import { SchedulePicker } from "@/components/schedule-picker";
import { BAHAWALPUR_ZONES, calculateDeliveryFee } from "@/lib/delivery-zones";
import { trackFunnelEvent } from "@/lib/funnel";

const paymentSessionDuration = 5 * 60 * 1000;
const paymentMethod = "Digital Payment";
const money = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 });

export function CheckoutForm() {
  const router = useRouter();
  const { t } = useSiteSettings();
  const { items, removeItem, updateQuantity, clearCart } = useCart();
  const kitchen = useKitchenAvailability();
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<string[]>([]);
  const [selectedSavedAddress, setSelectedSavedAddress] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [deliveryZones, setDeliveryZones] = useState<Array<{ id: string; zone_name: string; delivery_fee: number; min_order_amount: number; estimated_minutes: number }>>([]);
  const [zoneError, setZoneError] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryArea, setDeliveryArea] = useState("");
  const [scheduleSlot, setScheduleSlot] = useState("");
  const [schedulePlanId, setSchedulePlanId] = useState("");
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const raastStore = useRaastSessionStore();
  const raastSession = useSyncExternalStore(raastStore.subscribe, raastStore.getClientSnapshot, raastStore.getServerSnapshot);
  const [paymentStatus, setPaymentStatus] = useState<"pending" | "verification_pending" | "paid" | "rejected">("pending");
  const [slipUploadMessage, setSlipUploadMessage] = useState("");
  const [slipUploadStatus, setSlipUploadStatus] = useState<"idle" | "uploading" | "uploaded" | "error">("idle");
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [uploadedSlipPath, setUploadedSlipPath] = useState("");
  const [uploadedSlipName, setUploadedSlipName] = useState("");
  const [isRemovingSlip, setIsRemovingSlip] = useState(false);
  const [orderConfirmation, setOrderConfirmation] = useState<LiveOrderStatus | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const paymentQrRef = useRef<SVGSVGElement>(null);
  const slipPreviewUrl = useMemo(() => slipFile ? URL.createObjectURL(slipFile) : "", [slipFile]);
  const selectedZone = deliveryZones.find((zone) => zone.zone_name === deliveryArea);
  const subtotal = items.reduce((total, item) => total + item.price * item.quantity, 0);
  const freeDeliveryThreshold = storeSettings?.delivery.freeDeliveryThreshold || 0;
  const deliveryFee = calculateDeliveryFee(selectedZone, subtotal, freeDeliveryThreshold);
  const total = subtotal + deliveryFee;
  useEffect(() => {
    if (slipPreviewUrl) return () => URL.revokeObjectURL(slipPreviewUrl);
  }, [slipPreviewUrl]);
  useEffect(() => {
    if (items.length) trackFunnelEvent("checkout_started", { item_count: items.length });
  }, [items.length]);
  useEffect(() => {
    if (!raastSession) return;
    const openPaymentFrame = window.requestAnimationFrame(() => setPaymentModalOpen(true));
    return () => window.cancelAnimationFrame(openPaymentFrame);
  }, [raastSession]);

  useEffect(() => {
    if (!raastSession) return;
    let active = true;
    const refreshPaymentStatus = async () => {
      try {
        const params = new URLSearchParams({ number: raastSession.orderNumber, phone: customerPhone });
        const response = await fetch(`/api/orders?${params}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Order status lookup failed (${response.status}).`);
        const data = await response.json() as { order?: { paymentStatus?: string; paymentSlipUrl?: string; paymentSlipName?: string } };
        const value = data.order?.paymentStatus;
        if (active && (value === "pending" || value === "verification_pending" || value === "paid" || value === "rejected")) {
          setPaymentStatus(value);
          setUploadedSlipPath(data.order?.paymentSlipUrl || "");
          setUploadedSlipName(data.order?.paymentSlipName || "");
          if (data.order?.paymentSlipUrl) setSlipUploadStatus("uploaded");
        }
      } catch (error) {
        console.error("Could not refresh payment status from Supabase.", error);
      }
    };
    void refreshPaymentStatus();
    const interval = window.setInterval(() => void refreshPaymentStatus(), 3_500);
    window.addEventListener(REALTIME_SYNC_EVENT, refreshPaymentStatus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener(REALTIME_SYNC_EVENT, refreshPaymentStatus);
    };
  }, [raastSession, customerPhone]);

  async function uploadPaymentSlip(file: File) {
    if (!raastSession) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setSlipUploadMessage("Choose a JPG, PNG, or WebP receipt under 5 MB.");
      setSlipUploadStatus("error");
      return;
    }
    setSlipFile(file);
    setSlipUploadStatus("uploading");
    setSlipUploadMessage("Uploading receipt…");
    const form = new FormData();
    form.set("number", raastSession.orderNumber);
    form.set("phone", customerPhone);
    form.set("file", file);
    try {
      const response = await fetch("/api/upload-slip", { method: "POST", body: form });
      const data = await response.json().catch(() => null) as { error?: string; order?: { paymentStatus?: string; paymentSlipUrl?: string; paymentSlipName?: string } } | null;
      if (!response.ok) throw new Error(data?.error || "Payment receipt upload failed.");
      setPaymentStatus(data?.order?.paymentStatus === "verification_pending" ? "verification_pending" : "pending");
      setUploadedSlipPath(data?.order?.paymentSlipUrl || "");
      setUploadedSlipName(data?.order?.paymentSlipName || file.name);
      setSlipUploadStatus("uploaded");
      setSlipUploadMessage("Uploaded ✓ · Payment is awaiting merchant verification.");
      trackFunnelEvent("receipt_uploaded", { order_number: raastSession.orderNumber });
    } catch (error) {
      setSlipUploadStatus("error");
      setSlipUploadMessage(error instanceof Error ? error.message : "Payment receipt upload failed.");
      throw error;
    }
  }

  async function removePaymentSlip() {
    if (!raastSession || isRemovingSlip) return;
    setIsRemovingSlip(true);
    try {
      const query = new URLSearchParams({ number: raastSession.orderNumber, phone: customerPhone });
      const response = await fetch(`/api/upload-slip?${query}`, { method: "DELETE" });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "Payment receipt could not be removed.");
      setSlipFile(null);
      setUploadedSlipPath("");
      setUploadedSlipName("");
      setPaymentStatus("pending");
      setSlipUploadStatus("idle");
      setSlipUploadMessage("Receipt removed. You can upload a replacement.");
    } catch (error) {
      setSlipUploadStatus("error");
      setSlipUploadMessage(error instanceof Error ? error.message : "Payment receipt could not be removed.");
    } finally {
      setIsRemovingSlip(false);
    }
  }

  async function copyWhatsAppMessage(message: string) {
    try {
      await navigator.clipboard.writeText(message);
      setCopyMessage("Order message copied.");
    } catch (error) {
      console.error("Could not copy the WhatsApp order message.", error);
      setCopyMessage("Copy was blocked. Select and copy the order details manually.");
    }
  }

  function downloadPaymentQr() {
    const qr = paymentQrRef.current;
    if (!qr || !raastSession) return;
    const svg = qr.cloneNode(true) as SVGSVGElement;
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${raastSession.orderNumber.replace(/[^a-z0-9-]/gi, "-")}-raast-qr.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const profile = readCustomerProfile();
      if (profile) {
        setCustomerName(profile.name);
        setCustomerPhone(profile.phone);
        setCustomerEmail(profile.email || "");
        setSavedAddresses(profile.addresses);
        setDeliveryAddress(profile.addresses[0] || "");
        if (profile.emailVerified || profile.phoneVerified) {
          void fetch("/api/addresses", { cache: "no-store" }).then(async (response) => {
            if (response.status === 401) return;
            const data = await response.json() as { addresses?: Array<{ line1: string; zone: string }>; error?: string };
            if (!response.ok) throw new Error(data.error || `Saved addresses request failed (${response.status}).`);
            if (Array.isArray(data.addresses)) {
              const addresses = data.addresses.map((address) => `${address.line1}, ${address.zone}`);
              setSavedAddresses((current) => [...new Set([...addresses, ...current])].slice(0, 10));
            }
          }).catch((error: unknown) => console.error("Could not load saved database addresses.", error));
        }
      }
    });
    const onCustomerAuth = (event: Event) => {
      const profile = (event as CustomEvent<CustomerProfile | null>).detail;
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
    const loadZones = async () => {
      try {
        const response = await fetch("/api/delivery-zones", { cache: "no-store" });
        const data = await response.json() as { zones?: Array<{ id: string; zone_name: string; delivery_fee: number; min_order_amount: number; estimated_minutes: number }> };
        if (!response.ok || !Array.isArray(data.zones)) throw new Error(`Delivery zones request failed (${response.status}).`);
        if (active) {
          setDeliveryZones(data.zones);
          setZoneError("");
        }
      } catch (error) {
        console.error("Could not load delivery zones.", error);
        if (active) {
          setDeliveryZones(BAHAWALPUR_ZONES);
          setZoneError("Live delivery pricing is unavailable; estimated Bahawalpur rates are shown.");
        }
      }
    };
    void loadZones();
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
    if (selectedZone && subtotal < selectedZone.min_order_amount) {
      setSubmitError(`This delivery area requires a minimum order of Rs. ${selectedZone.min_order_amount.toLocaleString()}.`);
      setIsSubmitting(false);
      return;
    }
    if (scheduleSlot) {
      const slotTime = new Date(scheduleSlot).getTime();
      if (!Number.isFinite(slotTime) || slotTime < Date.now() + 15 * 60_000 || slotTime > Date.now() + 30 * 24 * 60 * 60_000) {
        setSubmitError("Choose a delivery slot at least 15 minutes from now and within 30 days.");
        setIsSubmitting(false);
        return;
      }
    }
    if (zoneError && !deliveryZones.length) {
      setSubmitError("Delivery areas could not be loaded. Please try again before placing your order.");
      setIsSubmitting(false);
      return;
    }
    const notes = [
      `Requested delivery: ${scheduleSlot ? new Date(scheduleSlot).toLocaleString("en-PK") : deliveryTime}`,
      "Payment method: Dynamic MCB Raast QR. Payment remains pending merchant verification until approved.",
    ].join("\n");
    let order: LiveOrderStatus;
    try {
      order = await createLiveOrder({
        name,
        phone,
        email: email || undefined,
        area,
        address,
        notes: notes.slice(0, 500),
        payment: paymentMethod,
        subtotal,
        discount: 0,
        deliveryFee,
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
    } catch (error) {
      console.error("Could not create the order in Supabase.", error);
      setSubmitError(error instanceof Error ? error.message : "The online order service could not confirm your request.");
      setIsSubmitting(false);
      return;
    }

    const orderNumber = order.number;
    const orderTotal = order.total;
    const currentProfile = readCustomerProfile();
    const persistenceWarnings = [...(order.persistenceWarnings || [])];
    trackFunnelEvent("order_placed", { order_number: orderNumber, total: orderTotal });
    if (currentProfile?.emailVerified || currentProfile?.phoneVerified) {
      try {
        const addressResponse = await fetch("/api/addresses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: "Home", line1: address, city: "Bahawalpur", zone: area, isDefault: true }),
        });
        if (!addressResponse.ok) {
          const addressData = await addressResponse.json() as { error?: string };
          throw new Error(addressData.error || "Address could not be saved.");
        }
      } catch (error) {
        console.error("Order was placed, but the saved address could not be synchronized.", error);
        persistenceWarnings.push("Your order was saved, but this address could not be added to your saved addresses.");
      }
    }
    if (scheduleSlot) {
      try {
        const scheduleResponse = await fetch("/api/schedule/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slotTime: new Date(scheduleSlot).toISOString(),
            planId: schedulePlanId || undefined,
            orderNumber,
          }),
        });
        if (!scheduleResponse.ok) {
          const scheduleData = await scheduleResponse.json() as { error?: string };
          throw new Error(scheduleData.error || "Scheduled delivery could not be saved.");
        }
      } catch (error) {
        console.error("Order was placed, but the scheduled delivery could not be saved.", error);
        persistenceWarnings.push(error instanceof Error ? error.message : "Your order was saved, but scheduling did not finish.");
      }
    }
    order.persistenceWarnings = persistenceWarnings;
    const message = buildOrderWhatsAppMessage(order, storeSettings || undefined);
    setOrderConfirmation(order);
    try {
      window.localStorage.setItem("hmf_recent_order", JSON.stringify({ number: orderNumber, phone }));
    } catch (error) {
      console.warn("The order was saved, but could not be remembered on this device.", error);
    }
    {
      const previousAddresses = currentProfile?.addresses ?? [];
      const fullAddress = `${address}, ${area}`;
      saveOrderRequest({
        number: orderNumber,
        placedAt: new Date().toISOString(),
        total: orderTotal,
        payment: paymentMethod,
        items: items.map((item) => `${item.name} (${item.portion}) × ${item.quantity}`).join(", "),
        status: "Awaiting Raast payment verification",
      });
      saveCustomerProfile({
        ...(currentProfile || {}),
        name,
        phone,
        ...(email ? { email } : {}),
        addresses: [fullAddress, ...previousAddresses.filter((saved) => saved !== fullAddress)].slice(0, 5),
        preferredPayment: paymentMethod,
      });
    }
    const expiresAt = Date.now() + paymentSessionDuration;
    saveRaastSession({
      orderNumber,
      amount: orderTotal,
      expiresAt,
      whatsappMessage: message,
    });
    clearCart();
    setIsSubmitting(false);
    router.push(`/order-confirmation?order=${encodeURIComponent(orderNumber)}&phone=${encodeURIComponent(phone)}`);
  }

  if (!items.length && !raastSession) return <div className="notice">{t("emptyCart")} <Link href="/menu" style={{ textDecoration: "underline" }}>{t("browseMenu")}</Link></div>;

  return (
    <MotionConfig reducedMotion="user">
    <div className="checkout-grid">
      {kitchen && !kitchen.available && <div id="checkout-kitchen-status" className="checkout-closed-notice" role="alert"><strong>Online orders are paused</strong><p>{kitchen.reason}</p><small>{kitchen.schedule}</small></div>}
      <AnimatePresence mode="wait" initial={false}>
      {raastSession ? (
        paymentModalOpen ? <motion.div key="raast-payment-backdrop" className="raast-payment-backdrop" role="presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.section className="form-card raast-payment-card" role="dialog" aria-modal="true" aria-label="Raast payment QR" initial={{ opacity: 0, y: 18, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 14, scale: 0.94 }} transition={{ duration: 0.24, ease: "easeOut" }}>
          <button type="button" className="raast-modal-close" aria-label="Close payment details" onClick={() => setPaymentModalOpen(false)}>×</button>
          <p className="raast-kicker">MCB · RAAST P2M</p>
          <h2>Pay for order {raastSession.orderNumber}</h2>
          <p className="raast-order-reference">Exact amount: <strong>PKR {money.format(raastSession.amount)}</strong></p>
          <div className="voucher-minimal-qr-card"><QRCodeSVG ref={paymentQrRef} value={generateEmvcoRaastQrString({ merchantName: storeSettings?.payments.raastMerchantName || RAAST_MERCHANT_NAME, ref: storeSettings?.payments.raastRef || RAAST_REF_NUMBER, iban: storeSettings?.payments.bankIban || RAAST_MERCHANT_IBAN, amount: raastSession.amount, city: "Bahawalpur", purpose: `Order ${raastSession.orderNumber}` })} size={260} level="M" includeMargin style={{ display: "block", maxWidth: "100%", height: "auto" }} /></div>
          <button type="button" className="checkout-raast-select" onClick={downloadPaymentQr}>Download order QR / challan</button>
          <p className="raast-order-reference"><strong>{storeSettings?.payments.raastMerchantName || RAAST_MERCHANT_NAME}</strong> · Ref {storeSettings?.payments.raastRef || RAAST_REF_NUMBER}</p>
          <p className="raast-order-reference">{storeSettings?.payments.bankName || "Raast"} · IBAN {storeSettings?.payments.bankIban || RAAST_MERCHANT_IBAN}</p>
          {storeSettings?.payments.paymentInstructions && <p>{storeSettings.payments.paymentInstructions}</p>}
          <label className={`checkout-raast-select checkout-upload-button ${slipUploadStatus === "uploading" ? "is-disabled" : ""}`}>
            {slipUploadStatus === "uploading" ? "Uploading receipt…" : uploadedSlipPath ? "Replace payment proof" : "Upload payment proof"}
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={slipUploadStatus === "uploading"} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadPaymentSlip(file).catch(() => undefined); event.currentTarget.value = ""; }} />
          </label>
          {slipUploadMessage && <p className={`checkout-slip-state ${slipUploadStatus}`} role="status">{slipUploadMessage}</p>}
          {(slipFile || uploadedSlipPath) && <motion.div className="checkout-slip-preview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            {(slipPreviewUrl || uploadedSlipPath) && <Image src={slipPreviewUrl || `/api/orders/slip?${new URLSearchParams({ number: raastSession.orderNumber, phone: customerPhone })}`} alt="Payment receipt preview" width={64} height={64} unoptimized />}
            <div><strong>{slipFile?.name || uploadedSlipName || "Transaction receipt"}</strong>{slipFile && <small>{(slipFile.size / 1024 / 1024).toFixed(2)} MB</small>}</div>
            <button type="button" className="checkout-raast-select checkout-remove-slip" disabled={isRemovingSlip} onClick={() => void removePaymentSlip()}>{isRemovingSlip ? "Removing…" : "Remove proof"}</button>
          </motion.div>}
          <p className="raast-order-reference" role="status">Payment status: {paymentStatus.replace("_", " ")}</p>
          <Link className="checkout-raast-select" href={`/track-order?order=${encodeURIComponent(raastSession.orderNumber)}&phone=${encodeURIComponent(customerPhone)}`}>Continue to live order tracking</Link>
        </motion.section>
        </motion.div> : <motion.section key="raast-payment-resume" className="form-card raast-payment-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <p className="raast-kicker">MCB · RAAST P2M</p><h2>{t("raastPending")}</h2>
          <p className="raast-order-reference">{t("raastOrder")}: <strong>{raastSession.orderNumber}</strong></p>
          <p className="raast-order-reference">Exact payable total: <strong>PKR {money.format(raastSession.amount)}</strong></p>
          <p className="raast-order-reference" role="status">Payment status: {paymentStatus.replace("_", " ")}</p>
          <button type="button" className="add-button" onClick={() => setPaymentModalOpen(true)}>Resume payment</button>
          <Link className="checkout-raast-select" href={`/track-order?order=${encodeURIComponent(raastSession.orderNumber)}&phone=${encodeURIComponent(customerPhone)}`}>Continue to live order tracking</Link>
        </motion.section>
      ) : (
      <motion.form key="checkout-form" className="form-card checkout-form-card" onSubmit={placeOrder} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.24 }}>
        <div className="checkout-section-heading"><span>01</span><div><p>DELIVERY DETAILS</p><h2>{t("customerInfo")}</h2></div></div>
        <div className="form-grid">
          <label className="field">{t("fullName")}<input name="name" required autoComplete="name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder={t("fullName")} /></label>
          <label className="field">{t("phoneNumber")}<input name="phone" required autoComplete="tel" type="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="03xx xxxxxxx" /></label>
          <label className="field full">Email (optional)<input name="email" type="email" autoComplete="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="name@example.com" /></label>
          {savedAddresses.length > 0 && <label className="field full">Use a saved address<select value={selectedSavedAddress} onChange={(event) => selectSavedAddress(event.target.value)}><option value="">Enter a new address</option>{savedAddresses.map((saved) => <option key={saved} value={saved}>{saved}</option>)}</select></label>}
          <label className="field full">{t("deliveryArea")}<select name="area" required value={deliveryArea} onChange={(event) => setDeliveryArea(event.target.value)}><option value="" disabled>{t("chooseArea")}</option>{deliveryZones.length ? deliveryZones.map((zone) => <option key={zone.id} value={zone.zone_name}>{zone.zone_name} · Rs. {zone.delivery_fee}</option>) : (storeSettings?.delivery.deliveryAreas || ["Bahawalpur city", "Model Town", "University Chowk", "Other Bahawalpur area"]).map((area) => <option key={area}>{area}</option>)}</select>{selectedZone && <small>Estimated delivery: {selectedZone.estimated_minutes} min{selectedZone.min_order_amount ? ` · Minimum Rs. ${selectedZone.min_order_amount}` : ""}</small>}{zoneError && <small role="alert">Live zone pricing is unavailable. Please retry shortly.</small>}</label>
          <label className="field full">{t("fullAddress")}<textarea name="address" required autoComplete="street-address" value={deliveryAddress} onChange={(event) => { setDeliveryAddress(event.target.value); setSelectedSavedAddress(""); }} placeholder={t("fullAddress")} /></label>
          <label className="field full">Delivery timing<select name="deliveryTime" defaultValue="As soon as possible"><option>As soon as possible</option><option>Today · 12:00–2:00 PM</option><option>Today · 2:00–5:00 PM</option><option>Today · 6:00–9:00 PM</option></select></label>
          <div className="field full"><SchedulePicker value={scheduleSlot} onChange={setScheduleSlot} planId={schedulePlanId} onPlanChange={setSchedulePlanId} /></div>
        </div>
        {!raastSession && <CartUpsells />}
        {submitError && <p className="form-error" role="alert">{submitError}</p>}
        <button className="add-button checkout-submit-button" type="submit" disabled={isSubmitting || kitchen?.available === false} aria-describedby={kitchen?.available === false ? "checkout-kitchen-status" : undefined}>{isSubmitting ? "Placing order…" : kitchen?.available === false ? "Ordering paused" : "Confirm & Place Order"} <span aria-hidden="true">→</span></button>
        {kitchen === null && <small className="checkout-kitchen-checking" role="status">Kitchen hours could not be refreshed. The order service will validate availability when you submit.</small>}
        <p style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.6 }}>After your order is saved, a dynamic Raast QR will be shown. Payment is confirmed by the merchant after you upload your receipt.</p>
      </motion.form>
      )}
      </AnimatePresence>
      <motion.aside className="summary-card checkout-summary-card" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.28 }}>
        <div className="checkout-section-heading"><span>02</span><div><p>YOUR ORDER</p><h2>{t("orderSummary")}</h2></div></div>
        <div className="checkout-table-scroll">
          <table className="checkout-order-table">
            <thead><tr><th scope="col">Item</th><th scope="col">Qty</th><th scope="col">Amount</th></tr></thead>
            <tbody>{items.map((item) => <motion.tr layout key={`${item.id}-${item.portion}-${item.specialInstructions ?? ""}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <td><strong>{item.name}</strong><small>{item.portion}{item.specialInstructions ? ` · ${item.specialInstructions}` : ""}</small>{!raastSession && <button type="button" onClick={() => removeItem(item.id, item.portion, item.specialInstructions)} className="remove-cart-item">Remove</button>}</td>
              <td><span className="quantity-control checkout-quantity"><button type="button" aria-label={`Decrease ${item.name} quantity`} disabled={Boolean(raastSession)} onClick={() => updateQuantity(item.id, item.portion, item.quantity - 1, item.specialInstructions)}>−</button><span>{item.quantity}</span><button type="button" aria-label={`Increase ${item.name} quantity`} disabled={Boolean(raastSession)} onClick={() => updateQuantity(item.id, item.portion, item.quantity + 1, item.specialInstructions)}>＋</button></span></td>
              <td className="checkout-table-amount">Rs. {money.format(item.price * item.quantity)}</td>
            </motion.tr>)}
            </tbody>
          </table>
        </div>
        {orderConfirmation && <motion.section className="checkout-order-confirmation" layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} role="status">
          <strong>Order {orderConfirmation.number} placed</strong><span>Keep this number to follow live kitchen updates.</span>
          {orderConfirmation.persistenceWarnings?.map((warning) => <small key={warning} role="alert">{warning}</small>)}
          <div className="checkout-challan-actions"><a className="checkout-raast-select" href={whatsappUrl(buildOrderWhatsAppMessage(orderConfirmation, storeSettings || undefined), getOrderWhatsAppNumber(storeSettings || undefined))} target="_blank" rel="noreferrer">Confirm Order on WhatsApp</a><button type="button" className="checkout-raast-select" onClick={() => void copyWhatsAppMessage(buildOrderWhatsAppMessage(orderConfirmation, storeSettings || undefined))}>Copy order message</button><Link href={`/track-order?order=${encodeURIComponent(orderConfirmation.number)}&phone=${encodeURIComponent(customerPhone)}`}>Track order</Link></div>
          {copyMessage && <small role="status">{copyMessage}</small>}
        </motion.section>}
        <div className="summary-line"><span>{t("subtotal")}</span><strong>Rs. {subtotal}</strong></div>
        <div className="summary-line"><span>Delivery</span><strong>{deliveryFee ? `Rs. ${money.format(deliveryFee)}` : "FREE"}</strong></div>
        <div className="summary-line summary-total"><span>Total</span><strong>{raastSession ? `PKR ${money.format(raastSession.amount)}` : `Rs. ${total}`}</strong></div>
      </motion.aside>
    </div>
    </MotionConfig>
  );
}

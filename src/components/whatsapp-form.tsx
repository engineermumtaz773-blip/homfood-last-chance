"use client";

import { useRef, useState, type FormEvent } from "react";
import { whatsappUrl } from "@/lib/data";

type ContactValues = { name: string; phone: string; message: string; website: string };
type ContactAction = "message" | "notification";

const supportEmail = "ch.arslan4367@gmail.com";

export function WhatsAppForm({ trackOrder = false }: { trackOrder?: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState<ContactAction | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  function readValues() {
    if (!formRef.current?.reportValidity()) return null;
    const data = new FormData(formRef.current);
    return {
      name: String(data.get("name") ?? "").trim(),
      phone: String(data.get("phone") ?? "").trim(),
      message: String(data.get(trackOrder ? "order" : "message") ?? "").trim(),
      website: String(data.get("website") ?? "").trim(),
    } satisfies ContactValues;
  }

  function openWhatsApp(values: ContactValues) {
    const message = trackOrder
      ? `Hi Home Made Food, I would like an update on order ${values.message}. The phone number used was ${values.phone}.`
      : `Hi Home Made Food, my name is ${values.name}. ${values.message} Please contact me at ${values.phone}.`;
    window.location.assign(whatsappUrl(message));
  }

  function openEmail(values: ContactValues) {
    const subject = trackOrder ? `Order update: ${values.message}` : `Home Made Food message from ${values.name}`;
    const body = trackOrder
      ? `Please update me about order ${values.message}.\nPhone: ${values.phone}`
      : `Name: ${values.name}\nPhone: ${values.phone}\n\nMessage:\n${values.message}`;
    window.location.assign(`mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  }

  async function sendViaApi(action: ContactAction) {
    const values = readValues();
    if (!values) return;
    setBusy(action);
    setFeedback(null);
    try {
      const endpoint = action === "message" ? "/api/contact" : "/api/notifications";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(values),
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error || "Your request could not be sent.");
      setFeedback({ kind: "success", text: result.message || "Your request was sent." });
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Your request could not be sent. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = readValues();
    if (values) openWhatsApp(values);
  }

  return (
    <form className="form-card" ref={formRef} onSubmit={submit}>
      <h2>{trackOrder ? "Ask us about your order" : "Send us a message"}</h2>
      {trackOrder && <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>Online order-status lookup is not available on the connected WordPress API yet. Send your order number and phone number through WhatsApp and our team can check it for you.</p>}
      <div className="form-grid">
        {!trackOrder && <label className="field">Your name<input name="name" required autoComplete="name" minLength={2} maxLength={80} placeholder="Full name" /></label>}
        {trackOrder && <label className="field full">Order number<input name="order" required placeholder="e.g. HMF-1048" /></label>}
        <label className={`field ${trackOrder ? "full" : ""}`}>Phone number<input name="phone" required autoComplete="tel" type="tel" minLength={7} maxLength={24} placeholder="03xx xxxxxxx" /></label>
        {!trackOrder && <label className="field full">How can we help?<textarea required name="message" minLength={2} maxLength={2000} placeholder="Write your message or request..."></textarea></label>}
        {!trackOrder && <label className="contact-honeypot" aria-hidden="true">Leave this field empty<input name="website" tabIndex={-1} autoComplete="off" /></label>}
      </div>
      {trackOrder ? (
        <button className="whatsapp-button" style={{ margin: "24px 0 0", width: "fit-content" }} type="submit">Request an update on WhatsApp</button>
      ) : (
        <>
          <div className="contact-action-grid">
            <button className="whatsapp-button" type="button" onClick={() => { const values = readValues(); if (values) openWhatsApp(values); }}>WhatsApp</button>
            <button className="contact-action-button" type="button" disabled={busy !== null} onClick={() => void sendViaApi("message")}>{busy === "message" ? "Sending…" : "Simple Message"}</button>
            <button className="contact-action-button" type="button" onClick={() => { const values = readValues(); if (values) openEmail(values); }}>Email</button>
            <button className="contact-action-button" type="button" disabled={busy !== null} onClick={() => void sendViaApi("notification")}>{busy === "notification" ? "Sending…" : "Admin Panel Notification"}</button>
          </div>
          {feedback && <p className={`contact-action-feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"} aria-live="polite">{feedback.text}</p>}
        </>
      )}
    </form>
  );
}

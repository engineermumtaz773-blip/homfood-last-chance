"use client";

import type { FormEvent } from "react";
import { whatsappUrl } from "@/lib/data";

export function WhatsAppForm({ trackOrder = false }: { trackOrder?: boolean }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const detail = String(formData.get(trackOrder ? "order" : "message") ?? "").trim();
    const message = trackOrder
      ? `Hi Home Made Food, I would like an update on order ${detail}. The phone number used was ${phone}.`
      : `Hi Home Made Food, my name is ${name}. ${detail} Please contact me at ${phone}.`;
    window.location.assign(whatsappUrl(message));
  }

  return (
    <form className="form-card" onSubmit={submit}>
      <h2>{trackOrder ? "Ask us about your order" : "Send us a message"}</h2>
      {trackOrder && <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>Online order-status lookup is not available on the connected WordPress API yet. Send your order number and phone number through WhatsApp and our team can check it for you.</p>}
      <div className="form-grid">
        {!trackOrder && <label className="field">Your name<input name="name" required autoComplete="name" placeholder="Full name" /></label>}
        {trackOrder && <label className="field full">Order number<input name="order" required placeholder="e.g. HMF-1048" /></label>}
        <label className={`field ${trackOrder ? "full" : ""}`}>Phone number<input name="phone" required autoComplete="tel" type="tel" placeholder="03xx xxxxxxx" /></label>
        {!trackOrder && <label className="field full">How can we help?<textarea required name="message" placeholder="Write your message..." /></label>}
      </div>
      <button className="whatsapp-button" style={{ margin: "24px 0 0", width: "fit-content" }} type="submit">{trackOrder ? "Request an update on WhatsApp" : "Message us on WhatsApp"}</button>
    </form>
  );
}

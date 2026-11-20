"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSiteSettings } from "@/components/site-settings";

export function ReservationForm() {
  const { t } = useSiteSettings();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const slotTimeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (slotTimeRef.current) {
      const minimum = new Date(Date.now() + 60_000);
      minimum.setMinutes(minimum.getMinutes() - minimum.getTimezoneOffset());
      slotTimeRef.current.min = minimum.toISOString().slice(0, 16);
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          phone: form.get("phone"),
          partySize: Number(form.get("partySize")),
          slotTime: new Date(String(form.get("slotTime"))).toISOString(),
          notes: form.get("notes"),
        }),
      });
      const data = await response.json() as { error?: string; reservation?: { id?: string; slot_time?: string } };
      if (!response.ok) throw new Error(data.error || "Could not submit the reservation.");
      formElement.reset();
      setMessage(`${t("reservationSuccess")}${data.reservation?.id ? ` Reference: ${data.reservation.id}.` : ""}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not submit the reservation.");
    } finally {
      setSaving(false);
    }
  }

  return <form className="feature-form" onSubmit={(event) => void submit(event)}>
    <h2>{t("reservationTitle")}</h2>
    <div className="feature-form-grid">
      <label>{t("reservationName")}<input name="name" required minLength={2} maxLength={120} autoComplete="name" /></label>
      <label>{t("reservationPhone")}<input name="phone" required type="tel" minLength={10} maxLength={20} autoComplete="tel" /></label>
      <label>{t("reservationGuests")}<select name="partySize" defaultValue="2">{Array.from({ length: 30 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label>
      <label>{t("reservationDateTime")}<input ref={slotTimeRef} name="slotTime" required type="datetime-local" /></label>
    </div>
    <label className="feature-form-full">{t("reservationNotes")}<textarea name="notes" maxLength={500} placeholder={t("reservationNotesPlaceholder")} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="feature-success" role="status">{message}</p>}
    <button className="add-button" type="submit" disabled={saving}>{saving ? t("reservationSaving") : t("reservationSubmit")}</button>
  </form>;
}

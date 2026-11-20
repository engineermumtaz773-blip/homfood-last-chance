"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSiteSettings } from "@/components/site-settings";

const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export function SubscriptionForm() {
  const { t } = useSiteSettings();
  const [planType, setPlanType] = useState<"weekly" | "monthly">("weekly");
  const [days, setDays] = useState<string[]>(["monday", "wednesday", "friday"]);
  const [mealSlot, setMealSlot] = useState<"lunch" | "dinner">("lunch");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const now = new Date();
    const minimumDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (startDateRef.current) startDateRef.current.min = minimumDate;
    if (endDateRef.current) endDateRef.current.min = startDate || minimumDate;
  }, [startDate]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planType, daysOfWeek: days, mealSlot, startDate, ...(endDate ? { endDate } : {}) }),
      });
      const data = await response.json() as { error?: string; subscription?: { id?: string; status?: string } };
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent("hmf_open_auth_modal", { detail: { mode: "login", reason: t("subscriptionSignInReason") } }));
        throw new Error(data.error || t("subscriptionSignInRequired"));
      }
      if (!response.ok) throw new Error(data.error || "Could not save your meal plan.");
      setMessage(`${t("subscriptionSuccess")}${data.subscription?.id ? ` Request ${data.subscription.id} · ${data.subscription.status || "pending"}.` : ""}`);
      setError("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save your meal plan.");
    } finally {
      setSaving(false);
    }
  }

  return <form className="feature-form" onSubmit={(event) => void submit(event)}>
    <h2>{t("subscriptionTitle")}</h2>
    <div className="feature-form-grid">
      <label>{t("subscriptionBillingCycle")}<select value={planType} onChange={(event) => setPlanType(event.target.value as "weekly" | "monthly")}><option value="weekly">{t("weekly")}</option><option value="monthly">{t("monthly")}</option></select></label>
      <label>{t("subscriptionMeal")}<select value={mealSlot} onChange={(event) => setMealSlot(event.target.value as "lunch" | "dinner")}><option value="lunch">{t("lunch")}</option><option value="dinner">{t("dinner")}</option></select></label>
      <label>{t("subscriptionStartDate")}<input ref={startDateRef} type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
      <label>{t("subscriptionEndDate")}<input ref={endDateRef} type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
    </div>
    <fieldset><legend>{t("subscriptionDays")}</legend><div className="feature-days">{weekdays.map((day) => <label key={day}><input type="checkbox" checked={days.includes(day)} onChange={(event) => setDays((current) => event.target.checked ? [...current, day] : current.filter((value) => value !== day))} />{t(day)}</label>)}</div></fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="feature-success" role="status">{message}</p>}
    <button className="add-button" type="submit" disabled={saving || !days.length}>{saving ? t("subscriptionSaving") : t("subscriptionSubmit")}</button>
  </form>;
}

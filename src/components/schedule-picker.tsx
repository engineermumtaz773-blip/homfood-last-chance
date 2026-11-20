"use client";

import { useEffect, useState } from "react";

type Plan = { id: string; plan_type: string; status: string };

export function SchedulePicker({
  value,
  onChange,
  planId,
  onPlanChange,
}: {
  value: string;
  onChange: (value: string) => void;
  planId: string;
  onPlanChange: (value: string) => void;
}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [message, setMessage] = useState("");
  const [timeBounds, setTimeBounds] = useState({ min: "", max: "" });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const now = new Date();
      const minDate = new Date(now.getTime() + 15 * 60_000);
      minDate.setSeconds(0, 0);
      minDate.setMinutes(minDate.getMinutes() - (minDate.getMinutes() % 15));
      const maxDate = new Date(now.getTime() + 30 * 24 * 60 * 60_000);
      const toLocalInputValue = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
      setTimeBounds({ min: toLocalInputValue(minDate), max: toLocalInputValue(maxDate) });
    });
    let active = true;
    void fetch("/api/subscriptions", { cache: "no-store" }).then(async (response) => {
      if (response.status === 401) return null;
      const data = await response.json() as { subscriptions?: Plan[]; error?: string };
      if (!response.ok) throw new Error(data.error || `Meal plans failed (${response.status}).`);
      return data;
    }).then((data) => {
      if (active && Array.isArray(data?.subscriptions)) setPlans(data.subscriptions.filter((plan) => plan.status === "active"));
    }).catch((error: unknown) => {
      console.error("Could not load meal plans for scheduled ordering.", error);
      if (active) setMessage("Meal plans are temporarily unavailable.");
    });
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <fieldset className="schedule-picker">
      <legend>Schedule your delivery (optional)</legend>
      <label className="field">Preferred delivery slot
        <input type="datetime-local" value={value} min={timeBounds.min} max={timeBounds.max} onChange={(event) => onChange(event.target.value)} />
      </label>
      {plans.length > 0 && <label className="field">Link an active meal plan
        <select value={planId} onChange={(event) => onPlanChange(event.target.value)}>
          <option value="">One-time order</option>
          {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.plan_type} meal plan</option>)}
        </select>
      </label>}
      {message && <small role="status">{message}</small>}
      <small>Scheduling requires a verified customer account. Slots must be at least 15 minutes ahead and within 30 days.</small>
    </fieldset>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { REALTIME_SYNC_EVENT } from "@/lib/realtime-client";

type Reservation = {
  id: string;
  guest_name: string;
  phone: string;
  party_size: number;
  slot_time: string;
  notes: string;
  status: string;
};

type MealPlan = {
  id: string;
  plan_type: string;
  days_of_week: string[];
  meal_slot: string;
  start_date: string;
  end_date?: string | null;
  status: string;
};

async function responseError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null) as { error?: string; message?: string } | null;
  return data?.error || data?.message || `${fallback} (HTTP ${response.status}).`;
}

export function AdminRequestsManager() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [reservationResponse, planResponse] = await Promise.all([
        fetch("/api/reservations", { cache: "no-store" }),
        fetch("/api/subscriptions", { cache: "no-store" }),
      ]);
      if (!reservationResponse.ok) throw new Error(await responseError(reservationResponse, "Reservations could not be loaded"));
      if (!planResponse.ok) throw new Error(await responseError(planResponse, "Meal plans could not be loaded"));
      const [reservationData, planData] = await Promise.all([
        reservationResponse.json() as Promise<{ reservations?: Reservation[] }>,
        planResponse.json() as Promise<{ subscriptions?: MealPlan[] }>,
      ]);
      setReservations(Array.isArray(reservationData.reservations) ? reservationData.reservations : []);
      setMealPlans(Array.isArray(planData.subscriptions) ? planData.subscriptions : []);
      setError("");
    } catch (loadError) {
      console.error("Could not load customer requests.", loadError);
      setError(loadError instanceof Error ? loadError.message : "Customer requests could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void refresh(); });
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    const onRealtime = (event: Event) => {
      const table = (event as CustomEvent<{ table?: string }>).detail?.table;
      if (table === "reservations" || table === "meal_subscriptions") void refresh();
    };
    window.addEventListener(REALTIME_SYNC_EVENT, onRealtime);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
      window.removeEventListener(REALTIME_SYNC_EVENT, onRealtime);
    };
  }, [refresh]);

  async function updateReservation(id: string, status: "confirmed" | "cancelled" | "completed") {
    setSavingId(id);
    setError("");
    try {
      const response = await fetch("/api/reservations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!response.ok) throw new Error(await responseError(response, "Reservation update failed"));
      await refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Reservation update failed.");
    } finally {
      setSavingId("");
    }
  }

  async function updateMealPlan(id: string, status: "active" | "paused" | "cancelled" | "completed") {
    setSavingId(id);
    setError("");
    try {
      const response = await fetch("/api/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!response.ok) throw new Error(await responseError(response, "Meal plan update failed"));
      await refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Meal plan update failed.");
    } finally {
      setSavingId("");
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="admin-panel-heading">
        <div><h1>Meal plans &amp; reservations</h1><p>Customer requests saved in Supabase; refreshes live and on a short polling interval.</p></div>
        <button type="button" onClick={() => void refresh()} disabled={loading}>Refresh</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && <p role="status">Loading customer requests…</p>}
      <section className="admin-panel" aria-labelledby="admin-reservations-heading">
        <h2 id="admin-reservations-heading">Table reservations</h2>
        {reservations.length ? reservations.map((reservation) => (
          <article className="admin-recent-order" key={reservation.id}>
            <span><strong>{reservation.guest_name}</strong><small>{reservation.phone} · {reservation.party_size} guests · {new Date(reservation.slot_time).toLocaleString()}</small>{reservation.notes && <small>{reservation.notes}</small>}</span>
            <span className="admin-recent-status">{reservation.status}</span>
            <div>
              <button type="button" disabled={savingId === reservation.id || reservation.status === "confirmed"} onClick={() => void updateReservation(reservation.id, "confirmed")}>Confirm</button>
              <button type="button" disabled={savingId === reservation.id || reservation.status === "cancelled"} onClick={() => void updateReservation(reservation.id, "cancelled")}>Cancel</button>
              <button type="button" disabled={savingId === reservation.id || reservation.status === "completed"} onClick={() => void updateReservation(reservation.id, "completed")}>Complete</button>
            </div>
          </article>
        )) : !loading && <p>No reservations have been submitted.</p>}
      </section>
      <section className="admin-panel" aria-labelledby="admin-meal-plans-heading" style={{ marginTop: 20 }}>
        <h2 id="admin-meal-plans-heading">Meal plan requests</h2>
        {mealPlans.length ? mealPlans.map((plan) => (
          <article className="admin-recent-order" key={plan.id}>
            <span><strong>{plan.plan_type} · {plan.meal_slot}</strong><small>{(plan.days_of_week || []).join(", ")} · {plan.start_date}{plan.end_date ? ` – ${plan.end_date}` : ""}</small></span>
            <span className="admin-recent-status">{plan.status}</span>
            <div>
              <button type="button" disabled={savingId === plan.id || plan.status === "active"} onClick={() => void updateMealPlan(plan.id, "active")}>Activate</button>
              <button type="button" disabled={savingId === plan.id || plan.status === "paused"} onClick={() => void updateMealPlan(plan.id, "paused")}>Pause</button>
              <button type="button" disabled={savingId === plan.id || plan.status === "cancelled"} onClick={() => void updateMealPlan(plan.id, "cancelled")}>Cancel</button>
            </div>
          </article>
        )) : !loading && <p>No meal plan requests have been submitted.</p>}
      </section>
    </motion.div>
  );
}

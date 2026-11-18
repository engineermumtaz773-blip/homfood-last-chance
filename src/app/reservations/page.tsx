"use client";

import { ReservationForm } from "@/components/reservation-form";
import { useSiteSettings } from "@/components/site-settings";

export default function ReservationsPage() {
  const { t } = useSiteSettings();
  return <main className="feature-page">
    <p className="store-eyebrow">{t("reservationEyebrow")}</p>
    <h1>{t("reservationPageTitle")}</h1>
    <p>{t("reservationPageDescription")}</p>
    <ReservationForm />
  </main>;
}

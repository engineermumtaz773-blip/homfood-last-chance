"use client";

import { SubscriptionForm } from "@/components/subscription-form";
import { useSiteSettings } from "@/components/site-settings";

export default function SubscriptionsPage() {
  const { t } = useSiteSettings();
  return <main className="feature-page">
    <p className="store-eyebrow">{t("subscriptionsEyebrow")}</p>
    <h1>{t("subscriptionsPageTitle")}</h1>
    <p>{t("subscriptionsPageDescription")}</p>
    <SubscriptionForm />
  </main>;
}

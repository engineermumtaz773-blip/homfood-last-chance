"use client";

import { useRouter } from "next/navigation";
import { useSiteSettings } from "@/components/site-settings";

export function MenuUnavailable() {
  const router = useRouter();
  const { t } = useSiteSettings();

  return (
    <main className="offline-page" role="alert">
      <h1>{t("menuUnavailableTitle")}</h1>
      <p>{t("menuUnavailableDescription")}</p>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="add-button"
        style={{ marginTop: 16 }}
      >
        {t("tryAgain")}
      </button>
    </main>
  );
}

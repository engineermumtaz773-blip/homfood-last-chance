"use client";

import { useEffect, useState } from "react";
import { getKitchenAvailability, type KitchenAvailability } from "@/lib/kitchen-hours";
import type { StoreSettings } from "@/lib/store-db";
import { REALTIME_SYNC_EVENT } from "@/lib/realtime-client";

export function useKitchenAvailability() {
  const [availability, setAvailability] = useState<KitchenAvailability | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        if (!response.ok) throw new Error(`Settings request failed (${response.status}).`);
        const data = await response.json() as { settings?: StoreSettings };
        if (active && data.settings) setAvailability(getKitchenAvailability(data.settings));
      } catch (error) {
        console.error("Could not load kitchen availability:", error);
        if (active) setAvailability({
          available: false,
          reason: "Kitchen hours could not be verified. Please try again shortly.",
          schedule: "",
        });
      }
    };
    void load();
    const refresh = () => { void load(); };
    window.addEventListener(REALTIME_SYNC_EVENT, refresh);
    const interval = window.setInterval(refresh, 5_000);
    return () => {
      active = false;
      window.removeEventListener(REALTIME_SYNC_EVENT, refresh);
      window.clearInterval(interval);
    };
  }, []);

  return availability;
}

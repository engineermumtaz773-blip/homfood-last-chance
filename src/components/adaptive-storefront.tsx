"use client";

import { useEffect, useState } from "react";
import { StorefrontHome } from "@/components/storefront-home";
import { NativeMobileHome } from "@/components/native-mobile-home";
import { DesktopPosLayout } from "@/components/desktop-pos-layout";
import type { Dish } from "@/lib/data";

export const VIEW_MODE_CHANGE_EVENT = "hmf_view_mode_changed";

export function AdaptiveStorefront({ dishes }: { dishes: Dish[] }) {
  const [isStandalone, setIsStandalone] = useState(false);
  const [modeOverride, setModeOverride] = useState<"auto" | "web" | "app">("auto");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const media = window.matchMedia("(display-mode: standalone)");
    const checkStandalone = () => {
      const standalone =
        media.matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsStandalone(standalone);
      if (standalone) {
        document.documentElement.setAttribute("data-pwa-standalone", "true");
      }
    };

    checkStandalone();
    media.addEventListener("change", checkStandalone);

    const saved = localStorage.getItem("hmf_view_mode") as "auto" | "web" | "app" | null;
    if (saved) {
      setModeOverride(saved);
      if (saved === "app") {
        document.documentElement.setAttribute("data-pwa-standalone", "true");
      } else if (saved === "web") {
        document.documentElement.removeAttribute("data-pwa-standalone");
      }
    }

    const handler = (e: Event) => {
      const ce = e as CustomEvent<"auto" | "web" | "app">;
      if (ce.detail) {
        setModeOverride(ce.detail);
        localStorage.setItem("hmf_view_mode", ce.detail);
        if (ce.detail === "app") {
          document.documentElement.setAttribute("data-pwa-standalone", "true");
        } else if (ce.detail === "web") {
          document.documentElement.removeAttribute("data-pwa-standalone");
        }
      }
    };

    window.addEventListener(VIEW_MODE_CHANGE_EVENT, handler);
    return () => {
      media.removeEventListener("change", checkStandalone);
      window.removeEventListener(VIEW_MODE_CHANGE_EVENT, handler);
    };
  }, []);

  // When installed as PWA or user explicitly selected "app" view mode:
  const isPwaAppActive = modeOverride === "app" || (modeOverride === "auto" && isStandalone);

  if (mounted && isPwaAppActive) {
    return (
      <div className="adaptive-pwa-wrapper">
        <div className="adaptive-mobile-container">
          <NativeMobileHome dishes={dishes} />
        </div>
        <div className="adaptive-desktop-container">
          <DesktopPosLayout dishes={dishes} />
        </div>
      </div>
    );
  }

  // Web Browser default: High-end, responsive web application with standard header, hero, multi-column layouts & footer
  return (
    <div className="adaptive-web-wrapper">
      <StorefrontHome dishes={dishes} />
    </div>
  );
}

"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { MobileAppShell } from "@/components/mobile-app-shell";
import { MobileCartDrawer } from "@/components/mobile-cart-drawer";
import { FloatingAssistants } from "@/components/floating-assistants";
import { NewVisitorAuthPrompt } from "@/components/new-visitor-auth-prompt";

export function StorefrontShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = Boolean(pathname && pathname.startsWith("/admin"));
  const isMobileRoute = Boolean(
    pathname && (pathname.startsWith("/mobile") || pathname.startsWith("/app/mobile"))
  );

  const [accessDeniedToast, setAccessDeniedToast] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<"auto" | "web" | "app" | "mobile-app" | "desktop-app">("auto");
  const [desktopStandalone, setDesktopStandalone] = useState(false);

  useEffect(() => {
    const viewport = window.matchMedia("(max-width: 1023px)");
    const standalone = window.matchMedia("(display-mode: standalone)");
    const checkViewport = () => {
      setIsMobile(viewport.matches || isMobileRoute);
      setDesktopStandalone(
        !viewport.matches && (standalone.matches || (window.navigator as unknown as { standalone?: boolean }).standalone === true),
      );
    };
    const checkStandalone = () => setDesktopStandalone(
      !viewport.matches && (standalone.matches || (window.navigator as unknown as { standalone?: boolean }).standalone === true),
    );
    const restorePreferences = () => {
      try {
        const saved = localStorage.getItem("hmf_view_mode");
        setViewMode(saved === "mobile-app" || saved === "desktop-app" || saved === "app" || saved === "web" || saved === "auto" ? saved : "auto");
      } catch (error) {
        console.warn("Could not restore the saved view preference.", error);
      }
      checkViewport();
      checkStandalone();
      setMounted(true);
    };
    const modeHandler = (event: Event) => {
      const selected = (event as CustomEvent<"auto" | "web" | "app" | "mobile-app" | "desktop-app">).detail;
      if (selected === "app" || selected === "web" || selected === "auto" || selected === "mobile-app" || selected === "desktop-app") {
        setViewMode(selected);
        try {
          window.localStorage.setItem("hmf_view_mode", selected);
        } catch (error) {
          console.warn("Could not save the selected view preference.", error);
        }
      }
    };
    checkViewport();
    checkStandalone();
    const restoreTimer = window.setTimeout(restorePreferences, 0);
    viewport.addEventListener("change", checkViewport);
    standalone.addEventListener("change", checkStandalone);
    window.addEventListener("resize", checkViewport);
    window.addEventListener("hmf_view_mode_changed", modeHandler);

    // Check for access denied toast param
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    let accessDeniedFrame = 0;
    if (error === "access_denied" || error === "admin_required") {
      accessDeniedFrame = window.requestAnimationFrame(() => {
        setAccessDeniedToast("Access Denied: Admin privileges required");
      });
      const url = new URL(window.location.href);
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
    }

    return () => {
      window.clearTimeout(restoreTimer);
      if (accessDeniedFrame) window.cancelAnimationFrame(accessDeniedFrame);
      viewport.removeEventListener("change", checkViewport);
      standalone.removeEventListener("change", checkStandalone);
      window.removeEventListener("resize", checkViewport);
      window.removeEventListener("hmf_view_mode_changed", modeHandler);
    };
  }, [pathname, isMobileRoute]);

  useEffect(() => {
    if (!accessDeniedToast) return;
    const timer = window.setTimeout(() => setAccessDeniedToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [accessDeniedToast]);

  // Admin Portal isolation
  if (isAdminRoute) {
    return <main className="admin-root-viewport">{children}</main>;
  }

  const isDesktopApp = !isMobile && (viewMode === "desktop-app" || viewMode === "app" || (viewMode === "auto" && desktopStandalone));
  const isDesktopAppHome = isDesktopApp && pathname === "/";
  const isMobileAppHome = viewMode === "mobile-app" && pathname === "/" && !isMobile;
  const isMobileHome = isMobile && (pathname === "/" || isMobileRoute);

  return (
    <>
      {/* Toast Alert for Access Denied / Security notifications */}
      <AnimatePresence>
        {accessDeniedToast && (
          <motion.div
            role="alert"
            aria-live="assertive"
            initial={{ opacity: 0, y: -40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            style={{
              position: "fixed",
              top: 24,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 999999,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 22px",
              borderRadius: 14,
              background: "linear-gradient(135deg, #1e0909 0%, #2c0e0e 100%)",
              border: "1px solid rgba(239, 68, 68, 0.45)",
              color: "#fff",
              boxShadow: "0 20px 45px -10px rgba(220, 38, 38, 0.4), 0 0 0 1px rgba(255,255,255,0.06)",
              backdropFilter: "blur(16px)",
              fontFamily: "inherit",
              maxWidth: "min(92vw, 480px)",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "rgba(239, 68, 68, 0.2)",
                color: "#ef4444",
                fontSize: 16,
                fontWeight: "bold",
                flexShrink: 0,
              }}
            >
              ⛔
            </span>
            <div style={{ flex: 1 }}>
              <strong style={{ display: "block", fontSize: 14, color: "#fca5a5", lineHeight: 1.2 }}>
                {accessDeniedToast}
              </strong>
              <span style={{ fontSize: 12, color: "#cbd5e1" }}>
                Sign in with an authorized administrator account to access the panel.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAccessDeniedToast(null)}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                padding: 4,
                fontSize: 16,
                lineHeight: 1,
              }}
              aria-label="Dismiss alert"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Render a fluid app shell on phone and tablet viewports. */}
      {mounted && (isMobile || isMobileRoute) ? (
        <MobileAppShell hideHeader={isMobileHome}>
          {children}
          <MobileCartDrawer />
          <FloatingAssistants />
        </MobileAppShell>
      ) : (
        <>
          {isMobileAppHome && <button type="button" className="app-view-return" onClick={() => window.dispatchEvent(new CustomEvent("hmf_view_mode_changed", { detail: "web" }))}>← Website View</button>}
          {!isDesktopAppHome && !isMobileAppHome && <SiteHeader />}
          <main
            className={isDesktopAppHome ? "desktop-app-shell" : isMobileAppHome ? "mobile-app-shell" : undefined}
            role={isDesktopAppHome || isMobileAppHome ? "none" : undefined}
          >
            {children}
          </main>
          {!isDesktopAppHome && !isMobileAppHome && <SiteFooter />}
          <MobileCartDrawer />
          <FloatingAssistants />
          {!isDesktopAppHome && !isMobileAppHome && <NewVisitorAuthPrompt />}
        </>
      )}
    </>
  );
}

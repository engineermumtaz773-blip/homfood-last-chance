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

  useEffect(() => {
    setMounted(true);

    if (typeof window === "undefined") return;

    // Detect mobile viewport or PWA standalone mode
    const checkViewport = () => {
      const isNarrow = window.innerWidth <= 768;
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        document.documentElement.getAttribute("data-pwa-standalone") === "true";

      setIsMobile(isNarrow || standalone || isMobileRoute);
    };

    checkViewport();
    window.addEventListener("resize", checkViewport);

    // Check for access denied toast param
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (error === "access_denied" || error === "admin_required") {
      setAccessDeniedToast("Access Denied: Admin privileges required");
      const url = new URL(window.location.href);
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
    }

    return () => window.removeEventListener("resize", checkViewport);
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

      {/* Render Native Mobile App Shell on Mobile Viewports / PWA Standalone Mode */}
      {mounted && (isMobile || isMobileRoute) ? (
        <MobileAppShell>
          {children}
          <MobileCartDrawer />
          <FloatingAssistants />
        </MobileAppShell>
      ) : (
        <>
          <SiteHeader />
          <main>{children}</main>
          <SiteFooter />
          <MobileCartDrawer />
          <FloatingAssistants />
          <NewVisitorAuthPrompt />
        </>
      )}
    </>
  );
}

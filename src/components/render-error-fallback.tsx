"use client";

import { useEffect } from "react";

export function RenderErrorFallback({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("[APP_RENDER_ERROR]", error);
  }, [error]);

  return (
    <main style={{ display: "grid", minHeight: "100vh", placeContent: "center", gap: 12, padding: 24, textAlign: "center", fontFamily: "Arial, sans-serif", color: "CanvasText", background: "Canvas", colorScheme: "light dark" }}>
      <h1 style={{ margin: 0 }}>We&apos;re having trouble loading this page</h1>
      <p style={{ margin: 0, color: "GrayText" }}>Please try again. If the problem continues, come back shortly.</p>
      <button
        type="button"
        onClick={retry}
        style={{ justifySelf: "center", marginTop: 8, padding: "12px 20px", border: 0, borderRadius: 999, background: "Highlight", color: "HighlightText", cursor: "pointer" }}
      >
        Try again
      </button>
    </main>
  );
}

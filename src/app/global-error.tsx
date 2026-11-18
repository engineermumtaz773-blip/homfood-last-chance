"use client";

import { RenderErrorFallback } from "@/components/render-error-fallback";

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <RenderErrorFallback error={error} retry={retry} />
      </body>
    </html>
  );
}

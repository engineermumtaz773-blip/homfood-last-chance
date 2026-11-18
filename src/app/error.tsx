"use client";

import { RenderErrorFallback } from "@/components/render-error-fallback";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  return <RenderErrorFallback error={error} retry={retry} />;
}

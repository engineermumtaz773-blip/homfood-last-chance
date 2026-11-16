"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseAuthClient } from "@/lib/supabase-auth-client";
import { saveCustomerProfile, type CustomerProfile } from "@/lib/customer";

function safeReturnPath(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

function CallbackStatus() {
  const params = useSearchParams();
  const [message, setMessage] = useState("Completing your secure sign-in…");
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function completeSignIn() {
      const providerError = params.get("error_description") || params.get("error");
      if (providerError) throw new Error("Sign-in was cancelled or could not be completed.");
      const code = params.get("code");
      if (!code) throw new Error("The sign-in link is incomplete. Please try again.");
      const supabase = getSupabaseAuthClient();
      if (!supabase) throw new Error("Supabase sign-in is not configured.");

      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;
      if (!data.session?.access_token || !data.user?.email) throw new Error("No verified user session was returned.");

      const response = await fetch("/api/auth/supabase-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ accessToken: data.session.access_token }),
      });
      const result = await response.json() as { error?: string; customer?: CustomerProfile };
      if (!response.ok || !result.customer) throw new Error(result.error || "Unable to create your customer session.");
      const customer = result.customer;
      saveCustomerProfile({
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone || "",
        avatarUrl: customer.avatarUrl || "",
        authProvider: customer.authProvider,
        emailVerified: customer.emailVerified,
        addresses: customer.addresses || ["Bahawalpur City"],
        preferredPayment: "Digital Payment (Raast)",
        createdAt: customer.createdAt,
      });
      if (!cancelled) {
        setMessage("You’re signed in. Redirecting…");
        window.location.replace(safeReturnPath(params.get("next")));
      }
    }

    void completeSignIn().catch((cause: unknown) => {
      if (cancelled) return;
      console.error("[SUPABASE_AUTH_CALLBACK_ERROR]", cause);
      setMessage(cause instanceof Error ? cause.message : "Unable to complete sign-in. Please try again.");
      setError(true);
    });
    return () => { cancelled = true; };
  }, [params]);

  return (
    <main style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: 20 }}>
      <section role="status" style={{ width: "min(100%, 460px)", padding: "clamp(22px, 5vw, 38px)", borderRadius: 24, background: "var(--surface, #fff)", textAlign: "center", boxShadow: "0 18px 50px #173f2b18" }}>
        <h1 style={{ marginTop: 0, color: "var(--ink, #173f2b)" }}>{error ? "Sign-in needs attention" : "Welcome to Home Made Food"}</h1>
        <p>{message}</p>
        {error && <a href="/" style={{ display: "inline-flex", minHeight: 44, alignItems: "center", padding: "0 18px", borderRadius: 10, background: "var(--accent-strong, #173f2b)", color: "#fff" }}>Return to the storefront</a>}
      </section>
    </main>
  );
}

export default function AuthCallbackPage() {
  return <Suspense fallback={<main style={{ minHeight: "70vh", display: "grid", placeItems: "center" }}>Completing your secure sign-in…</main>}><CallbackStatus /></Suspense>;
}

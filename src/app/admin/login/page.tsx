"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";

const defaultAuthorizedEmail = "engineermumtaz773@gmail.com";
const lockoutMessage = "Access denied: Too many failed attempts. Account temporarily blocked for security.";

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpMessage, setOtpMessage] = useState("");
  const [devCode, setDevCode] = useState("");
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!otpRequested || secondsRemaining <= 0) return;
    const timer = window.setInterval(() => {
      setSecondsRemaining((remaining) => {
        if (remaining <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return remaining - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpRequested, secondsRemaining]);

  function applyFailure(message: string, retryAfter: string | null) {
    setError(message);
    if (message === lockoutMessage) {
      setBlocked(true);
      return;
    }
    if (retryAfter) {
      const seconds = Number.parseInt(retryAfter, 10);
      if (Number.isFinite(seconds) && seconds > 0) setSecondsRemaining(seconds);
    }
  }

  async function requestCode(value: string): Promise<{ message: string; devCode: string }> {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: value }),
      cache: "no-store",
    });
    const result: unknown = await response.json();
    if (!response.ok || typeof result !== "object" || result === null || !("ok" in result) || result.ok !== true) {
      const message = typeof result === "object" && result !== null && "message" in result && typeof result.message === "string"
        ? result.message
        : "Admin sign-in failed.";
      applyFailure(message, response.headers.get("Retry-After"));
      return { message: "", devCode: "" };
    }
    return {
      message: "message" in result && typeof result.message === "string"
        ? result.message
        : "A verification code was sent to the authorized admin email address.",
      devCode: "devCode" in result && typeof result.devCode === "string" && /^\d{6}$/.test(result.devCode)
        ? result.devCode
        : "",
    };
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const normalizedEmail = email.trim().toLowerCase();

    try {
      const delivery = await requestCode(normalizedEmail);
      if (delivery.message) {
        setEmail(normalizedEmail);
        setOtpRequested(true);
        setOtpMessage(delivery.message);
        setDevCode(delivery.devCode);
        setSecondsRemaining(60);
        setError("");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Admin sign-in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/admin/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        cache: "no-store",
      });
      const result: unknown = await response.json();
      if (!response.ok || typeof result !== "object" || result === null || !("ok" in result) || result.ok !== true) {
        const message = typeof result === "object" && result !== null && "message" in result && typeof result.message === "string"
          ? result.message
          : "Verification failed.";
        applyFailure(message, response.headers.get("Retry-After"));
        return;
      }

      const next = searchParams.get("next");
      router.replace(next?.startsWith("/admin") && !next.startsWith("//") ? next : "/admin");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Verification failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function resendCode() {
    setSubmitting(true);
    setError("");
    try {
      const delivery = await requestCode(email);
      if (delivery.message) {
        setCode("");
        setOtpMessage(delivery.message);
        setDevCode(delivery.devCode);
        setSecondsRemaining(60);
        setError("");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not resend the verification code.");
    } finally {
      setSubmitting(false);
    }
  }

  async function startOver() {
    setSubmitting(true);
    setError("");
    try {
      await fetch("/api/admin/login", { method: "DELETE", cache: "no-store" });
      setOtpRequested(false);
      setOtpMessage("");
      setDevCode("");
      setCode("");
      setSecondsRemaining(0);
      setEmail("");
    } catch {
      setError("Could not restart sign-in. Refresh the page and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="admin-login-page">
      <motion.form
        className="form-card admin-login-card"
        onSubmit={otpRequested ? verifyCode : submitEmail}
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        {/* Brand Header with Official Logo & Circular Glow */}
        <div className="admin-login-header" style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "20px" }}>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 240, damping: 18 }}
            style={{ position: "relative", width: "88px", height: "88px", marginBottom: "12px" }}
          >
            {/* Glowing circular backdrop */}
            <div
              style={{
                position: "absolute",
                inset: "-4px",
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(34, 197, 94, 0.45) 0%, rgba(22, 101, 52, 0.15) 60%, transparent 75%)",
                filter: "blur(8px)",
              }}
            />
            {/* Circular image ring */}
            <div
              style={{
                position: "relative",
                width: "88px",
                height: "88px",
                borderRadius: "50%",
                padding: "3px",
                background: "linear-gradient(135deg, #22c55e, #166534, #86efac)",
                boxShadow: "0 8px 24px rgba(22, 101, 52, 0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              <Image
                src="/image_6c70d8.jpg"
                alt="Home Made Food Logo"
                width={84}
                height={84}
                priority
                unoptimized
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: "50%",
                  objectFit: "cover",
                }}
              />
            </div>
          </motion.div>
          <span
            className="store-eyebrow"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "11px",
              fontWeight: 800,
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: "#166534",
              background: "#dcfce7",
              padding: "4px 12px",
              borderRadius: "9999px",
            }}
          >
            <span>✦</span> STORE OWNER ACCESS
          </span>
        </div>

        <h1 style={{ textAlign: "center" }}>
          {blocked ? "Sign-in blocked" : otpRequested ? "Verify your sign-in" : "Admin sign in"}
        </h1>

        {blocked ? (
          <p className="admin-login-lockout" role="alert">{lockoutMessage}</p>
        ) : otpRequested ? (
          <>
            <p style={{ textAlign: "center" }}>{otpMessage} Enter it below to continue.</p>
            <label className="field">
              6-digit verification code
              <input
                autoComplete="one-time-code"
                autoFocus
                inputMode="numeric"
                maxLength={6}
                pattern="[0-9]{6}"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                required
              />
            </label>
            {devCode && (
              <div className="admin-dev-code" role="status">
                <span>Dev Passkey: <code>{devCode}</code></span>
                <button type="button" onClick={() => setCode(devCode)} disabled={submitting}>Fill code</button>
              </div>
            )}
            <div className="admin-otp-resend">
              <span aria-live="polite">
                {secondsRemaining > 0
                  ? `Resend code in ${String(Math.floor(secondsRemaining / 60)).padStart(2, "0")}:${String(secondsRemaining % 60).padStart(2, "0")}`
                  : "Didn’t receive a code?"}
              </span>
              <button type="button" onClick={resendCode} disabled={submitting || secondsRemaining > 0}>
                {submitting ? "Sending…" : "Resend OTP"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ textAlign: "center" }}>
              Enter the authorized administrator email to receive a secure verification code.
            </p>
            <label className="field">
              Admin email
              <input
                type="text"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={defaultAuthorizedEmail}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
          </>
        )}

        {error && !blocked && <p className="form-error" role="alert">{error}</p>}

        {!blocked && (
          <button className="add-button" type="submit" disabled={submitting}>
            {submitting ? "Verifying…" : otpRequested ? "Verify and continue" : "Continue"}
          </button>
        )}

        {otpRequested && !blocked && (
          <button className="admin-login-back" type="button" onClick={startOver} disabled={submitting}>
            Use a different email
          </button>
        )}

        <Link href="/" style={{ textAlign: "center", display: "block", marginTop: "12px" }}>
          Back to storefront
        </Link>
      </motion.form>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<main className="admin-login-page" aria-busy="true" />}>
      <AdminLoginForm />
    </Suspense>
  );
}

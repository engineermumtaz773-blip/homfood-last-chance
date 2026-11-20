"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { FormEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { acquireScrollLock } from "@/lib/scroll-lock";
import { saveCustomerProfile, readCustomerProfile, type CustomerProfile } from "@/lib/customer";
import { getSupabaseAuthClient } from "@/lib/supabase-auth-client";
import { getFriendlyGoogleAuthError } from "@/lib/auth-error-message";

export type AuthMode = "signup" | "login";
export type AuthStep = "method" | "otp" | "success";

interface CustomerAuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (profile: CustomerProfile) => void;
  initialMode?: AuthMode;
  initialReason?: string;
}

export function CustomerAuthModal({
  open,
  onClose,
  onSuccess,
  initialMode = "signup",
  initialReason,
}: CustomerAuthModalProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [step, setStep] = useState<AuthStep>("method");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [signupMethod, setSignupMethod] = useState<"email" | "mobile">("email");
  const [phoneVerificationId, setPhoneVerificationId] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [authProvider, setAuthProvider] = useState<"google" | "email">("email");
  const [otpCode, setOtpCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resendCountdown, setResendCountdown] = useState(0);
  const [otpExpiresInSeconds, setOtpExpiresInSeconds] = useState(600); // 10 minutes = 600s
  const [accountAlreadyExists, setAccountAlreadyExists] = useState(false);
  const [smsUnavailable, setSmsUnavailable] = useState(false);

  const otpInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Sync mode with prop
  useEffect(() => {
    if (!open) return;
    const resetFrame = window.requestAnimationFrame(() => {
      setMode(initialMode);
      setStep("method");
      setError("");
      setMessage(initialReason || "");
      setOtpCode("");
      setSignupMethod("email");
      setPhoneVerificationId("");
      setDevCode(null);
      setAccountAlreadyExists(false);
      setSmsUnavailable(false);
      setOtpExpiresInSeconds(600);
      setBusy(false);
      setGoogleBusy(false);
    });
    return () => window.cancelAnimationFrame(resetFrame);
  }, [open, initialMode, initialReason]);

  // Handle scroll lock & escape key
  useEffect(() => {
    if (!open) return;
    const releaseScroll = acquireScrollLock();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialogRef.current.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      releaseScroll();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initialFocusFrame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )?.focus();
    });
    return () => {
      window.cancelAnimationFrame(initialFocusFrame);
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    };
  }, [open]);

  // Listen for Google Auth postMessage (if opened in popup) or storage event
  useEffect(() => {
    const handleAuthMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === "HMF_GOOGLE_AUTH_SUCCESS" && e.data.profile) {
        onSuccess?.(e.data.profile as CustomerProfile);
        onClose();
      }
    };
    window.addEventListener("message", handleAuthMessage);
    return () => window.removeEventListener("message", handleAuthMessage);
  }, [onSuccess, onClose]);

  // Resend cooldown timer countdown (60s)
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setInterval(() => {
      setResendCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCountdown]);

  // 10-minute OTP expiration timer countdown
  useEffect(() => {
    if (step !== "otp" || otpExpiresInSeconds <= 0) return;
    const timer = setInterval(() => {
      setOtpExpiresInSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [step, otpExpiresInSeconds]);

  // Real Google OAuth Handler
  const handleGoogleSignIn = async () => {
    setGoogleBusy(true);
    setError("");
    try {
      const supabase = getSupabaseAuthClient();
      if (!supabase) throw new Error("Google sign-in is not configured. Please use email OTP.");
      const returnPath = window.location.pathname + window.location.search;
      const redirectTo = new URL("/auth/callback", window.location.origin);
      redirectTo.searchParams.set("next", returnPath.startsWith("/") && !returnPath.startsWith("//") ? returnPath : "/");
      const { data, error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectTo.toString(),
          queryParams: { prompt: "select_account" },
          skipBrowserRedirect: true,
        },
      });
      if (authError) throw authError;
      if (!data.url) throw new Error("Google sign-in could not be started.");
      window.location.assign(data.url);
    } catch (err) {
      console.error("[GOOGLE_OAUTH_START_ERROR]", err);
      setError(getFriendlyGoogleAuthError(err));
      setGoogleBusy(false);
    }
  };

  // Send Email OTP handler
  const sendEmailOtp = useCallback(
    async (
      targetEmail: string,
      targetName?: string,
      targetAvatar?: string,
      provider: "google" | "email" = "email",
      explicitMode?: AuthMode
    ) => {
      setBusy(true);
      setError("");
      setMessage("");
      setAccountAlreadyExists(false);
      const activeMode = explicitMode || mode;

      try {
        const res = await fetch("/api/auth/email-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "send",
            email: targetEmail,
            name: targetName,
            avatarUrl: targetAvatar,
            authProvider: provider,
            mode: activeMode,
          }),
        });

        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          message?: string;
          devCode?: string;
          accountExists?: boolean;
          expiresInSeconds?: number;
        };

        if (res.status === 409 || data.accountExists) {
          setAccountAlreadyExists(true);
          setEmail(targetEmail);
          setError("Account already exists with this email.");
          return;
        }

        if (!res.ok) {
          throw new Error(data.error || "Failed to send verification code.");
        }

        setEmail(targetEmail);
        if (targetName) setName(targetName);
        if (targetAvatar) setAvatarUrl(targetAvatar);
        setAuthProvider(provider);
        if (data.devCode) setDevCode(data.devCode);
        setStep("otp");
        setResendCountdown(60);
        setOtpExpiresInSeconds(data.expiresInSeconds || 600);
        setMessage(data.message || `We sent a 6-digit code to ${targetEmail}`);
        setTimeout(() => otpInputRef.current?.focus(), 150);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send code.");
      } finally {
        setBusy(false);
      }
    },
    [mode]
  );

  // Switch to login and send OTP (for existing account prompt or forgot password)
  const handleSwitchToLoginAndSendOtp = async () => {
    setMode("login");
    setAccountAlreadyExists(false);
    setError("");
    await sendEmailOtp(email.trim(), "", "", "email", "login");
  };

  // Email form submit
  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setError("Please provide a valid email address.");
      return;
    }
    if (mode === "signup" && !name.trim()) {
      setError("Please enter your full name.");
      return;
    }

    await sendEmailOtp(email.trim(), name.trim(), "", "email");
  }

  async function sendPhoneOtp() {
    setBusy(true);
    setError("");
    setMessage("");
    setSmsUnavailable(false);
    try {
      const response = await fetch("/api/auth/phone/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, fullName: name }),
      });
      const data = await response.json() as { error?: string; verificationId?: string };
      if (!response.ok || !data.verificationId) throw new Error(data.error || "Could not send an SMS code.");
      setPhoneVerificationId(data.verificationId);
      setStep("otp");
      setOtpCode("");
      setResendCountdown(60);
      setOtpExpiresInSeconds(300);
      setMessage(`A 6-digit code was sent to ${phone}.`);
      window.setTimeout(() => otpInputRef.current?.focus(), 150);
    } catch (sendError) {
      const errorMessage = sendError instanceof Error ? sendError.message : "Could not send an SMS code.";
      setSmsUnavailable(/sms|textbee|phone verification database|too many codes/i.test(errorMessage));
      setError(errorMessage);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyPhoneOtp(codeOverride?: string) {
    const cleanCode = (codeOverride ?? otpCode).replace(/\D/g, "");
    if (cleanCode.length !== 6 || !phoneVerificationId || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationId: phoneVerificationId, code: cleanCode }),
      });
      const data = await response.json() as {
        error?: string;
        session?: { access_token: string; refresh_token: string };
        customer?: CustomerProfile;
      };
      if (!response.ok || !data.session || !data.customer) {
        throw new Error(data.error || "Could not verify the mobile number.");
      }
      const auth = getSupabaseAuthClient();
      if (!auth) throw new Error("Supabase phone sign-in is not configured.");
      const { error: sessionError } = await auth.auth.setSession(data.session);
      if (sessionError) throw sessionError;
      const updatedProfile: CustomerProfile = {
        ...data.customer,
        phone: data.customer.phone || phone,
        name: data.customer.name || name.trim(),
        emailVerified: false,
        phoneVerified: true,
        addresses: data.customer.addresses || [],
        preferredPayment: data.customer.preferredPayment || "Digital Payment (Raast)",
      };
      saveCustomerProfile(updatedProfile, false);
      setStep("success");
      window.setTimeout(() => {
        onSuccess?.(updatedProfile);
        onClose();
      }, 700);
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Could not verify the mobile number.");
    } finally {
      setBusy(false);
    }
  }

  function handlePhoneCodeChange(value: string) {
    const clean = value.replace(/\D/g, "").slice(0, 6);
    setOtpCode(clean);
    if (clean.length === 6) void handleVerifyPhoneOtp(clean);
  }

  // Verify OTP handler
  async function handleVerifyOtp(e?: FormEvent) {
    if (e) e.preventDefault();
    const cleanCode = otpCode.replace(/\D/g, "");
    if (cleanCode.length !== 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          email,
          code: cleanCode,
          name: name.trim(),
          phone: phone.trim(),
          avatarUrl,
          authProvider,
        }),
      });

      const data = (await res.json()) as {
        error?: string;
        customer?: {
          id: string;
          name: string;
          email: string;
          phone?: string;
          avatarUrl?: string;
          authProvider: "google" | "email";
          emailVerified: boolean;
          createdAt: string;
        };
      };
      if (!res.ok || !data.customer) {
        throw new Error(data.error || "Verification failed. Please recheck your code.");
      }

      // Save customer profile locally
      const existing = readCustomerProfile();
      const updatedProfile: CustomerProfile = {
        id: data.customer.id,
        name: data.customer.name,
        email: data.customer.email,
        phone: data.customer.phone || existing?.phone || phone.trim() || "",
        avatarUrl: data.customer.avatarUrl || avatarUrl,
        authProvider: data.customer.authProvider,
        emailVerified: true,
        addresses: existing?.addresses || ["Bahawalpur City"],
        preferredPayment: existing?.preferredPayment || "Digital Payment (Raast)",
        createdAt: data.customer.createdAt,
      };

      saveCustomerProfile(updatedProfile);
      setStep("success");

      setTimeout(() => {
        onSuccess?.(updatedProfile);
        onClose();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="auth-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 99999,
          background: "rgba(10, 15, 29, 0.75)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
          overflowY: "auto",
        }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <motion.div
          ref={dialogRef}
          className="auth-modal-dialog"
          initial={{ scale: 0.95, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 15 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "relative",
            width: "min(calc(100vw - 24px), 400px)",
            maxWidth: "400px",
            maxHeight: "90dvh",
            background: "#ffffff",
            borderRadius: "28px",
            boxShadow:
              "0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.2)",
            overflow: "hidden",
            color: "#1e293b",
          }}
        >
          {/* Top Brand Banner with Official Logo */}
          <div
            style={{
              background: "linear-gradient(135deg, #173f2b 0%, #0d281a 100%)",
              padding: "16px",
              color: "#ffffff",
              position: "relative",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "rgba(255, 255, 255, 0.15)",
                border: "none",
                color: "#ffffff",
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                lineHeight: 1,
              }}
            >
              ✕
            </button>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                marginBottom: "6px",
              }}
            >
              {/* Circular Logo with Glow */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}
                style={{
                  position: "relative",
                  width: "54px",
                  height: "54px",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: "-3px",
                    borderRadius: "50%",
                    background:
                      "radial-gradient(circle, rgba(134, 239, 172, 0.5) 0%, rgba(22, 101, 52, 0.2) 70%, transparent 80%)",
                    filter: "blur(6px)",
                  }}
                />
                <div
                  style={{
                    position: "relative",
                    width: "54px",
                    height: "54px",
                    borderRadius: "50%",
                    padding: "2px",
                    background:
                      "linear-gradient(135deg, #86efac, #22c55e, #14532d)",
                    boxShadow: "0 4px 14px rgba(0, 0, 0, 0.3)",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Image
                    src="/image_6c70d8.jpg"
                    alt="Home Made Food Logo"
                    width={50}
                    height={50}
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

              <div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "10px",
                    fontWeight: 800,
                    letterSpacing: "2.5px",
                    textTransform: "uppercase",
                    color: "#86efac",
                    marginBottom: "3px",
                  }}
                >
                  <span>✦</span> SECURE CUSTOMER ACCESS
                </div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "20px",
                    fontWeight: 700,
                    letterSpacing: "-0.3px",
                    color: "#ffffff",
                  }}
                >
                  {step === "otp"
                    ? mode === "signup" && signupMethod === "mobile" ? "Verify SMS code" : "Verify Email OTP"
                    : step === "success"
                    ? "Verified Successfully"
                    : mode === "signup"
                    ? "Create Your Account"
                    : "Welcome Back"}
                </h2>
              </div>
            </div>

            <p
              style={{
                margin: "4px 0 0 0",
                fontSize: "13px",
                color: "rgba(255, 255, 255, 0.85)",
              }}
            >
              {step === "otp"
                ? `Enter the 6-digit code sent to your ${mode === "signup" && signupMethod === "mobile" ? "mobile number (valid for 5 minutes)" : "email (valid for 10 minutes)"}`
                : step === "success"
                ? "Your credentials and profile are active"
                : "Order fresh homemade meals in Bahawalpur"}
            </p>
          </div>

          {/* Modal Body */}
          <div style={{ padding: "16px" }}>
            {/* Step 1: Method selection (Sign Up / Sign In) */}
            {step === "method" && (
              <div>
                {/* Tabs for Sign Up / Log In */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    background: "#f1f5f9",
                    padding: "4px",
                    borderRadius: "14px",
                    marginBottom: "18px",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signup");
                      setSignupMethod("email");
                      setError("");
                      setAccountAlreadyExists(false);
                    }}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "10px",
                      border: "none",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      background: mode === "signup" ? "#ffffff" : "transparent",
                      color: mode === "signup" ? "#0f172a" : "#64748b",
                      boxShadow:
                        mode === "signup" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
                      transition: "all 0.2s ease",
                    }}
                  >
                    New User (Sign Up)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setError("");
                      setAccountAlreadyExists(false);
                    }}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "10px",
                      border: "none",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      background: mode === "login" ? "#ffffff" : "transparent",
                      color: mode === "login" ? "#0f172a" : "#64748b",
                      boxShadow:
                        mode === "login" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
                      transition: "all 0.2s ease",
                    }}
                  >
                    Existing (Sign In)
                  </button>
                </div>

                {mode === "signup" && (
                  <div
                    role="tablist"
                    aria-label="Sign-up method"
                    style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 }}
                  >
                    {(["email", "mobile"] as const).map((method) => (
                      <button
                        key={method}
                        type="button"
                        role="tab"
                        aria-selected={signupMethod === method}
                        onClick={() => {
                          setSignupMethod(method);
                          setError("");
                          setMessage("");
                          setSmsUnavailable(false);
                        }}
                        style={{
                          minHeight: 38,
                          border: "1px solid #dbe3e9",
                          borderRadius: 9,
                          background: signupMethod === method ? "#173f2b" : "#fff",
                          color: signupMethod === method ? "#fff" : "#475569",
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        {method === "email" ? "Email" : "Mobile number"}
                      </button>
                    ))}
                  </div>
                )}

                {/* Real Google OAuth Button (Redirects to official Google accounts.google.com) */}
                {(mode === "login" || signupMethod === "email") && <motion.button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={busy || googleBusy}
                  whileHover={{
                    scale: 1.015,
                    y: -1,
                    boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
                  }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "12px",
                    padding: "13px 18px",
                    borderRadius: "14px",
                    border: "1px solid #dadce0",
                    background: "#ffffff",
                    color: "#3c4043",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: busy || googleBusy ? "not-allowed" : "pointer",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.04)",
                  }}
                >
                  {googleBusy ? (
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        border: "2px solid #e2e8f0",
                        borderTopColor: "#4285F4",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                      />
                    </svg>
                  )}
                  <span>
                    {googleBusy
                      ? "Connecting to Google…"
                      : "Continue with Google"}
                  </span>
                </motion.button>}

                {/* Divider */}
                {(mode === "login" || signupMethod === "email") && <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    margin: "18px 0",
                    color: "#94a3b8",
                    fontSize: "12px",
                    fontWeight: 500,
                  }}
                >
                  <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
                  <span
                    style={{
                      padding: "0 10px",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    or with email
                  </span>
                  <div style={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
                </div>}

                {/* Email Form */}
                {mode === "signup" && signupMethod === "mobile" ? (
                  <form onSubmit={(event) => { event.preventDefault(); void sendPhoneOtp(); }}>
                    <label style={{ display: "block", marginBottom: 10, fontSize: 12, fontWeight: 600, color: "#334155" }}>
                      Full name
                      <input
                        type="text"
                        autoComplete="name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                        minLength={2}
                        maxLength={80}
                        placeholder="Your full name"
                        style={{ display: "block", boxSizing: "border-box", width: "100%", height: 40, marginTop: 5, padding: "0 10px", border: "1px solid #cbd5e1", borderRadius: 9, fontSize: 13 }}
                      />
                    </label>
                    <label style={{ display: "block", marginBottom: 14, fontSize: 12, fontWeight: 600, color: "#334155" }}>
                      Mobile number
                      <input
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        required
                        maxLength={24}
                        placeholder="03xx xxxxxxx or +923xx xxxxxxx"
                        style={{ display: "block", boxSizing: "border-box", width: "100%", height: 40, marginTop: 5, padding: "0 10px", border: "1px solid #cbd5e1", borderRadius: 9, fontSize: 13 }}
                      />
                    </label>
                    <button type="submit" disabled={busy} style={{ width: "100%", height: 42, border: 0, borderRadius: 10, background: "#173f2b", color: "#fff", fontSize: 13, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer" }}>
                      {busy ? "Sending code…" : "Send SMS code"}
                    </button>
                    {smsUnavailable && <div style={{ marginTop: 12, textAlign: "center" }}>
                      <p style={{ margin: "0 0 8px", color: "#9a3412", fontSize: 12 }}>SMS delivery is unavailable. You can continue with email verification.</p>
                      <button type="button" onClick={() => { setSignupMethod("email"); setSmsUnavailable(false); setError(""); }} style={{ border: 0, background: "transparent", color: "#15803d", fontSize: 12, fontWeight: 700, textDecoration: "underline", cursor: "pointer" }}>
                        Continue with Email OTP
                      </button>
                    </div>}
                  </form>
                ) : <form onSubmit={handleEmailSubmit}>
                  {mode === "signup" && (
                    <div style={{ marginBottom: "14px" }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#334155",
                          marginBottom: "6px",
                        }}
                      >
                        Full Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Mumtaz Ali"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required={mode === "signup"}
                        style={{
                          width: "100%",
                          padding: "11px 14px",
                          borderRadius: "12px",
                          border: "1px solid #cbd5e1",
                          fontSize: "14px",
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                  )}

                  <div style={{ marginBottom: "14px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#334155",
                        marginBottom: "6px",
                      }}
                    >
                      Email Address
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. yourname@gmail.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setAccountAlreadyExists(false);
                      }}
                      required
                      style={{
                        width: "100%",
                        padding: "11px 14px",
                        borderRadius: "12px",
                        border: "1px solid #cbd5e1",
                        fontSize: "14px",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  {/* Account Already Exists Banner */}
                  {accountAlreadyExists && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{
                        margin: "12px 0 16px 0",
                        padding: "12px 14px",
                        borderRadius: "12px",
                        background: "#fef3c7",
                        border: "1px solid #fde68a",
                        color: "#92400e",
                        fontSize: "13px",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          marginBottom: "4px",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <span>⚠️</span> Account already exists
                      </div>
                      <p
                        style={{
                          margin: "0 0 10px 0",
                          fontSize: "12px",
                          color: "#78350f",
                        }}
                      >
                        An account with <strong>{email}</strong> already exists. Click
                        below to sign in or reset via OTP code.
                      </p>
                      <button
                        type="button"
                        onClick={handleSwitchToLoginAndSendOtp}
                        disabled={busy}
                        style={{
                          width: "100%",
                          padding: "10px 14px",
                          background: "#173f2b",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "10px",
                          fontSize: "13px",
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                          boxShadow: "0 2px 8px rgba(23, 63, 43, 0.2)",
                        }}
                      >
                        <span>Existing (Sign In) · Send OTP</span>
                        <span>→</span>
                      </button>
                    </motion.div>
                  )}

                  {mode === "login" && !accountAlreadyExists && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        marginBottom: "14px",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (!email.trim() || !email.includes("@")) {
                            setError(
                              "Enter your email address above to receive an OTP code."
                            );
                            return;
                          }
                          sendEmailOtp(email.trim(), "", "", "email", "login");
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#16a34a",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        Forgot Password / Sign In via OTP?
                      </button>
                    </div>
                  )}

                  {!accountAlreadyExists && (
                    <motion.button
                      type="submit"
                      disabled={busy}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      style={{
                        width: "100%",
                        padding: "13px 20px",
                        background:
                          "linear-gradient(135deg, #173f2b 0%, #1f563b 100%)",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "14px",
                        fontSize: "14px",
                        fontWeight: 700,
                        cursor: busy ? "not-allowed" : "pointer",
                        boxShadow: "0 4px 14px rgba(23, 63, 43, 0.3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                      }}
                    >
                      <span>
                        {busy
                          ? "Sending Code…"
                          : mode === "signup"
                          ? "Send Sign-up Code"
                          : "Send Sign-in Code"}
                      </span>
                      <span>→</span>
                    </motion.button>
                  )}
                </form>}
              </div>
            )}

            {/* Step 2: Enter 6-digit OTP */}
            {step === "otp" && (
              mode === "signup" && signupMethod === "mobile" ? (
                <form onSubmit={(event) => { event.preventDefault(); void handleVerifyPhoneOtp(); }}>
                  <p style={{ margin: "0 0 12px", color: "#475569", fontSize: 13 }}>
                    Enter the SMS code sent to <strong>{phone}</strong>.
                  </p>
                  <label style={{ display: "block", marginBottom: 10, fontSize: 12, fontWeight: 600 }}>
                    6-digit SMS code
                    <input
                      ref={otpInputRef}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={otpCode}
                      onChange={(event) => handlePhoneCodeChange(event.target.value)}
                      maxLength={6}
                      pattern="[0-9]{6}"
                      required
                      style={{ display: "block", boxSizing: "border-box", width: "100%", height: 42, marginTop: 5, padding: "0 10px", border: "1px solid #cbd5e1", borderRadius: 9, fontSize: 18, letterSpacing: 5, textAlign: "center" }}
                    />
                  </label>
                  <button type="submit" disabled={busy || otpCode.length !== 6} style={{ width: "100%", height: 42, border: 0, borderRadius: 10, background: "#173f2b", color: "#fff", fontSize: 13, fontWeight: 700, cursor: busy || otpCode.length !== 6 ? "not-allowed" : "pointer" }}>
                    {busy ? "Verifying…" : "Verify"}
                  </button>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12 }}>
                    <button type="button" onClick={() => { setStep("method"); setOtpCode(""); setPhoneVerificationId(""); setError(""); }} style={{ border: 0, background: "none", color: "#15803d", cursor: "pointer" }}>
                      Change number
                    </button>
                    <button type="button" disabled={busy || resendCountdown > 0} onClick={() => void sendPhoneOtp()} style={{ border: 0, background: "none", color: resendCountdown > 0 ? "#94a3b8" : "#15803d", cursor: busy || resendCountdown > 0 ? "not-allowed" : "pointer" }}>
                      {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : "Resend code"}
                    </button>
                  </div>
                </form>
              ) : <form onSubmit={handleVerifyOtp}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "14px",
                    padding: "12px 14px",
                    marginBottom: "16px",
                  }}
                >
                  {avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt=""
                      width={38}
                      height={38}
                      unoptimized
                      style={{ borderRadius: "50%", objectFit: "cover" }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "38px",
                        height: "38px",
                        borderRadius: "50%",
                        background: "#173f2b",
                        color: "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: "14px",
                      }}
                    >
                      {name.charAt(0).toUpperCase() || "H"}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "#166534",
                        textTransform: "uppercase",
                      }}
                    >
                      OTP Sent To
                    </div>
                    <strong
                      style={{
                        display: "block",
                        fontSize: "13px",
                        color: "#14532d",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {email}
                    </strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("method");
                      setError("");
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#16a34a",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: "4px 8px",
                    }}
                  >
                    Change
                  </button>
                </div>

                {/* 10-Minute Expiration Countdown Badge */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    background: otpExpiresInSeconds > 60 ? "#f8fafc" : "#fef2f2",
                    border: `1px solid ${
                      otpExpiresInSeconds > 60 ? "#e2e8f0" : "#fecaca"
                    }`,
                    borderRadius: "10px",
                    marginBottom: "16px",
                    fontSize: "12px",
                    color: otpExpiresInSeconds > 60 ? "#475569" : "#991b1b",
                  }}
                >
                  <span>⏱ Code validity:</span>
                  <strong>
                    {otpExpiresInSeconds > 0
                      ? `${String(Math.floor(otpExpiresInSeconds / 60)).padStart(
                          2,
                          "0"
                        )}:${String(otpExpiresInSeconds % 60).padStart(
                          2,
                          "0"
                        )} remaining`
                      : "Expired"}
                  </strong>
                </div>

                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#1e293b",
                      marginBottom: "8px",
                      letterSpacing: "0.5px",
                      textTransform: "uppercase",
                    }}
                  >
                    Enter 6-Digit Verification Code
                  </label>
                  <input
                    ref={otpInputRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) =>
                      setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="••••••"
                    required
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      borderRadius: "14px",
                      border: "2px solid #86efac",
                      background: "#fdfefe",
                      fontSize: "28px",
                      fontWeight: 800,
                      letterSpacing: "14px",
                      textAlign: "center",
                      color: "#173f2b",
                      outline: "none",
                      boxSizing: "border-box",
                      fontFamily: "monospace",
                    }}
                  />
                </div>

                {/* Dev Mode Passkey Badge */}
                {devCode && (
                  <div
                    style={{
                      background: "#eff6ff",
                      border: "1px dashed #93c5fd",
                      borderRadius: "12px",
                      padding: "10px 14px",
                      marginBottom: "16px",
                      fontSize: "12px",
                      color: "#1e40af",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "4px",
                      }}
                    >
                      <span>
                        ⚡ Dev Mode Passkey: <strong>{devCode}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setOtpCode(devCode)}
                        style={{
                          background: "#2563eb",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "6px",
                          padding: "4px 10px",
                          fontSize: "11px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Fill Code
                      </button>
                    </div>
                  </div>
                )}

                <motion.button
                  type="submit"
                  disabled={busy || otpCode.length !== 6 || otpExpiresInSeconds <= 0}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  style={{
                    width: "100%",
                    padding: "14px 20px",
                    background:
                      "linear-gradient(135deg, #173f2b 0%, #1f563b 100%)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "14px",
                    fontSize: "14px",
                    fontWeight: 700,
                    cursor:
                      busy || otpCode.length !== 6 || otpExpiresInSeconds <= 0
                        ? "not-allowed"
                        : "pointer",
                    boxShadow: "0 4px 14px rgba(23, 63, 43, 0.3)",
                    opacity:
                      otpCode.length === 6 && otpExpiresInSeconds > 0 ? 1 : 0.6,
                    marginBottom: "14px",
                  }}
                >
                  {busy ? "Verifying Code…" : "Verify & Activate Account →"}
                </motion.button>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "12px",
                    color: "#64748b",
                  }}
                >
                  <span>Didn&apos;t receive code?</span>
                  {resendCountdown > 0 ? (
                    <span style={{ color: "#94a3b8" }}>
                      Resend in {resendCountdown}s
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        sendEmailOtp(email, name, avatarUrl, authProvider)
                      }
                      disabled={busy}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#16a34a",
                        fontWeight: 600,
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      Resend Code
                    </button>
                  )}
                </div>
              </form>
            )}

            {/* Step 3: Success State */}
            {step === "success" && (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <div
                  style={{
                    width: "64px",
                    height: "64px",
                    borderRadius: "50%",
                    background: "#dcfce7",
                    color: "#16a34a",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "32px",
                    marginBottom: "14px",
                  }}
                >
                  ✓
                </div>
                <h3
                  style={{
                    margin: "0 0 6px 0",
                    fontSize: "18px",
                    color: "#166534",
                  }}
                >
                  Verification Complete!
                </h3>
                <p style={{ margin: 0, fontSize: "13px", color: "#475569" }}>
                  Your customer account is verified. Syncing your profile details…
                </p>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#991b1b",
                  fontSize: "12px",
                  lineHeight: 1.5,
                }}
              >
                ⚠️ {error}
              </div>
            )}

            {/* Notice Message */}
            {message && !error && step === "method" && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  color: "#166534",
                  fontSize: "12px",
                  lineHeight: 1.5,
                }}
              >
                ℹ {message}
              </div>
            )}

            {/* Bottom Security Guarantee */}
            <div
              style={{
                marginTop: "18px",
                paddingTop: "14px",
                borderTop: "1px solid #f1f5f9",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                fontSize: "11px",
                color: "#94a3b8",
              }}
            >
              <span>🔒 256-Bit SSL Encrypted Verification</span>
              <span>·</span>
              <span>Home Made Food</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

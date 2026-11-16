"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { acquireScrollLock } from "@/lib/scroll-lock";

type AuthMode = "signup" | "login" | "recovery";

export function PhoneAuthModal({ open, onClose, onVerified }: { open: boolean; onClose: () => void; onVerified: (phone: string, name: string) => void }) {
  const [mode, setMode] = useState<AuthMode>("signup");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const releaseScrollLock = acquireScrollLock();
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      cancelAnimationFrame(frame);
      releaseScrollLock();
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, onClose]);

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/send-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", phone }) });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error || "We could not send a code.");
      setStep("code");
      setMessage(result.message || "A code was sent to your mobile number.");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "We could not send a code.");
    } finally { setBusy(false); }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/send-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", phone, code }) });
      const result = await response.json() as { error?: string; phone?: string };
      if (!response.ok || !result.phone) throw new Error(result.error || "We could not verify that code.");
      onVerified(result.phone, mode === "signup" ? name.trim() : "");
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "We could not verify that code.");
    } finally { setBusy(false); }
  }

  function selectMode(next: AuthMode) {
    setMode(next);
    setStep("phone");
    setError("");
    setMessage("");
  }

  if (!open || typeof document === "undefined") return null;
  const title = mode === "signup" ? "Create your account" : mode === "login" ? "Welcome back" : "Recover account access";
  return createPortal(
    <AnimatePresence>
      <motion.div className="phone-auth-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <motion.section className="phone-auth-modal" role="dialog" aria-modal="true" aria-labelledby="phone-auth-title" initial={{ opacity: 0, y: 22, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 15, scale: .98 }} transition={{ type: "spring", stiffness: 280, damping: 28 }}>
          <button type="button" className="phone-auth-close" aria-label="Close sign in" onClick={onClose}>×</button>
          <div className="phone-auth-brand-mark" aria-hidden="true">✦</div>
          <p className="phone-auth-kicker">PHONE VERIFIED ACCESS</p>
          <h2 id="phone-auth-title">{title}</h2>
          <p className="phone-auth-intro">We verify that you control your mobile number using an SMS code. No WhatsApp message is used.</p>
          <div className="phone-auth-tabs" role="tablist" aria-label="Account access">
            {([ ["signup", "Sign up"], ["login", "Log in"], ["recovery", "Recover access"] ] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={mode === value} className={mode === value ? "active" : ""} onClick={() => selectMode(value)}>{label}</button>)}
          </div>
          <div className="phone-auth-step"><span className={step === "phone" ? "active" : "done"}>1&nbsp; Mobile number</span><i aria-hidden="true" /><span className={step === "code" ? "active" : ""}>2&nbsp; SMS code</span></div>
          {step === "phone" ? <form className="phone-auth-form" onSubmit={sendCode}>
            {mode === "signup" && <label className="field">Full name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required maxLength={80} placeholder="Your name" /></label>}
            <label className="field">Mobile number<input ref={inputRef} type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" inputMode="tel" required maxLength={24} placeholder="03xx xxxxxxx or +92…" /></label>
            {mode === "recovery" && <p className="phone-auth-note">This store uses passwordless SMS sign-in. There is no password to reset; verifying your number restores access to the profile saved on this device.</p>}
            <button className="phone-auth-primary" type="submit" disabled={busy}>{busy ? "Sending code…" : "Send SMS code"}<span aria-hidden="true">→</span></button>
          </form> : <form className="phone-auth-form" onSubmit={verifyCode}>
            <div className="phone-auth-destination">Code sent to <strong>{phone}</strong><button type="button" onClick={() => { setStep("phone"); setError(""); }}>Change</button></div>
            <label className="field">6-digit verification code<input ref={inputRef} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" minLength={6} maxLength={6} required placeholder="••••••" /></label>
            <button className="phone-auth-primary" type="submit" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify and continue"}<span aria-hidden="true">→</span></button>
            <button className="phone-auth-resend" type="button" onClick={() => { setStep("phone"); setCode(""); }}>Request another code</button>
          </form>}
          {message && <p className="phone-auth-message" role="status">{message}</p>}
          {error && <p className="phone-auth-error" role="alert">{error}</p>}
          <p className="phone-auth-privacy">Your number is used for verification. SMS sending requires the server-side provider settings.</p>
        </motion.section>
      </motion.div>
    </AnimatePresence>, document.body
  );
}

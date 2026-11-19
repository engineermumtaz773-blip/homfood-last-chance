"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLiveDishes } from "@/hooks/use-live-dishes";
import { useSiteSettings, type Locale } from "@/components/site-settings";
import { CUSTOMER_AUTH_EVENT, readCustomerProfile, type CustomerProfile } from "@/lib/customer";
import { getSupabaseAuthClient } from "@/lib/supabase-auth-client";

type ChatMessage = { id: number; role: "assistant" | "user"; text: string; pending?: boolean };
type AssistantCopy = { title: string; subtitle: string; welcome: string; placeholder: string; send: string; today: string; track: string; delivery: string; unavailable: string };
type GreetingPeriod = "morning" | "afternoon" | "evening" | "night";

const copy: Record<Locale, AssistantCopy> = {
  en: { title: "Kitchen assistant", subtitle: "Gemini AI · instant menu help", welcome: "Ask me about the menu, delivery, your order, or anything else.", placeholder: "Ask a question…", send: "Send message", today: "Today’s Specials", track: "Track Order", delivery: "Delivery Time", unavailable: "The AI assistant could not connect. Please try again shortly." },
  ur: { title: "باورچی خانے کا معاون", subtitle: "جیمینائی اے آئی · مینو کی فوری معلومات", welcome: "مینو، ترسیل، آرڈر یا کسی بھی سوال کے بارے میں پوچھیں۔", placeholder: "اپنا سوال لکھیں…", send: "پیغام بھیجیں", today: "آج کی ڈیلز", track: "آرڈر ٹریک کریں", delivery: "ترسیل کا وقت", unavailable: "اے آئی معاون سے رابطہ نہیں ہو سکا۔ کچھ دیر بعد دوبارہ کوشش کریں۔" },
  sd: { title: "باورچي خاني جو مددگار", subtitle: "جيمِنائي AI · مينيو جي فوري ڄاڻ", welcome: "مينيو، پهچائڻ، آرڊر يا ڪنهن به سوال بابت پڇو.", placeholder: "پنهنجو سوال لکو…", send: "پيغام موڪليو", today: "اڄ جون آڇون", track: "آرڊر ٽريڪ ڪريو", delivery: "پهچائڻ جو وقت", unavailable: "اي آءِ مددگار سان رابطو نه ٿي سگهيو. ٿوري دير کان پوءِ ٻيهر ڪوشش ڪريو." },
  "ur-Latn": { title: "Kitchen Assistant", subtitle: "Gemini AI · menu ki foran maloomat", welcome: "Menu, delivery, order, ya kisi bhi sawal ke baare mein poochein.", placeholder: "Apna sawal likhein…", send: "Paigham bhejein", today: "Aaj Ki Deals", track: "Order Track Karein", delivery: "Delivery Time", unavailable: "AI assistant se rabta nahin ho saka. Thori dair baad dobara koshish karein." },
};
const greetingCopy: Record<Locale, Record<GreetingPeriod, string>> = {
  en: { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening", night: "Good night" },
  ur: { morning: "صبح بخیر", afternoon: "دوپہر بخیر", evening: "شام بخیر", night: "شب بخیر" },
  sd: { morning: "صبح جو سلام", afternoon: "منجهند جو سلام", evening: "شام جو سلام", night: "رات جو سلام" },
  "ur-Latn": { morning: "Subah bakhair", afternoon: "Dopehar bakhair", evening: "Shaam bakhair", night: "Shab bakhair" },
};
const WA_CHAT_URL = `https://wa.me/923040537000?text=${encodeURIComponent("Hi Home Made Food, I have an inquiry.")}`;

const waitBeforeRetry = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function fetchChatWithRetry(payload: { locale: Locale; messages: { role: string; text: string }[] }, signal: AbortSignal) {
  let lastError: unknown;
  const endpoints = ["/api/chatbot", "/api/chat", "/api/gemini"];
  for (const endpoint of endpoints) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (signal.aborted) throw new DOMException("Chat was reset.", "AbortError");
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.any([signal, AbortSignal.timeout(18_000)]),
        });
      } catch (error) {
        if (signal.aborted) throw error;
        lastError = error;
        if (attempt === 0) { await waitBeforeRetry(350); continue; }
        break;
      }
      if (response.ok) return response;
      const retryable = response.status === 429 || response.status === 502 || response.status === 503 || response.status >= 500;
      if (attempt === 0 && retryable) { await waitBeforeRetry(350); continue; }
      break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Chat endpoint unavailable.");
}

function localAssistantFallback() {
  return "I can’t reach the live assistant right now. Open the menu for current dishes and prices, or use order tracking to check an order.";
}

function WhatsAppIcon() {
  return <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><path fill="currentColor" d="M16.02 3.2A12.67 12.67 0 0 0 5.1 22.3L3.4 28.5l6.36-1.67A12.67 12.67 0 1 0 16.02 3.2Zm0 22.99c-1.99 0-3.94-.54-5.64-1.56l-.4-.24-3.78.99 1.01-3.68-.26-.42a10.35 10.35 0 1 1 9.07 4.91Zm5.68-7.75c-.31-.16-1.84-.91-2.12-1.02-.29-.1-.5-.16-.7.16-.21.31-.81 1.02-.99 1.23-.18.21-.36.24-.67.08-.31-.16-1.3-.48-2.48-1.53-.91-.81-1.53-1.8-1.71-2.11-.18-.31-.02-.48.14-.64.14-.14.31-.36.46-.54.16-.18.21-.31.31-.52.1-.21.05-.39-.03-.55-.08-.16-.7-1.69-.96-2.31-.25-.6-.51-.52-.7-.53h-.6c-.21 0-.55.08-.83.39-.29.31-1.1 1.07-1.1 2.6s1.13 3.01 1.29 3.22c.16.21 2.22 3.39 5.38 4.75.75.32 1.34.51 1.8.65.76.24 1.45.2 1.99.12.61-.09 1.84-.75 2.1-1.48.26-.72.26-1.35.18-1.48-.08-.13-.29-.21-.6-.36Z"/></svg>;
}

function AssistantIcon() {
  return <svg viewBox="0 0 48 48" width="30" height="30" fill="none" aria-hidden="true"><path d="M24 5 27.7 17.3 40 21l-12.3 3.7L24 37l-3.7-12.3L8 21l12.3-3.7L24 5Z" fill="currentColor"/><path d="m39 31 1.7 5.3L46 38l-5.3 1.7L39 45l-1.7-5.3L32 38l5.3-1.7L39 31Z" fill="currentColor"/><circle cx="12" cy="10" r="2" fill="currentColor"/></svg>;
}

export function FloatingAssistants() {
  const { locale } = useSiteSettings();
  const text = copy[locale] ?? copy.en;
  const reducedMotion = useReducedMotion();
  const catalog = useLiveDishes([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [greetingPeriod, setGreetingPeriod] = useState<GreetingPeriod | null>(null);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState("");
  const nextId = useRef(1);
  const conversationVersion = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  function startNewChat() {
    conversationVersion.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = null;
    nextId.current = 1;
    setMessages([]);
    setDraft("");
    setIsThinking(false);
  }

  useEffect(() => {
    const updateGreeting = () => {
      const hour = Number(new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Karachi",
        hour: "numeric",
        hourCycle: "h23",
      }).format(new Date()));
      setGreetingPeriod(hour < 5 || hour >= 21 ? "night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening");
    };
    const greetingStartTimer = window.setTimeout(updateGreeting, 0);
    const greetingTimer = window.setInterval(updateGreeting, 60_000);
    const initialProfile = readCustomerProfile();
    const profileStartTimer = initialProfile
      ? window.setTimeout(() => setCustomer(initialProfile), 0)
      : undefined;

    const authHandler = (event: Event) => {
      const updatedProfile = (event as CustomEvent<CustomerProfile | null>).detail;
      setCustomer(updatedProfile || null);
      if (!updatedProfile) startNewChat();
    };
    window.addEventListener(CUSTOMER_AUTH_EVENT, authHandler);

    let active = true;
    void fetch("/api/auth/email-otp", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ authenticated?: boolean; customer?: CustomerProfile }> : null)
      .then((data) => {
        if (active && data?.authenticated && data.customer) setCustomer(data.customer);
      })
      .catch(() => undefined);

    const supabase = getSupabaseAuthClient();
    const subscription = supabase?.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) return;
      const metadata = session.user.user_metadata || {};
      const name = [metadata.full_name, metadata.name]
        .find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim()
        || session.user.email?.split("@")[0]
        || "";
      setCustomer((previous) => ({
        ...(previous || { name: "", phone: "", addresses: [], preferredPayment: "Digital Payment (Raast)" }),
        name,
        email: session.user.email || previous?.email,
        avatarUrl: (typeof metadata.avatar_url === "string" && metadata.avatar_url)
          || (typeof metadata.picture === "string" && metadata.picture)
          || previous?.avatarUrl,
      }));
    }).data.subscription;

    return () => {
      active = false;
      window.clearTimeout(greetingStartTimer);
      window.clearInterval(greetingTimer);
      if (profileStartTimer) window.clearTimeout(profileStartTimer);
      window.removeEventListener(CUSTOMER_AUTH_EVENT, authHandler);
      subscription?.unsubscribe();
      activeRequest.current?.abort();
    };
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: reducedMotion || isThinking ? "auto" : "smooth" }); }, [messages, open, reducedMotion, isThinking]);
  const userName = customer?.name.trim() || customer?.email?.split("@")[0] || "";
  const userInitial = userName.trim().charAt(0).toUpperCase();
  const welcome = useMemo(() => {
    const greeting = greetingPeriod
      ? greetingCopy[locale]?.[greetingPeriod] || greetingCopy.en[greetingPeriod]
      : "Hello";
    return `${greeting}${userName ? `, ${userName}` : ""}! ${text.welcome}`;
  }, [greetingPeriod, locale, text.welcome, userName]);
  const visibleMessages = useMemo<ChatMessage[]>(() => [{ id: 0, role: "assistant", text: welcome }, ...messages], [messages, welcome]);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || isThinking) return;
    const version = conversationVersion.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    const userId = nextId.current++;
    const assistantId = nextId.current++;
    const conversation = [...messages, { id: userId, role: "user" as const, text: trimmed }];
    setMessages([...conversation, { id: assistantId, role: "assistant", text: "", pending: true }]);
    setDraft("");
    setIsThinking(true);
    let answer = "";
    let renderFrame: number | null = null;
    try {
      const response = await fetchChatWithRetry({ locale, messages: conversation.slice(-8).map(({ role, text }) => ({ role, text })) }, controller.signal);
      if (!response.body) throw new Error("AI response stream is missing.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        if (renderFrame === null) renderFrame = window.requestAnimationFrame(() => {
          renderFrame = null;
          if (conversationVersion.current === version) {
            setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, text: answer } : message));
          }
        });
      }
      answer += decoder.decode();
      if (!answer.trim()) throw new Error("AI response was empty.");
      if (renderFrame !== null) window.cancelAnimationFrame(renderFrame);
      if (conversationVersion.current === version) {
        setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, text: answer, pending: false } : message));
      }
    } catch {
      if (renderFrame !== null) window.cancelAnimationFrame(renderFrame);
      if (conversationVersion.current === version && !controller.signal.aborted) {
        setMessages((current) => current.map((message) => message.id === assistantId
          ? { ...message, text: localAssistantFallback(), pending: false }
          : message));
      }
    } finally {
      if (conversationVersion.current === version) {
        activeRequest.current = null;
        setIsThinking(false);
      }
    }
  }

  return <>
    <motion.a className="floating-whatsapp" href={WA_CHAT_URL} target="_blank" rel="noreferrer" aria-label="Chat on WhatsApp" title="Chat on WhatsApp" whileHover={reducedMotion ? undefined : { scale: 1.09, rotate: 4 }} whileTap={reducedMotion ? undefined : { scale: .94 }}>
      <span className="floating-whatsapp-pulse" aria-hidden="true" /><WhatsAppIcon /><span className="floating-whatsapp-tooltip">Chat on WhatsApp</span>
    </motion.a>

    <AnimatePresence>
      {open && <motion.section className="knowledge-chat-window" role="dialog" aria-modal="false" aria-labelledby="knowledge-chat-title" initial={reducedMotion ? false : { opacity: 0, y: 20, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reducedMotion ? undefined : { opacity: 0, y: 16, scale: .97 }} transition={{ type: "spring", stiffness: 360, damping: 30 }}>
        <header className="knowledge-chat-header">
          <span className="knowledge-chat-avatar">
            {customer?.avatarUrl && failedAvatarUrl !== customer.avatarUrl
              ? <Image src={customer.avatarUrl} alt={userName ? `${userName}'s profile` : "Customer profile"} width={42} height={42} unoptimized onError={() => setFailedAvatarUrl(customer.avatarUrl || "")} />
              : userName ? <span aria-hidden="true">{userInitial}</span> : <AssistantIcon />}
          </span>
          <span className="knowledge-chat-heading">
            <strong id="knowledge-chat-title">{text.title}{userName ? ` · ${userName}` : ""}</strong>
            <small><i />{text.subtitle}</small>
            {customer?.email && <small className="knowledge-chat-email">{customer.email}</small>}
          </span>
          <button type="button" className="knowledge-chat-new" onClick={startNewChat}>New Chat</button>
          <button type="button" className="knowledge-chat-close" onClick={() => setOpen(false)} aria-label="Close assistant">×</button>
        </header>
        <div className="knowledge-chat-messages" role="log" aria-live="polite" aria-relevant="additions">
          {visibleMessages.map((message) => <motion.div key={message.id} className={`knowledge-chat-message ${message.role}`} initial={reducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .2 }}><span>{message.pending && !message.text ? <i className="assistant-typing-indicator" aria-label="Assistant is typing"><i /><i /><i /></i> : message.text}</span></motion.div>)}
          <div ref={endRef} />
        </div>
        <div className="knowledge-chat-suggestions" aria-label="Suggested questions"><button type="button" onClick={() => ask(text.today)}>{text.today}</button><button type="button" onClick={() => ask("Track order")}>{text.track}</button><button type="button" onClick={() => ask("Delivery time")}>{text.delivery}</button></div>
        <form className="knowledge-chat-form" onSubmit={(event) => { event.preventDefault(); void ask(draft); }}><label className="sr-only" htmlFor="knowledge-question">{text.placeholder}</label><input id="knowledge-question" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={text.placeholder} disabled={isThinking} /><button type="submit" disabled={!draft.trim() || isThinking} aria-label={text.send}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13" /></svg></button></form>
        <footer className="knowledge-chat-footer">{catalog.connected ? "Menu knowledge refreshes from the kitchen." : "Live menu connection unavailable. Refresh to retry."} <Link href="/track-order">Track order</Link></footer>
      </motion.section>}
    </AnimatePresence>

    <motion.button className={`floating-assistant-trigger ${open ? "is-open" : ""}`} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="knowledge-chat-title" aria-label={open ? "Close kitchen assistant" : "Open kitchen assistant"} title={text.title} whileHover={reducedMotion ? undefined : { scale: 1.08, rotate: -3 }} whileTap={reducedMotion ? undefined : { scale: .94 }}>
      {open ? <span className="assistant-close-icon" aria-hidden="true">×</span> : <AssistantIcon />}
      {!open && <span className="assistant-trigger-label">{text.title}</span>}
    </motion.button>
  </>;
}

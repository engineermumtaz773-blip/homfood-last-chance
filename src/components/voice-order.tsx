"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Dish } from "@/lib/data";
import { useCart } from "@/components/cart-provider";
import { createSpeechRecognition } from "@/lib/web-speech";
import { detectVoiceLanguage, isVoiceCheckoutIntent, isVoiceOrderIntent, setRecognitionLanguage, voiceOrderIntent } from "@/lib/voice";
import { matchesDishSearch } from "@/lib/menu-search";
import { useSiteSettings } from "@/components/site-settings";

export function VoiceOrder({ dishes, onSearch }: { dishes: Dish[]; onSearch?: (query: string) => void }) {
  const { addItem, items } = useCart();
  const { locale, t } = useSiteSettings();
  const router = useRouter();
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState("");
  const [added, setAdded] = useState(false);

  function startVoiceOrder() {
    const recognition = createSpeechRecognition();
    if (!recognition) {
      setMessage(t("voiceUnsupported"));
      return;
    }
    setRecognitionLanguage(recognition, locale);
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() || "";
      const language = detectVoiceLanguage(transcript);
      if (isVoiceCheckoutIntent(transcript)) {
        if (items.length) router.push("/checkout");
        else setMessage(t("voiceOrderEmpty"));
        return;
      }
      if (!isVoiceOrderIntent(transcript, language)) {
        if (transcript && onSearch) {
          onSearch(transcript);
          setMessage(`${t("searchingFor")} “${transcript}”.`);
        } else {
          setMessage(`${t("voiceOrderPrompt")} Heard “${transcript}”.`);
        }
        return;
      }
      const { query, quantity } = voiceOrderIntent(transcript);
      if (!query) {
        setMessage(t("voiceOrderPrompt"));
        return;
      }
      const candidate = dishes.find((dish) => matchesDishSearch(dish, query));
      if (!candidate || !candidate.portions[0]) {
        setMessage(`${t("voiceOrderNoMatch")} “${query}”.`);
        return;
      }
      const localized = locale === "en" ? candidate : candidate.translations?.[locale] || candidate;
      addItem({
        id: candidate.id,
        name: localized.name,
        portion: candidate.portions[0].name,
        price: candidate.portions[0].price,
        quantity,
      });
      setAdded(true);
      setMessage(`${t("voiceOrderAdded")} ${quantity} × ${localized.name}.`);
    };
    recognition.onerror = (event) => {
      setMessage(event.error === "not-allowed" ? t("microphonePermission") : t("voiceFailed"));
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    try {
      recognition.start();
      setListening(true);
      setAdded(false);
      setMessage(t("voiceOrderPrompt"));
    } catch (error) {
      console.error("Could not start voice ordering.", error);
      setMessage(t("voiceFailed"));
    }
  }

  return (
    <section className="voice-order-card" aria-label={t("voiceOrder")}>
      <div>
        <strong>{t("voiceOrderTitle")}</strong>
        <p>{t("voiceOrderDescription")}</p>
        {message && <small className="voice-status" role="status">{message}</small>}
      </div>
      <button type="button" className="checkout-raast-select" onClick={startVoiceOrder} disabled={listening} aria-pressed={listening}>
        {listening ? t("voiceListening") : `🎙 ${t("voiceOrder")}`}
      </button>
      {added && items.length > 0 && <button type="button" className="checkout-raast-select" onClick={() => router.push("/checkout")}>{t("goToCheckout")}</button>}
    </section>
  );
}

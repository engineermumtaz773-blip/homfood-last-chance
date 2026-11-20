"use client";

import { useState } from "react";
import type { Dish } from "@/lib/data";
import { useCart } from "@/components/cart-provider";
import { createSpeechRecognition } from "@/lib/web-speech";
import { detectVoiceLanguage, isVoiceOrderIntent, setRecognitionLanguage, voiceOrderIntent } from "@/lib/voice";
import { matchesDishSearch } from "@/lib/menu-search";
import { useSiteSettings } from "@/components/site-settings";

export function VoiceOrder({ dishes }: { dishes: Dish[] }) {
  const { addItem } = useCart();
  const { locale } = useSiteSettings();
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState("");

  function startVoiceOrder() {
    const recognition = createSpeechRecognition();
    if (!recognition) {
      setMessage("Voice ordering is not supported in this browser.");
      return;
    }
    setRecognitionLanguage(recognition, locale);
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() || "";
      const language = detectVoiceLanguage(transcript);
      if (!isVoiceOrderIntent(transcript, language)) {
        setMessage(`Heard “${transcript}”. Start with an add/order command to confirm an item.`);
        return;
      }
      const { query, quantity } = voiceOrderIntent(transcript);
      if (!query) {
        setMessage("Please say a dish name after your add/order command.");
        return;
      }
      const candidate = dishes.find((dish) => matchesDishSearch(dish, query));
      if (!candidate || !candidate.portions[0]) {
        setMessage(query ? `I couldn’t find “${query}” on the menu. Please try again.` : "Please say the dish name after your add/order command.");
        return;
      }
      const localizedName = candidate.translations?.[locale === "en" ? "ur" : locale]?.name || candidate.name;
      addItem({
        id: candidate.id,
        name: candidate.name,
        portion: candidate.portions[0].name,
        price: candidate.portions[0].price,
        quantity,
      });
      setMessage(`Added ${quantity} × ${localizedName} to your cart.`);
    };
    recognition.onerror = (event) => {
      setMessage(event.error === "not-allowed" ? "Allow microphone access to use voice ordering." : "Voice ordering could not hear that. Please try again.");
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    try {
      recognition.start();
      setListening(true);
      setMessage("Say “add” or its Urdu/Sindhi equivalent, then the dish name.");
    } catch (error) {
      console.error("Could not start voice ordering.", error);
      setMessage("Voice ordering could not start. Please try again.");
    }
  }

  return (
    <section className="voice-order-card" aria-label="Voice ordering">
      <div>
        <strong>Hands-free ordering</strong>
        <p>Search or add a menu item by voice in English, Urdu, or Sindhi.</p>
        {message && <small className="voice-status" role="status">{message}</small>}
      </div>
      <button type="button" className="checkout-raast-select" onClick={startVoiceOrder} disabled={listening} aria-pressed={listening}>
        {listening ? "Listening…" : "🎙 Order by voice"}
      </button>
    </section>
  );
}

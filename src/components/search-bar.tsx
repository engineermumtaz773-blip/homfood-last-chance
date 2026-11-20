"use client";

import { useState } from "react";
import { createSpeechRecognition } from "@/lib/web-speech";
import { setRecognitionLanguage } from "@/lib/voice";
import { useSiteSettings } from "@/components/site-settings";

export function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { locale, t } = useSiteSettings();
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState("");

  function startVoiceSearch() {
    const recognition = createSpeechRecognition();
    if (!recognition) {
      setMessage("Voice search is not supported in this browser.");
      return;
    }
    setRecognitionLanguage(recognition, locale);
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) {
        onChange(transcript);
        setMessage(`Searching for “${transcript}”.`);
      }
    };
    recognition.onerror = (event) => {
      setMessage(event.error === "not-allowed" ? "Allow microphone access to use voice search." : "Voice search could not hear that. Please try again.");
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    try {
      recognition.start();
      setListening(true);
      setMessage("Listening…");
    } catch (error) {
      console.error("Could not start voice menu search.", error);
      setMessage("Voice search could not start. Please try again.");
    }
  }

  return (
    <div className="menu-search-control">
      <label className="menu-search">
        <span aria-hidden="true">⌕</span>
        <input aria-label={t("searchMenu")} value={value} onChange={(event) => onChange(event.target.value)} placeholder={t("searchMenu")} />
      </label>
      <button type="button" className="checkout-raast-select" onClick={startVoiceSearch} disabled={listening} aria-pressed={listening}>
        {listening ? "Listening…" : "🎙 Voice search"}
      </button>
      {message && <small className="voice-status" role="status">{message}</small>}
    </div>
  );
}

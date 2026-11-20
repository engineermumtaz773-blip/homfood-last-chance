import type { Locale } from "@/components/site-settings";
import type { SpeechRecognitionLike } from "@/lib/web-speech";

export type VoiceLanguage = "EN" | "UR" | "SD";

export function detectVoiceLanguage(text: string): VoiceLanguage {
  if (/[ڀٽٺٿڄڃڏڊڍڦڳڪڱڻ]/u.test(text)) return "SD";
  if (/[\u0600-\u06ff]/u.test(text)) return "UR";
  return "EN";
}

export function speechLocale(locale: Locale): string {
  if (locale === "sd") return "sd-PK";
  if (locale === "ur") return "ur-PK";
  if (locale === "ur-Latn") return "ur-PK";
  return "en-PK";
}

export function setRecognitionLanguage(recognition: SpeechRecognitionLike, locale: Locale) {
  recognition.lang = speechLocale(locale);
  recognition.continuous = false;
  recognition.interimResults = false;
}

export function voiceOrderIntent(text: string): { query: string; quantity: number } {
  const quantityMatch = text.match(/\b(\d{1,2})\b/u);
  const spokenQuantity = text.match(/\b(one|two|three|four|five)\b/iu)?.[1]?.toLowerCase();
  const quantityNames: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  const quantity = Math.min(20, Math.max(1, quantityMatch ? Number(quantityMatch[1]) : quantityNames[spokenQuantity || ""] || 1));
  const cleaned = text
    .replace(/\b(add|order|get|buy|please|i want|one|two|three|four|five|to my cart)\b/giu, " ")
    .replace(/[\u0600-\u06ff]*(?:شامل|آرڊر|آرڈر|چاہیے|چاهيان ٿو|ڪيو|ڪر)[\u0600-\u06ff]*/gu, " ")
    .replace(/\b\d{1,2}\b/gu, " ")
    .replace(/[،,۔.!؟?]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return { query: cleaned, quantity };
}

export function isVoiceOrderIntent(text: string, language: VoiceLanguage): boolean {
  if (language === "EN") return /\b(add|order|get|buy|i want)\b/iu.test(text);
  return /شامل|آرڊر|آرڈر|چاہیے|چاهيان ٿو|آرڊر ڪريو/u.test(text);
}

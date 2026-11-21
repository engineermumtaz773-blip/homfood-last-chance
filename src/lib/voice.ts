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
  const quantityMatch = text.match(/[0-9٠-٩۰-۹]{1,2}/u);
  const spokenQuantity = text.match(/\b(one|two|three|four|five)\b/iu)?.[1]?.toLowerCase()
    || text.match(/ایک|دو|تین|چار|پانچ|هڪ|ٻه|ٽي|پنج/u)?.[0];
  const quantityNames: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    "ایک": 1, "دو": 2, "تین": 3, "چار": 4, "پانچ": 5,
    "هڪ": 1, "ٻه": 2, "ٽي": 3, "پنج": 5,
  };
  const digits = quantityMatch?.[0].replace(/[٠-٩۰-۹]/gu, (digit) => String("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹".indexOf(digit) % 10));
  const quantity = Math.min(20, Math.max(1, quantityMatch ? Number(digits) : quantityNames[spokenQuantity || ""] || 1));
  const cleaned = text
    .replace(/\b(add|order|get|buy|please|i want|one|two|three|four|five|to my cart|checkout|check out)\b/giu, " ")
    .replace(/(براہِ کرم|براہ کرم|میرے لیے|ایک|دو|تین|چار|پانچ|شامل کریں|شامل کرو|آرڈر کریں|آرڈر کرو|آرڈر|چاہیے|منگوائیں|هڪ|ٻه|ٽي|پنج|آرڊر ڪريو|آرڊر ڪر|شامل ڪريو|چاهيان ٿو|گهرائيو)/gu, " ")
    .replace(/[0-9٠-٩۰-۹]{1,2}/gu, " ")
    .replace(/[،,۔.!؟?]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return { query: cleaned, quantity };
}

export function isVoiceOrderIntent(text: string, language: VoiceLanguage): boolean {
  if (language === "EN") return /\b(add|order|get|buy|i want)\b/iu.test(text);
  return /شامل|آرڊر|آرڈر|چاہیے|منگوائیں|چاهيان ٿو|آرڊر ڪريو|آرڊر ڪر/u.test(text);
}

export function isVoiceCheckoutIntent(text: string) {
  return /\b(checkout|check out|place (my )?order|finish (my )?order|go to checkout)\b/iu.test(text) ||
    /چیک آؤٹ|آرڈر مکمل|آرڊر مڪمل|چيڪ آئوٽ/u.test(text);
}

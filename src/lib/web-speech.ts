export type SpeechRecognitionResultLike = {
  readonly length: number;
  [index: number]: { readonly transcript: string };
};

export type SpeechRecognitionEventLike = {
  readonly results: SpeechRecognitionResultLike[];
};

export type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function createSpeechRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  return Recognition ? new Recognition() : null;
}

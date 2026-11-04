// Languages the hearing person can read and hear signed messages in (written by Muse Spark).
// `native` is how the language names itself; `voice` is the tag used to find a browser text-to-speech voice.
export const LANGUAGES = {
  en: { name: "English", native: "English", voice: "en" },
  yo: { name: "Yoruba", native: "Yorùbá", voice: "yo" },
  ha: { name: "Hausa", native: "Hausa", voice: "ha" },
  ig: { name: "Igbo", native: "Asụsụ Igbo", voice: "ig" },
  pcm: { name: "Nigerian Pidgin", native: "Naijá", voice: "en" }, // no Pidgin voices exist; an English voice reads it well
  fr: { name: "French", native: "Français", voice: "fr" },
  es: { name: "Spanish", native: "Español", voice: "es" },
  ar: { name: "Arabic", native: "العربية", voice: "ar" },
  zh: { name: "Simplified Chinese", native: "中文", voice: "zh" },
  ko: { name: "Korean", native: "한국어", voice: "ko" },
} as const;

export type LanguageCode = keyof typeof LANGUAGES;

export const isLanguage = (code: unknown): code is LanguageCode => typeof code === "string" && Object.hasOwn(LANGUAGES, code);

// Languages the hearing person can read and hear signed messages in (written by Muse Spark).
// `native` is how the language names itself; `voice` is the tag used to find a browser text-to-speech voice.
export const LANGUAGES = {
  en: { name: "English", native: "English", voice: "en" },
  yo: { name: "Yoruba", native: "Yorùbá", voice: "yo" },
  ha: { name: "Hausa", native: "Hausa", voice: "ha" },
  ig: { name: "Igbo", native: "Asụsụ Igbo", voice: "ig" },
  pcm: { name: "Nigerian Pidgin", native: "Naijá", voice: "en" }, // no Pidgin voices exist; an English voice reads it well
  fr: { name: "French", native: "Français", voice: "fr" },
} as const;

export type LanguageCode = keyof typeof LANGUAGES;

export const isLanguage = (code: unknown): code is LanguageCode => typeof code === "string" && Object.hasOwn(LANGUAGES, code);

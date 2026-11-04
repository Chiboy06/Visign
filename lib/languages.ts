// Languages the hearing person can read and hear signed messages in (translated by Muse Spark).
// `voice` is the BCP 47 tag used to look for a matching browser text-to-speech voice.
export const LANGUAGES = {
  en: { name: "English", voice: "en" },
  yo: { name: "Yoruba", voice: "yo" },
  ha: { name: "Hausa", voice: "ha" },
  ig: { name: "Igbo", voice: "ig" },
  pcm: { name: "Nigerian Pidgin", voice: "en" }, // no Pidgin voices exist; an English voice reads it well
  fr: { name: "French", voice: "fr" },
} as const;

export type LanguageCode = keyof typeof LANGUAGES;

export const isLanguage = (code: unknown): code is LanguageCode => typeof code === "string" && Object.hasOwn(LANGUAGES, code);

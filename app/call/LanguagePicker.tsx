"use client";

import { LANGUAGES, type LanguageCode } from "@/lib/languages";

/** Hearing side: which language signed messages arrive in, and whether they're read aloud. */
export function LanguagePicker({
  lang, onLang, speak, onSpeak,
}: { lang: LanguageCode; onLang: (l: LanguageCode) => void; speak: boolean; onSpeak: (on: boolean) => void }) {
  return (
    <fieldset className="rounded-[2rem] bg-white p-4">
      <legend className="sr-only">Language for signed messages</legend>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-lg font-bold">Their signing reaches you in</p>
        <button
          type="button" role="switch" aria-checked={speak} onClick={() => onSpeak(!speak)}
          className={`flex items-center gap-2 rounded-full px-4 py-2 font-bold transition-colors ${speak ? "bg-vat text-cloth" : "bg-cloth text-ink/70"}`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" />
            {speak ? <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /> : <path d="m16 9 6 6m0-6-6 6" />}
          </svg>
          {speak ? "Read aloud" : "Silent"}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.entries(LANGUAGES) as [LanguageCode, (typeof LANGUAGES)[LanguageCode]][]).map(([code, l]) => {
          const on = code === lang;
          return (
            <label
              key={code}
              className={`cursor-pointer rounded-2xl border-2 px-4 py-2 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-sun ${on ? "border-sun bg-sun text-ink" : "border-ink/10 bg-cloth hover:border-ink/30"}`}
            >
              <input type="radio" name="language" className="sr-only" checked={on} onChange={() => onLang(code)} />
              <span className="block font-display text-lg font-bold leading-tight" lang={code === "pcm" ? "pcm" : code}>{l.native}</span>
              {l.native !== l.name && <span className="block text-xs text-ink/60">{l.name}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

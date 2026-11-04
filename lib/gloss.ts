import type { Guess } from "./classify";

// Words a gloss drops; used when Muse Spark is late or unavailable.
// "LIKE" stays: as a verb it carries meaning, and a kept filler costs less than a lost word.
const DROP = new Set(["UM", "UH", "SO", "WELL", "A", "AN", "THE", "IS", "AM", "ARE", "WAS", "WERE", "BE", "TO", "OF", "JUST", "REALLY", "VERY", "OH"]);

export function localGloss(text: string): string[] {
  const words = text.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !DROP.has(w));
  return [...words.slice(0, text.trim().endsWith("?") ? 7 : 8), ...(text.trim().endsWith("?") ? ["?"] : [])];
}

/**
 * Reads Muse Spark's gloss reply: {"english": "...", "gloss": [...]}. `english` is what the deaf person reads
 * (speech in Nigerian Pidgin or mixed English comes back as plain English). Any malformed part falls back.
 */
export function parseGlossReply(raw: string, original: string): { english: string; gloss: string[] } {
  try {
    const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    const gloss = Array.isArray(j.gloss) && j.gloss.length > 0 && j.gloss.every((t: unknown) => typeof t === "string") ? j.gloss.slice(0, 8) : null;
    const english = typeof j.english === "string" && j.english.trim() ? j.english.trim() : original;
    return { english, gloss: gloss ?? localGloss(english) };
  } catch {
    return { english: original, gloss: localGloss(original) };
  }
}

/** Spelled words as sent by the deaf side: per word, per letter, the classifier's top guesses. */
export function isSpelled(x: unknown): x is Guess[][][] {
  return (
    Array.isArray(x) && x.length > 0 && x.length <= 12 &&
    x.every((word) => Array.isArray(word) && word.length > 0 && word.length <= 20 &&
      word.every((pos) => Array.isArray(pos) && pos.length > 0 && pos.length <= 3 &&
        pos.every((g) => typeof g?.letter === "string" && g.letter.length <= 2 && typeof g?.p === "number")))
  );
}

/** One line per word, letters in signing order with alternatives: "1: Y 90% | O 80%, E 15% | U 85%". */
export const describeSpelled = (words: Guess[][][]) =>
  words.map((w, i) => `${i + 1}: ${w.map((pos) => pos.map((g) => `${g.letter} ${Math.round(g.p * 100)}%`).join(", ")).join(" | ")}`).join("\n");

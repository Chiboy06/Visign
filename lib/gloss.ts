// Words a gloss drops; used when Muse Spark is late or unavailable.
// "LIKE" stays: as a verb it carries meaning, and a kept filler costs less than a lost word.
const DROP = new Set(["UM", "UH", "SO", "WELL", "A", "AN", "THE", "IS", "AM", "ARE", "WAS", "WERE", "BE", "TO", "OF", "JUST", "REALLY", "VERY", "OH"]);

export function localGloss(text: string): string[] {
  const words = text.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !DROP.has(w));
  return [...words.slice(0, text.trim().endsWith("?") ? 7 : 8), ...(text.trim().endsWith("?") ? ["?"] : [])];
}

/** True when `text` uses exactly the signed letters but in a different order: a rearrangement, not a fix. */
export function reordersLetters(signed: string, text: string): boolean {
  const a = signed.toUpperCase().replace(/[^A-Z0-9]/g, ""), b = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return a !== b && a.length === b.length && [...a].sort().join("") === [...b].sort().join("");
}

// The model is told to return a JSON array; fall back to the local gloss so the avatar always gets something.
export function parseGloss(raw: string, original: string): string[] {
  try {
    const arr = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1));
    if (Array.isArray(arr) && arr.length > 0 && arr.every((t) => typeof t === "string")) return arr.slice(0, 8);
  } catch {}
  return localGloss(original);
}

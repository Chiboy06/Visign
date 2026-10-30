// Landmark samples shared by the converter, the recorder and (later) the classifier.
// We store raw MediaPipe points plus the image aspect ratio, so feature code can change without re-converting.

export type Point = { x: number; y: number; z: number };
export type Lang = "nsl" | "asl";

export type Sample = {
  lang: Lang;
  label: string; // "A".."Z", "1".."9", or a word gloss like "HELLO"
  source: string; // dataset or recorder id, for held-out-signer testing
  aspect: number; // image width / height; x is normalized by width, y by height
  handedness?: string; // MediaPipe's label on the raw (unmirrored) frame
  points: Point[]; // 21 hand landmarks
};

export type Motion = Omit<Sample, "points"> & { frames: { t: number; points: Point[] }[] };

export const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
export const DIGITS = [..."123456789"];
export const WORDS = ["HELLO", "HOW", "YOU", "YES", "NO", "THANK-YOU", "WATER", "PLEASE"];

/**
 * Label from a dataset path. NSL files look like "a_frame_003778_aug1.jpg" or ".../images/test/5_2026...jpg";
 * ASLNow files look like "B/0080e8c9-....json". Returns null when no label can be found.
 */
export function labelFromPath(path: string): string | null {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  const file = parts.at(-1) ?? "";
  const prefix = file.match(/^([a-z0-9])_/i)?.[1];
  if (prefix) return prefix.toUpperCase();
  const folder = parts.at(-2);
  if (folder && /^[A-Za-z0-9]$/.test(folder)) return folder.toUpperCase();
  return null;
}

const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);

/** Validates 21 landmarks with finite x/y/z; returns them trimmed to x/y/z or null. */
export function toPoints(raw: unknown): Point[] | null {
  if (!Array.isArray(raw) || raw.length !== 21) return null;
  if (!raw.every((p) => p && finite(p.x) && finite(p.y) && finite(p.z))) return null;
  return raw.map(({ x, y, z }) => ({ x, y, z }));
}

// shortcut: ASLNow doesn't record its camera size; assume a 4:3 webcam until we measure per-sample aspect
export const ASLNOW_ASPECT = 4 / 3;

/** Groups NSL frames by their source video so sampling spreads across videos, not consecutive frames. */
export function sourceKey(fileName: string): string {
  return fileName.replace(/_aug\d+(\.\w+)?$/, "").replace(/_\d+$/, "").replace(/frame_\d+$/, "frame");
}

export function countByLabel(samples: { label: string }[]) {
  const counts: Record<string, number> = {};
  for (const s of samples) counts[s.label] = (counts[s.label] ?? 0) + 1;
  return counts;
}

import type { Point } from "./dataset";

export type Guess = { letter: string; p: number };
export type Model = { labels: string[]; X: number[][] };

/**
 * Hand-shape features that ignore where the hand is, how big it is and which hand it is:
 * every joint-to-joint distance divided by palm length (mirror-invariant), plus which way the
 * palm points (up/down vs sideways, mirror-invariant) so same-shape letters like U/H and K/P differ.
 */
export function features(points: Point[], aspect: number): number[] {
  const p = points.map((q) => [q.x * aspect, q.y, q.z * aspect]);
  const dist = (a: number, b: number) => Math.hypot(p[a][0] - p[b][0], p[a][1] - p[b][1], p[a][2] - p[b][2]);
  const palm = dist(0, 9) || 1;
  const f: number[] = [];
  for (let i = 0; i < 21; i++) for (let j = i + 1; j < 21; j++) f.push(dist(i, j) / palm);
  const vx = p[9][0] - p[0][0], vy = p[9][1] - p[0][1];
  const len = Math.hypot(vx, vy) || 1;
  f.push((2 * vy) / len, (2 * Math.abs(vx)) / len); // weighted x2: orientation matters as much as many distances
  return f;
}

/** Distance-weighted k-nearest-neighbours; returns the top 3 letters with probabilities summing to 1. */
export function classify(model: Model, f: number[], k = 7): Guess[] {
  // shortcut: linear scan of all samples (~3k x 212 per frame, well under 1 ms); use a KD-tree past ~50k samples
  const nearest: { d: number; i: number }[] = [];
  for (let i = 0; i < model.X.length; i++) {
    const x = model.X[i];
    let d = 0;
    for (let j = 0; j < f.length; j++) d += (x[j] - f[j]) ** 2;
    if (nearest.length < k || d < nearest[nearest.length - 1].d) {
      nearest.push({ d, i });
      nearest.sort((a, b) => a.d - b.d);
      if (nearest.length > k) nearest.pop();
    }
  }
  const votes = new Map<string, number>();
  for (const { d, i } of nearest) votes.set(model.labels[i], (votes.get(model.labels[i]) ?? 0) + 1 / (Math.sqrt(d) + 1e-6));
  const total = [...votes.values()].reduce((a, b) => a + b, 0) || 1;
  return [...votes.entries()]
    .map(([letter, v]) => ({ letter, p: v / total }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 3);
}

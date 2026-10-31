// Cartoon hand drawing shared by the home-page hero and the in-call avatar (no MediaPipe import).
import { BONES, type Point } from "./dataset";

export const blend = (from: Point[] | null, to: Point[], k: number): Point[] =>
  from ? to.map((p, i) => ({ x: from[i].x + (p.x - from[i].x) * k, y: from[i].y + (p.y - from[i].y) * k, z: 0 })) : to;

/** Draws a pose (points in a 0..1 box) as thick outlined fingers inside the square at (x, y) of `size` px. */
export function paintHand(ctx: CanvasRenderingContext2D, pose: Point[], x: number, y: number, size: number, outline = "#0f1640") {
  const at = (p: Point) => [x + p.x * size, y + p.y * size] as const;
  const w = size / 22;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Palm first, so fingers folded across it (A, E, M, N, S, T) stay visible on top.
  ctx.beginPath();
  [0, 1, 5, 9, 13, 17].forEach((i, n) => (n ? ctx.lineTo(...at(pose[i])) : ctx.moveTo(...at(pose[i]))));
  ctx.closePath();
  ctx.fillStyle = "#8d5524";
  ctx.strokeStyle = outline;
  ctx.lineWidth = 5;
  ctx.fill();
  ctx.stroke();
  // Each finger fully outlined, thumb to pinky, so overlapping fingers keep their edges.
  for (const finger of [BONES.slice(1, 4), BONES.slice(5, 8), BONES.slice(9, 12), BONES.slice(13, 16), BONES.slice(17, 20)]) {
    for (const [color, width] of [[outline, w + 5], ["#8d5524", w]] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (const [a, b] of finger) {
        ctx.moveTo(...at(pose[a]));
        ctx.lineTo(...at(pose[b]));
      }
      ctx.stroke();
    }
  }
  // Fingertips in ochre: they carry most of the meaning in fingerspelling.
  ctx.fillStyle = "#e8a317";
  for (const tip of [4, 8, 12, 16, 20]) {
    ctx.beginPath();
    ctx.arc(...at(pose[tip]), w * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Loads the per-letter avatar poses written by `npm run model` (small file, not the full model). */
export async function loadPoses(): Promise<Record<string, Point[]>> {
  const raw: Record<string, number[]> = await (await fetch("/model/poses.json")).json();
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.from({ length: v.length / 3 }, (_, i) => ({ x: v[3 * i], y: v[3 * i + 1], z: v[3 * i + 2] }))]),
  );
}

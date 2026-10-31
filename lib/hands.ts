// Browser-only: MediaPipe Hand Landmarker served from our own origin (see scripts/copy-mediapipe.mjs).
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type { Point } from "./dataset";

const cache = new Map<string, Promise<HandLandmarker>>();

export function handLandmarker(mode: "IMAGE" | "VIDEO") {
  if (!cache.has(mode)) {
    cache.set(
      mode,
      (async () => {
        const files = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
        const options = (delegate: "GPU" | "CPU") => ({
          baseOptions: { modelAssetPath: "/models/hand_landmarker.task", delegate },
          runningMode: mode,
          numHands: 1,
        });
        // Some laptops and phones lack WebGL2; CPU is slower but works everywhere.
        return HandLandmarker.createFromOptions(files, options("GPU")).catch(() =>
          HandLandmarker.createFromOptions(files, options("CPU")),
        );
      })(),
    );
  }
  return cache.get(mode)!;
}

const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

/** Draws a hand skeleton; points are normalized to the canvas (x by width, y by height). Fingertips in red. */
export function drawHand(ctx: CanvasRenderingContext2D, points: Point[], color = "#111") {
  const { width: w, height: h } = ctx.canvas;
  ctx.lineWidth = Math.max(2, w / 160);
  ctx.strokeStyle = color;
  for (const [a, b] of BONES) {
    ctx.beginPath();
    ctx.moveTo(points[a].x * w, points[a].y * h);
    ctx.lineTo(points[b].x * w, points[b].y * h);
    ctx.stroke();
  }
  points.forEach((p, i) => {
    ctx.fillStyle = [4, 8, 12, 16, 20].includes(i) ? "#dc2626" : "#2563eb";
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, Math.max(2.5, w / 120), 0, Math.PI * 2);
    ctx.fill();
  });
}

export function downloadJson(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

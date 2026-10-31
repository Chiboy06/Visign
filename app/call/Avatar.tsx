"use client";

import { useEffect, useRef } from "react";
import type { Point } from "@/lib/dataset";

const LETTER_MS = 520; // fingerspelling pace: about 2 letters per second, readable for learners
const BLEND_MS = 160;
const WORD_GAP_MS = 420;
const SIZE = 320;

const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

type Step = { letter: string | null; word: string };

/** A friendly 2D character that fingerspells each gloss it receives, blending between real recorded handshapes. */
export function Avatar({ poses, gloss }: { poses: Record<string, Point[]>; gloss: { id: number; tokens: string[] } | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const steps = useRef<Step[]>([]);
  const state = useRef({ step: -1, start: 0, from: null as Point[] | null, to: null as Point[] | null, word: "" });

  useEffect(() => {
    if (!gloss) return;
    for (const token of gloss.tokens) {
      // shortcut: word signs are fingerspelled until the team records them as motions
      const letters = [...token.toUpperCase()].filter((c) => poses[c]);
      if (letters.length === 0) continue;
      letters.forEach((letter) => steps.current.push({ letter, word: token }));
      steps.current.push({ letter: null, word: token });
    }
  }, [gloss, poses]);

  useEffect(() => {
    let frame = 0;
    const draw = (t: number) => {
      const s = state.current;
      const duration = steps.current[s.step]?.letter ? LETTER_MS : WORD_GAP_MS;
      if (s.step + 1 < steps.current.length && (s.step < 0 || t - s.start >= duration)) {
        s.step++;
        s.start = t;
        const next = steps.current[s.step];
        s.from = s.to;
        if (next.letter) s.to = poses[next.letter];
        s.word = next.word;
      }
      const ctx = canvas.current?.getContext("2d");
      if (ctx) paint(ctx, s.from, s.to, Math.min(1, (t - s.start) / BLEND_MS), steps.current[s.step]?.letter ?? "", s.word);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [poses]);

  return <canvas ref={canvas} width={SIZE} height={SIZE} className="h-auto w-full max-w-[320px]" role="img" aria-label="Signing avatar" />;
}

function paint(ctx: CanvasRenderingContext2D, from: Point[] | null, to: Point[] | null, k: number, letter: string, word: string) {
  const W = SIZE;
  ctx.fillStyle = "#fef3c7";
  ctx.fillRect(0, 0, W, W);

  // Body and head
  ctx.fillStyle = "#2563eb";
  ctx.beginPath();
  ctx.roundRect(W * 0.08, W * 0.62, W * 0.44, W * 0.5, 40);
  ctx.fill();
  ctx.fillStyle = "#8d5524";
  ctx.beginPath();
  ctx.arc(W * 0.3, W * 0.38, W * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1f2937";
  for (const dx of [-0.055, 0.055]) {
    ctx.beginPath();
    ctx.arc(W * (0.3 + dx), W * 0.36, W * 0.017, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(W * 0.3, W * 0.41, W * 0.05, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  // Hand: blended pose in the right half, drawn as thick outlined cartoon fingers
  const pose = to && (from ? to.map((p, i) => ({ x: from[i].x + (p.x - from[i].x) * k, y: from[i].y + (p.y - from[i].y) * k, z: 0 })) : to);
  if (pose) {
    const at = (p: Point) => [W * (0.5 + p.x * 0.46), W * (0.08 + p.y * 0.6)] as const;
    for (const [color, width] of [["#3b2412", 17], ["#c68642", 12]] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      for (const [a, b] of BONES) {
        ctx.beginPath();
        ctx.moveTo(...at(pose[a]));
        ctx.lineTo(...at(pose[b]));
        ctx.stroke();
      }
    }
  }

  // Current letter and word
  ctx.fillStyle = "#111827";
  ctx.font = "bold 44px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(letter, W * 0.75, W * 0.9);
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText(word, W * 0.75, W * 0.97);
}

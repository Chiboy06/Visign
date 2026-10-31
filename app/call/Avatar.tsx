"use client";

import { useEffect, useRef, useState } from "react";
import type { Point } from "@/lib/dataset";
import { blend, paintHand } from "@/lib/handArt";

const LETTER_MS = 520; // fingerspelling pace: about 2 letters per second, readable for learners
const BLEND_MS = 160;
const WORD_GAP_MS = 420;
const SIZE = 360;

type Step = { letter: string | null; word: string };

/** A friendly signer that fingerspells each gloss it receives, blending between real recorded handshapes. */
export function Avatar({ poses, gloss }: { poses: Record<string, Point[]>; gloss: { id: number; tokens: string[] } | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const steps = useRef<Step[]>([]);
  const state = useRef({ step: -1, start: 0, from: null as Point[] | null, to: null as Point[] | null });
  const [now, setNow] = useState<Step>({ letter: null, word: "" });

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
        setNow(next);
      }
      const ctx = canvas.current?.getContext("2d");
      if (ctx) paint(ctx, s.to && blend(s.from, s.to, Math.min(1, (t - s.start) / BLEND_MS)));
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [poses]);

  return (
    <figure className="flex flex-col items-center rounded-[2rem] bg-white p-4">
      <canvas ref={canvas} width={SIZE} height={SIZE} className="aspect-square w-full max-w-[360px]" aria-hidden="true" />
      <figcaption className="mt-2 flex min-h-16 items-baseline gap-4" aria-live="polite">
        <span className="font-display text-6xl font-bold leading-none text-sun">{now.letter ?? ""}</span>
        <span className="text-lg text-ink/70">{now.word || "Waiting for them to speak"}</span>
      </figcaption>
    </figure>
  );
}

function paint(ctx: CanvasRenderingContext2D, pose: Point[] | null) {
  const W = SIZE;
  ctx.clearRect(0, 0, W, W);
  // Stage: an indigo disc, the signer's backdrop.
  ctx.fillStyle = "#2b3a8f";
  ctx.beginPath();
  ctx.arc(W * 0.5, W * 0.58, W * 0.42, 0, Math.PI * 2);
  ctx.fill();
  // Body
  ctx.fillStyle = "#16215c";
  ctx.beginPath();
  ctx.roundRect(W * 0.16, W * 0.7, W * 0.44, W * 0.4, 48);
  ctx.fill();
  // Head, eyes, smile
  ctx.fillStyle = "#8d5524";
  ctx.beginPath();
  ctx.arc(W * 0.38, W * 0.5, W * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0f1640";
  for (const dx of [-0.05, 0.05]) {
    ctx.beginPath();
    ctx.arc(W * (0.38 + dx), W * 0.48, W * 0.015, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "#0f1640";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(W * 0.38, W * 0.53, W * 0.045, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  // The signing hand, raised beside the face.
  if (pose) paintHand(ctx, pose, W * 0.48, W * 0.08, W * 0.5);
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { Point } from "@/lib/dataset";
import { blend, loadPoses, paintHand } from "@/lib/handArt";

const WORD = "VISIGN";
const SIZE = 420;

/** The home-page hero: a real recorded hand fingerspelling the product name, on a loop. */
export function HeroHand() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [shown, setShown] = useState(1); // letters lit, including the one being signed

  useEffect(() => {
    let frame = 0, stopped = false;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hold = reduced ? 1400 : 620, blendMs = reduced ? 0 : 180, rest = 1600;
    loadPoses().then((poses) => {
      let i = 0, start = performance.now(), from: Point[] | null = null;
      const draw = (t: number) => {
        if (stopped) return;
        const slot = i < WORD.length ? hold : rest;
        if (t - start >= slot) {
          from = poses[WORD[Math.min(i, WORD.length - 1)]];
          i = (i + 1) % (WORD.length + 1);
          start = t;
          setShown(i === WORD.length ? WORD.length : i + 1);
        }
        const to = poses[WORD[Math.min(i, WORD.length - 1)]];
        const ctx = canvas.current?.getContext("2d");
        if (ctx && to) {
          ctx.clearRect(0, 0, SIZE, SIZE);
          const k = blendMs ? Math.min(1, (t - start) / blendMs) : 1;
          paintHand(ctx, blend(from, to, k), SIZE * 0.1, SIZE * 0.06, SIZE * 0.8, "#eef1f8");
        }
        frame = requestAnimationFrame(draw);
      };
      frame = requestAnimationFrame(draw);
    }).catch(() => {}); // no poses: the word below still reads fine
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <figure className="flex flex-col items-center">
      <canvas ref={canvas} width={SIZE} height={SIZE} className="aspect-square w-full max-w-[420px]" aria-hidden="true" />
      <figcaption className="font-display text-5xl font-bold tracking-[0.35em] text-cloth sm:text-6xl" aria-label="Fingerspelling Visign">
        {[...WORD].map((c, n) => (
          <span key={n} className={n < shown ? "text-sun" : "text-cloth/25"}>{c}</span>
        ))}
      </figcaption>
    </figure>
  );
}

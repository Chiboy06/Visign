"use client";

// /tools/record: records your own signs as hand joints only (never video), with consent, for training.
// Space captures a still letter (or a motion for J, Z and words); exports JSON for scripts/build-model.ts.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { countByLabel, DIGITS, LETTERS, toPoints, WORDS, type Lang, type Motion, type Point, type Sample } from "@/lib/dataset";
import { downloadJson, drawHand, handLandmarker } from "@/lib/hands";

const MOTION_MS = 1500;
const isMotion = (label: string) => label === "J" || label === "Z" || WORDS.includes(label);

/** Camera + live hand skeleton; capture stills or short motions per label, then export. */
export default function RecordPage() {
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const latest = useRef<{ points: Point[]; handedness?: string } | null>(null);
  const recording = useRef<Motion | null>(null);

  const [consent, setConsent] = useState(false);
  const [signer, setSigner] = useState("");
  const [lang, setLang] = useState<Lang>("nsl");
  const [label, setLabel] = useState("A");
  const [running, setRunning] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [motions, setMotions] = useState<Motion[]>([]);
  const [message, setMessage] = useState("");

  const source = `rec:${signer.trim().toLowerCase() || "anon"}`;
  const aspect = () => (video.current ? video.current.videoWidth / video.current.videoHeight : 4 / 3);

  // Start the camera and the per-frame hand detection loop (keeps the latest hand in `latest`).
  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      video.current!.srcObject = stream;
      await video.current!.play();
      setRunning(true);
    } catch (e) {
      setMessage(`Camera unavailable: ${(e as Error).message}`);
    }
  }

  // Detection loop: raw (unmirrored) frames in, skeleton drawn on a mirrored overlay.
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let stopped = false;
    handLandmarker("VIDEO").then((detector) => {
      const tick = () => {
        if (stopped) return;
        const v = video.current!, c = overlay.current!;
        if (v.readyState >= 2) {
          c.width = v.videoWidth;
          c.height = v.videoHeight;
          const result = detector.detectForVideo(v, performance.now());
          const points = toPoints(result.landmarks[0]);
          latest.current = points ? { points, handedness: result.handedness[0]?.[0]?.categoryName } : null;
          const ctx = c.getContext("2d")!;
          ctx.clearRect(0, 0, c.width, c.height);
          if (points) drawHand(ctx, points, recording.current ? "#dc2626" : "#111");
          if (points && recording.current) recording.current.frames.push({ t: performance.now(), points });
        }
        frame = requestAnimationFrame(tick);
      };
      tick();
    });
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [running]);

  // Release the camera when leaving the page.
  useEffect(() => () => (video.current?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop()), []);

  // Save the current hand as one sample of the selected letter.
  function captureStill() {
    const hand = latest.current;
    if (!hand) return setMessage("No hand in view.");
    setSamples((s) => [...s, { lang, label, source, aspect: aspect(), handedness: hand.handedness, points: hand.points }]);
    setMessage(`Captured ${label}.`);
  }

  // Record MOTION_MS of frames for signs that move (J, Z, words); too few hand frames is rejected.
  function recordMotion() {
    if (recording.current) return;
    recording.current = { lang, label, source, aspect: aspect(), frames: [] };
    setMessage(`Recording ${label}…`);
    setTimeout(() => {
      const m = recording.current!;
      recording.current = null;
      if (m.frames.length < 10) return setMessage("Too few frames with a hand; try again.");
      setMotions((all) => [...all, m]);
      setMessage(`Recorded ${label} (${m.frames.length} frames).`);
    }, MOTION_MS);
  }

  // Space = capture (still or motion by label), M = force motion.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!running || !consent || (e.target as HTMLElement).closest("input, select, textarea")) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (isMotion(label)) recordMotion();
        else captureStill();
      } else if (e.key === "m") recordMotion();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const stillCounts = countByLabel(samples);
  const motionCounts = countByLabel(motions);

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-8">
      <Link href="/" className="font-display text-lg font-bold text-vat">Visign</Link>
      <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight">Sign recorder</h1>
      <p className="mt-1 text-sm text-ink/70">
        Records hand landmarks only, never video. One file trains recognition <em>and</em> drives the avatar.
      </p>

      <label className="mt-4 flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          I agree that the hand positions I record here may be used to train and demonstrate Visign. No video or
          images are stored.
        </span>
      </label>

      <div className="mt-4 flex flex-wrap items-end gap-4 text-sm">
        <label className="flex flex-col">
          Signer ID (initials, no names)
          <input className="mt-1 rounded border px-2 py-1" value={signer} maxLength={12} onChange={(e) => setSigner(e.target.value)} />
        </label>
        <label className="flex flex-col">
          Language
          <select className="mt-1 rounded border px-2 py-1" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            <option value="nsl">NSL</option>
            <option value="asl">ASL</option>
          </select>
        </label>
        <label className="flex flex-col">
          Sign
          <select className="mt-1 rounded border px-2 py-1" value={label} onChange={(e) => setLabel(e.target.value)}>
            <optgroup label="Letters">{LETTERS.map((l) => <option key={l}>{l}</option>)}</optgroup>
            <optgroup label="Digits">{DIGITS.map((l) => <option key={l}>{l}</option>)}</optgroup>
            <optgroup label="Words">{WORDS.map((l) => <option key={l}>{l}</option>)}</optgroup>
          </select>
        </label>
        {!running ? (
          <button className="rounded bg-ink px-4 py-2 text-white disabled:opacity-40" disabled={!consent} onClick={start}>
            Start camera
          </button>
        ) : (
          <>
            <button className="rounded bg-ink px-4 py-2 text-white disabled:opacity-40" disabled={!consent}
              onClick={isMotion(label) ? recordMotion : captureStill}>
              {isMotion(label) ? `Record motion (Space)` : `Capture (Space)`}
            </button>
            <button className="rounded border px-4 py-2" onClick={recordMotion}>Force motion (M)</button>
          </>
        )}
        <button
          className="rounded border px-4 py-2 disabled:opacity-40"
          disabled={samples.length + motions.length === 0}
          onClick={() => downloadJson(`recording-${source}-${Date.now()}.json`, { version: 1, samples, motions })}
        >
          Download ({samples.length} stills, {motions.length} motions)
        </button>
      </div>

      <p className="mt-3 text-sm" role="status" aria-live="polite">{message}</p>

      <div className="relative mt-4 w-full max-w-2xl overflow-hidden rounded bg-dye">
        <video ref={video} playsInline muted className="block w-full -scale-x-100" />
        <canvas ref={overlay} className="absolute inset-0 h-full w-full -scale-x-100" />
      </div>

      <section className="mt-6 text-sm">
        <h2 className="font-medium">Captured this session</h2>
        <p className="mt-1 font-mono text-xs">
          {Object.entries({ ...stillCounts, ...motionCounts }).map(([l]) =>
            `${l}: ${stillCounts[l] ?? 0}${motionCounts[l] ? ` + ${motionCounts[l]} motion` : ""}`).join("   ") || "nothing yet"}
        </p>
        <p className="mt-1 text-xs text-ink/70">Aim for about 30 stills per letter per person, with small changes in angle and distance.</p>
      </section>
    </main>
  );
}

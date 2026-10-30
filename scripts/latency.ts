// Day 1 measurement: real round-trip times to Meta from this machine.
// Run: npm run latency -- [scripts/fixtures/hand-crop.jpg]    (calls Meta directly, ~$0.02 total, not recorded in the ledger)
import { readFileSync } from "node:fs";
import { segment, spark, transcribe } from "../lib/meta.ts";

const RUNS = 3;

async function time(label: string, fn: () => Promise<unknown>) {
  const ms: number[] = [];
  let last: unknown;
  for (let i = 0; i < RUNS; i++) {
    const t = performance.now();
    try {
      last = await fn();
    } catch (e) {
      console.log(`${label}: FAILED - ${(e as Error).message}`);
      return;
    }
    ms.push(Math.round(performance.now() - t));
  }
  console.log(`${label}: ${ms.join(" / ")} ms (median ${ms.sort((a, b) => a - b)[1]})  →`, JSON.stringify(last).slice(0, 120));
}

// 2 s of a 440 Hz tone as 16 kHz mono WAV: enough to time the endpoint without needing a recording.
function toneWav(seconds = 2, rate = 16_000) {
  const n = seconds * rate;
  const v = new DataView(new ArrayBuffer(44 + n * 2));
  const tag = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  tag(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); tag(8, "WAVE"); tag(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  tag(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin((2 * Math.PI * 440 * i) / rate) * 8000, true);
  return new Blob([v.buffer], { type: "audio/wav" });
}

if (!process.env.MODEL_API_KEY) throw new Error("MODEL_API_KEY missing: copy .env.example to .env and fill it in");

await time("Muse Spark gloss", () =>
  spark('Output ONLY a JSON array of uppercase gloss tokens.', "Convert: um, would you like some water?"));
await time("Voice Transcribe (2 s clip)", () => transcribe(toneWav()));

const img = process.argv[2];
if (img) {
  const dataUrl = `data:image/jpeg;base64,${readFileSync(img).toString("base64")}`;
  await time(`SAM 3.1 "hand" (${Math.round(dataUrl.length / 1024)} KB)`, () => segment(dataUrl));
} else {
  console.log("SAM 3.1: skipped. Pass a hand crop: npm run latency -- scripts/fixtures/hand-crop.jpg");
}

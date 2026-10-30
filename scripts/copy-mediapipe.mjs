// Serve MediaPipe from our own origin, pinned: the WASM runtime comes from the npm package,
// the hand model from Google's versioned URL checked against a fixed SHA-256 (kept out of git: 7.8 MB).
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

cpSync("node_modules/@mediapipe/tasks-vision/wasm", "public/mediapipe/wasm", { recursive: true });

const MODEL = "public/models/hand_landmarker.task";
const URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const SHA256 = "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1";
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

if (!existsSync(MODEL) || sha(readFileSync(MODEL)) !== SHA256) {
  mkdirSync("public/models", { recursive: true });
  let buf;
  for (let attempt = 1; attempt <= 3 && !buf; attempt++) {
    try {
      buf = Buffer.from(await (await fetch(URL, { signal: AbortSignal.timeout(120_000) })).arrayBuffer());
    } catch (e) {
      console.warn(`hand model download attempt ${attempt} failed: ${e.message}`);
    }
  }
  if (!buf || sha(buf) !== SHA256) {
    console.error(`Could not get a verified ${MODEL}. Re-run: node scripts/copy-mediapipe.mjs`);
    process.exit(1);
  }
  writeFileSync(MODEL, buf);
}

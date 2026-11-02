// Builds public/model/letters.json from ASLNow (data/raw/asl-now) and any converter/recorder exports
// dropped in data/landmarks/*.json, and reports accuracy on a held-out 20%.
// Run: npm run model
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { classify, features } from "../lib/classify.ts";
import { ASLNOW_ASPECT, countByLabel, fitToBox, toPoints, type Sample } from "../lib/dataset.ts";

const samples: Sample[] = [];

const ASLNOW = "data/raw/asl-now";
if (existsSync(ASLNOW)) {
  for (const label of readdirSync(ASLNOW).filter((d) => /^[A-Z]$/.test(d))) {
    for (const file of readdirSync(join(ASLNOW, label))) {
      const points = toPoints(JSON.parse(readFileSync(join(ASLNOW, label, file), "utf8")));
      if (points) samples.push({ lang: "asl", label, source: "aslnow", aspect: ASLNOW_ASPECT, points });
    }
  }
}

const EXPORTS = "data/landmarks";
if (existsSync(EXPORTS)) {
  for (const file of readdirSync(EXPORTS).filter((f) => f.endsWith(".json"))) {
    const data = JSON.parse(readFileSync(join(EXPORTS, file), "utf8"));
    for (const s of data.samples ?? []) {
      const points = toPoints(s.points);
      if (points && typeof s.label === "string" && s.aspect > 0) samples.push({ ...s, points });
    }
  }
}
if (samples.length === 0) throw new Error("No data: clone ASLNow into data/raw/asl-now or add exports to data/landmarks/");

const feats = samples.map((s) => features(s.points, s.aspect));

// Held-out check: every 5th sample of each label is test data. Same signers on both sides, so this is an
// optimistic number; the real test is a person the model has never seen.
const seen: Record<string, number> = {};
const isTest = samples.map((s) => (seen[s.label] = (seen[s.label] ?? 0) + 1) % 5 === 0);
const train = { labels: samples.filter((_, i) => !isTest[i]).map((s) => s.label), X: feats.filter((_, i) => !isTest[i]) };
let correct = 0, top3 = 0, total = 0;
const confusions: Record<string, number> = {};
const perLabel: Record<string, [number, number]> = {};
samples.forEach((s, i) => {
  if (!isTest[i]) return;
  const guess = classify(train, feats[i]);
  total++;
  perLabel[s.label] ??= [0, 0];
  perLabel[s.label][1]++;
  if (guess[0].letter === s.label) { correct++; perLabel[s.label][0]++; }
  else confusions[`${s.label}→${guess[0].letter}`] = (confusions[`${s.label}→${guess[0].letter}`] ?? 0) + 1;
  if (guess.some((g) => g.letter === s.label)) top3++;
});
const pct = (a: number, b: number) => `${((100 * a) / b).toFixed(1)}%`;
console.log(`samples: ${samples.length} (${JSON.stringify(countByLabel(samples.map((s) => ({ label: s.lang }))))})`);
console.log(`held-out accuracy: top-1 ${pct(correct, total)}, top-3 ${pct(top3, total)} on ${total} samples`);
console.log("weakest letters:", Object.entries(perLabel).sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1]).slice(0, 6)
  .map(([l, [c, n]]) => `${l} ${pct(c, n)}`).join(", "));
console.log("top confusions:", Object.entries(confusions).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} x${n}`).join(", "));

// The honest test: for each recorded signer, train on everyone else and test on them (a "new person").
const signers = [...new Set(samples.map((s) => s.source).filter((s) => s.startsWith("rec:")))];
for (const signer of signers) {
  const out = samples.map((s) => s.source === signer);
  const rest = { labels: samples.filter((_, i) => !out[i]).map((s) => s.label), X: feats.filter((_, i) => !out[i]) };
  let hit = 0, n = 0;
  samples.forEach((s, i) => {
    if (!out[i]) return;
    n++;
    if (classify(rest, feats[i])[0].letter === s.label) hit++;
  });
  console.log(`new-person test, ${signer.slice(4)}: ${pct(hit, n)} correct on ${n} samples (model never saw this person)`);
}
if (signers.length === 0) console.log("new-person test: record at least one signer with /tools/record to get this number");

// Avatar pose per label: the medoid (the real sample most similar to all others), so poses are genuine hands.
const poses: Record<string, number[]> = {};
for (const label of Object.keys(countByLabel(samples))) {
  const idx = samples.map((s, i) => (s.label === label ? i : -1)).filter((i) => i >= 0);
  let best = idx[0], bestSum = Infinity;
  for (const i of idx) {
    let sum = 0;
    for (const j of idx) for (let k = 0; k < feats[i].length; k++) sum += (feats[i][k] - feats[j][k]) ** 2;
    if (sum < bestSum) { bestSum = sum; best = i; }
  }
  poses[label] = fitToBox(samples[best].points, samples[best].aspect).flatMap((p) => [p.x, p.y, p.z].map(round));
}

function round(n: number) { return Math.round(n * 1e4) / 1e4; }

mkdirSync("public/model", { recursive: true });
writeFileSync("public/model/letters.json", JSON.stringify({
  version: 1,
  builtAt: new Date().toISOString(),
  heldOutTop1: correct / total,
  samples: samples.map((s) => ({ l: s.label, lang: s.lang, a: round(s.aspect), p: s.points.flatMap((q) => [q.x, q.y, q.z].map(round)) })),
  poses,
}));
writeFileSync("public/model/poses.json", JSON.stringify(poses)); // small file for the home page and avatar
console.log(`wrote public/model/letters.json (${samples.length} samples, ${Object.keys(poses).length} poses)`);

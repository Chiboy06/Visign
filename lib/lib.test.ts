// Run: npm test (Node's built-in test runner; no test framework needed)
import assert from "node:assert/strict";
import { test } from "node:test";
import { capFor, COST, HARD_CAP_USD, SAM_CAP_USD, transcribeCost } from "./budget.ts";
import { countByLabel, labelFromPath, sourceKey, toPoints } from "./dataset.ts";
import { localGloss, parseGloss } from "./gloss.ts";
import { wavInfo } from "./wav.ts";

test("SAM stops at the cheap-mode cap, everything else at the hard cap", () => {
  assert.equal(capFor("segment"), SAM_CAP_USD);
  assert.equal(capFor("gloss"), HARD_CAP_USD);
  assert.ok(SAM_CAP_USD < HARD_CAP_USD && HARD_CAP_USD <= 75);
});

test("transcribe cost rounds up to whole seconds", () => {
  assert.equal(transcribeCost(32_000, 16_000), COST.transcribePerSecond); // exactly 1 s
  assert.equal(transcribeCost(32_001, 16_000), 2 * COST.transcribePerSecond);
  assert.ok(Math.abs(transcribeCost(48_000 * 60, 24_000) - 0.003) < 1e-9); // 1 min = $0.003
});

function wav(sampleRate: number, channels = 1, bits = 16) {
  const v = new DataView(new ArrayBuffer(44));
  [..."RIFF"].forEach((c, i) => v.setUint8(i, c.charCodeAt(0)));
  [..."WAVE"].forEach((c, i) => v.setUint8(8 + i, c.charCodeAt(0)));
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint16(34, bits, true);
  return v.buffer;
}

test("wavInfo accepts only what Meta accepts", () => {
  assert.deepEqual(wavInfo(wav(16_000)), { sampleRate: 16_000, bytes: 44 });
  assert.equal(wavInfo(wav(44_100)), null);
  assert.equal(wavInfo(wav(16_000, 2)), null);
  assert.equal(wavInfo(wav(16_000, 1, 8)), null);
  assert.equal(wavInfo(new ArrayBuffer(10)), null);
});

test("parseGloss reads the JSON array, even wrapped in prose", () => {
  assert.deepEqual(parseGloss('["WATER","YOU","WANT","?"]', "x"), ["WATER", "YOU", "WANT", "?"]);
  assert.deepEqual(parseGloss('Sure: ["HELLO"] done', "x"), ["HELLO"]);
});

test("parseGloss falls back to the local gloss", () => {
  assert.deepEqual(parseGloss("not json", "Um, would you like some water?"), ["WOULD", "YOU", "LIKE", "SOME", "WATER", "?"]);
  assert.deepEqual(parseGloss("[]", "hi there"), ["HI", "THERE"]);
  assert.equal(parseGloss("x", "one two three four five six seven eight nine").length, 8);
});

test("localGloss keeps the question mark inside the 8-token limit", () => {
  const g = localGloss("one two three four five six seven eight nine?");
  assert.equal(g.length, 8);
  assert.equal(g.at(-1), "?");
});

test("labelFromPath reads NSL file prefixes and ASLNow folders", () => {
  assert.equal(labelFromPath("a_frame_003778_aug1.jpg"), "A");
  assert.equal(labelFromPath("content/split_dataset/images/test/5_20260724_144141_7c8b55_000036_aug1.jpg"), "5");
  assert.equal(labelFromPath("b_Video Alphanumeric Static One_20260724_144446_84ce50_000127_aug3.jpg"), "B");
  assert.equal(labelFromPath("asl-now/B/0080e8c9-b34c-4a1d-885d-ec336790349b.json"), "B");
  assert.equal(labelFromPath(String.raw`C:\data\asl-now\z\x.json`), "Z");
  assert.equal(labelFromPath("README.md"), null);
  assert.equal(labelFromPath("photos/holiday.jpg"), null);
});

test("toPoints accepts exactly 21 finite landmarks", () => {
  const p = Array.from({ length: 21 }, (_, i) => ({ x: i / 21, y: 0.5, z: 0, visibility: 1 }));
  assert.deepEqual(toPoints(p)?.[3], { x: 3 / 21, y: 0.5, z: 0 });
  assert.equal(toPoints(p.slice(1)), null);
  assert.equal(toPoints([...p.slice(1), { x: NaN, y: 0, z: 0 }]), null);
  assert.equal(toPoints("nope"), null);
});

test("sourceKey groups frames of the same NSL video", () => {
  const a = sourceKey("b_Video Alphanumeric Static One_20260724_144446_84ce50_000127_aug3");
  const b = sourceKey("b_Video Alphanumeric Static One_20260724_144446_84ce50_000143_aug2");
  const c = sourceKey("b_Video Alphanumeric Static One_20260724_144446_ffffff_000143_aug2");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(sourceKey("a_frame_003778_aug1.jpg"), sourceKey("a_frame_000964_aug3.jpg"));
});

test("countByLabel", () => {
  assert.deepEqual(countByLabel([{ label: "A" }, { label: "B" }, { label: "A" }]), { A: 2, B: 1 });
});

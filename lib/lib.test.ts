// Run: npm test (Node's built-in test runner; no test framework needed)
import assert from "node:assert/strict";
import { test } from "node:test";
import { capFor, COST, HARD_CAP_USD, SAM_CAP_USD, transcribeCost } from "./budget.ts";
import { classify, features } from "./classify.ts";
import { countByLabel, labelFromPath, sourceKey, toPoints } from "./dataset.ts";
import { createSpeller, GAP_MS, HOLD_MS, SENTENCE_GAP_MS } from "./speller.ts";
import { encodeWav, resample } from "./wavEncode.ts";
import { describeSpelled, isSpelled, localGloss, parseGlossReply } from "./gloss.ts";
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

// A synthetic hand: wrist at origin, five straight fingers; `curl` folds finger tips toward the palm.
function hand(curl: number[], angle = 0, scale = 0.2, dx = 0.5, mirror = false) {
  const pts = [{ x: 0, y: 0, z: 0 }];
  for (let f = 0; f < 5; f++) {
    const base = (f - 2) * 0.25;
    for (let j = 1; j <= 4; j++) {
      const reach = j * (1 - curl[f] * (j / 4));
      pts.push({ x: Math.sin(base) * reach, y: -Math.cos(base) * reach, z: 0 });
    }
  }
  return pts.map((p) => {
    const x = p.x * Math.cos(angle) - p.y * Math.sin(angle), y = p.x * Math.sin(angle) + p.y * Math.cos(angle);
    return { x: dx + (mirror ? -x : x) * scale * 0.25, y: 0.6 + y * scale * 0.25, z: 0 };
  });
}

test("features ignore position, size and mirroring", () => {
  const a = features(hand([0, 1, 1, 1, 1]), 1);
  const b = features(hand([0, 1, 1, 1, 1], 0, 0.35, 0.3, true), 1);
  assert.equal(a.length, 212);
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `feature ${i}`));
});

test("features tell an upright hand from a sideways one", () => {
  const up = features(hand([0, 0, 1, 1, 1]), 1);
  const side = features(hand([0, 0, 1, 1, 1], Math.PI / 2), 1);
  assert.ok(Math.abs(up[210] - side[210]) > 1);
});

test("classify picks the nearest shapes and returns normalised top-3", () => {
  const model = {
    labels: ["A", "A", "B", "B", "U", "U"],
    X: [hand([1, 1, 1, 1, 1]), hand([0.9, 1, 1, 1, 1]), hand([0, 0, 0, 0, 0]), hand([0.1, 0, 0, 0, 0]),
      hand([1, 0, 0, 1, 1]), hand([1, 0.1, 0, 1, 1])].map((h) => features(h, 1)),
  };
  const top = classify(model, features(hand([0.05, 0, 0, 0, 0], 0, 0.3, 0.2), 1), 5);
  assert.equal(top[0].letter, "B");
  assert.ok(Math.abs(top.reduce((s, g) => s + g.p, 0) - 1) < 1e-9);
  assert.equal(classify(model, features(hand([1, 0, 0.05, 1, 1]), 1), 3)[0].letter, "U");
});

test("speller commits a held letter once and ends the word after a gap", () => {
  const push = createSpeller();
  const g = (letter: string, p = 0.9) => [{ letter, p }, { letter: "X", p: 0.1 }];
  assert.deepEqual(push(0, g("H")), {});
  assert.equal(push(HOLD_MS, g("H")).letter?.[0].letter, "H");
  assert.deepEqual(push(HOLD_MS + 100, g("H")), {}); // still held: no repeat
  push(HOLD_MS + 200, g("I", 0.3)); // unsure: ignored
  push(HOLD_MS + 300, g("I"));
  assert.equal(push(2 * HOLD_MS + 300, g("I")).letter?.[0].letter, "I");
  assert.deepEqual(push(2 * HOLD_MS + 400, null), {});
  const end = push(2 * HOLD_MS + 300 + GAP_MS, null);
  assert.deepEqual(end.word?.map((pos) => pos[0].letter), ["H", "I"]);
  assert.deepEqual(push(9999, null), { sentenceEnd: true }); // a long pause closes the sentence
  assert.deepEqual(push(19999, null), {}); // nothing pending after that
});

test("encodeWav output passes the server's WAV validation", () => {
  const wav = encodeWav(new Float32Array(16000).map((_, i) => Math.sin(i / 10)), 16000);
  assert.deepEqual(wavInfo(wav), { sampleRate: 16000, bytes: 44 + 32000 });
  assert.equal(new DataView(wav).getInt16(44 + 2 * 5, true), Math.trunc(Math.sin(0.5) * 0x7fff));
});

test("resample keeps duration and shape", () => {
  const sr = 48000, tone = new Float32Array(sr).map((_, i) => Math.sin((2 * Math.PI * 100 * i) / sr));
  const out = resample(tone, sr, 16000);
  assert.equal(out.length, 16000);
  assert.ok(Math.abs(out[40] - Math.sin((2 * Math.PI * 100 * 40) / 16000)) < 1e-3);
  assert.equal(resample(tone, 16000, 16000), tone);
});

test("speller: classifier flicker never repeats a letter (the OOOOO bug)", () => {
  const push = createSpeller();
  const g = (letter: string, p = 0.9) => [{ letter, p }];
  let t = 0, committed = 0;
  // O held, with an unsure frame and a brief wrong guess in between, five times over
  for (let k = 0; k < 5; k++) {
    for (const guess of [g("O"), g("O"), g("Q", 0.3), g("Q"), g("O"), g("O")]) {
      if (push((t += HOLD_MS / 2), guess).letter) committed++;
    }
  }
  assert.equal(committed, 1);
});

test("speller: lowering the hand allows the same letter again (double letters)", () => {
  const push = createSpeller();
  const g = [{ letter: "L", p: 0.9 }];
  push(0, g);
  assert.equal(push(HOLD_MS, g).letter?.[0].letter, "L");
  push(HOLD_MS + 50, null); // hand down briefly, shorter than the word gap
  push(HOLD_MS + 100, g);
  assert.equal(push(2 * HOLD_MS + 100, g).letter?.[0].letter, "L");
});


test("isLanguage accepts only the supported translation targets", async () => {
  const { isLanguage } = await import("./languages.ts");
  for (const ok of ["en", "yo", "ha", "ig", "pcm", "fr"]) assert.equal(isLanguage(ok), true, ok);
  for (const bad of ["xx", "", "toString", "__proto__", 3, null]) assert.equal(isLanguage(bad), false, String(bad));
});

test("speller groups words into a sentence that ends after a longer pause", () => {
  const push = createSpeller();
  const hold = (t: number, letter: string) => { push(t, [{ letter, p: 0.9 }]); return push(t + HOLD_MS, [{ letter, p: 0.9 }]); };
  let t = 0;
  const events: string[] = [];
  const log = (e: ReturnType<typeof push>) => { if (e.word) events.push("word:" + e.word.map((p) => p[0].letter).join("")); if (e.sentenceEnd) events.push("end"); };
  hold(t, "N"); t += HOLD_MS + 50;
  hold(t, "O"); t += HOLD_MS;
  log(push(t + 100, null)); log(push(t + GAP_MS, null)); // word NO finished
  t += GAP_MS + 400;
  hold(t, "Y"); t += HOLD_MS; // hand back up within the sentence gap: same sentence
  log(push(t + GAP_MS, null)); // word Y
  log(push(t + GAP_MS + 500, null)); // not yet a sentence end
  log(push(t + SENTENCE_GAP_MS, null)); // sentence ends
  log(push(t + SENTENCE_GAP_MS + 5000, null)); // and only once
  assert.deepEqual(events, ["word:NO", "word:Y", "end"]);
});

test("parseGlossReply reads english + gloss, even wrapped in prose", () => {
  const r = parseGlossReply('Here: {"english":"Do you want water?","gloss":["YOU","WANT","WATER","?"]}', "Abeg you want water?");
  assert.deepEqual(r, { english: "Do you want water?", gloss: ["YOU", "WANT", "WATER", "?"] });
});

test("parseGlossReply falls back to the words as spoken", () => {
  assert.deepEqual(parseGlossReply("not json", "Um, would you like some water?"), {
    english: "Um, would you like some water?", gloss: ["WOULD", "YOU", "LIKE", "SOME", "WATER", "?"],
  });
  // english present but gloss broken: gloss is rebuilt from the English, not the Pidgin
  assert.deepEqual(parseGlossReply('{"english":"I am fine.","gloss":"x"}', "I dey fine"), { english: "I am fine.", gloss: ["I", "FINE"] });
});

test("isSpelled accepts the deaf side's letters and rejects bad input", () => {
  const ok = [[[{ letter: "Y", p: 0.9 }], [{ letter: "O", p: 0.8 }, { letter: "E", p: 0.1 }]]];
  assert.equal(isSpelled(ok), true);
  assert.equal(isSpelled([]), false);
  assert.equal(isSpelled([[[]]]), false);
  assert.equal(isSpelled([[[{ letter: "TOOLONG", p: 1 }]]]), false);
  assert.equal(isSpelled(Array(13).fill(ok[0])), false);
  assert.equal(isSpelled("YO"), false);
});

test("describeSpelled keeps signing order and alternatives", () => {
  assert.equal(
    describeSpelled([[[{ letter: "H", p: 0.9 }], [{ letter: "I", p: 0.7 }, { letter: "J", p: 0.2 }]], [[{ letter: "U", p: 1 }]]]),
    ["1: H 90% | I 70%, J 20%", "2: U 100%"].join("\n"),
  );
});

test("calendar invites carry the link, UTC times and escaped text", async () => {
  const { googleCalendarUrl, icsFile } = await import("./invite.ts");
  const i = { title: "Clinic, intake; room 2", start: new Date("2026-11-05T09:30:00Z"), minutes: 30, link: "https://x.test/call?room=abc123" };
  const ics = icsFile(i, "abc123");
  assert.match(ics, /DTSTART:20261105T093000Z\r\nDTEND:20261105T100000Z/);
  assert.ok(ics.includes("SUMMARY:Clinic\\, intake\\; room 2"));
  const g = new URL(googleCalendarUrl(i));
  assert.equal(g.searchParams.get("dates"), "20261105T093000Z/20261105T100000Z");
  assert.match(g.searchParams.get("details")!, /room=abc123/);
});

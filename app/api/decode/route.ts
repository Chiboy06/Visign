import { COST, reserve } from "@/lib/budget";
import { bad, jsonBody } from "@/lib/http";
import { reordersLetters } from "@/lib/gloss";
import { spark } from "@/lib/meta";

const INSTRUCTIONS = `You decode noisy fingerspelling into words during a live conversation.
For each position you get the classifier's top guesses with confidence. Similar handshapes are often confused (A/E/S/T/M/N, U/V, K/P).
Use the recent conversation to pick the most likely intended words. Prefer real words that fit the context.
Only fix what the guesses support: swap a letter for one of its listed alternatives, or restore one doubled letter (HELO -> HELLO).
If no real word fits within those fixes, output the top-guess letters unchanged. Never invent a word the letters don't support.
Output ONLY the decoded text, nothing else.`;

type Guess = { letter: string; p: number };

export async function POST(req: Request) {
  const body = await jsonBody(req, 16_000);
  const letters = body?.letters;
  if (!Array.isArray(letters) || letters.length === 0 || letters.length > 40) return bad("letters must be 1-40 positions");
  const valid = letters.every(
    (pos) => Array.isArray(pos) && pos.length > 0 && pos.length <= 3 &&
      pos.every((g: Guess) => typeof g?.letter === "string" && g.letter.length <= 2 && typeof g?.p === "number"),
  );
  if (!valid) return bad("each position is 1-3 {letter, p} guesses");
  const context = Array.isArray(body?.context) ? body.context.filter((c) => typeof c === "string").slice(-4) : [];

  // Raw best guesses: what we show if the decoder is unavailable.
  const raw = (letters as Guess[][]).map((pos) => pos[0].letter).join("");
  if (!(await reserve("decode", COST.text, req.headers.get("x-session-id") ?? undefined)))
    return Response.json({ text: raw, degraded: true });
  try {
    const positions = (letters as Guess[][])
      .map((pos, i) => `${i + 1}: ${pos.map((g) => `${g.letter} ${Math.round(g.p * 100)}%`).join(", ")}`)
      .join("\n");
    const text = await spark(INSTRUCTIONS, `Recent conversation:\n${context.join("\n") || "(none)"}\n\nLetters:\n${positions}`);
    // Never show letters in an order the person didn't sign (the model sometimes "fixes" IH into HI).
    return Response.json({ text: text && !reordersLetters(raw, text) ? text : raw });
  } catch (e) {
    console.error(e);
    return Response.json({ text: raw, degraded: true });
  }
}

import { COST, reserve } from "@/lib/budget";
import { describeSpelled, isSpelled } from "@/lib/gloss";
import { bad, jsonBody, str } from "@/lib/http";
import { isLanguage, LANGUAGES } from "@/lib/languages";
import { spark } from "@/lib/meta";

// One Muse Spark call per signed sentence: fix misread letters, build the sentence, write it in the reader's language.
export async function POST(req: Request) {
  const body = await jsonBody(req, 16_000);
  const text = str(body?.text, 1_000);
  if (!text) return bad("text is required (1-1000 chars)");
  if (!isLanguage(body?.to)) return bad(`to must be one of: ${Object.keys(LANGUAGES).join(", ")}`);
  const spelled = isSpelled(body?.spelled) ? body.spelled : null; // absent for typed messages
  const context = Array.isArray(body?.context) ? body.context.filter((c) => typeof c === "string").slice(-4) : [];

  // On any failure the hearing person still reads the words as spelled.
  if (!(await reserve("translate", COST.text, req.headers.get("x-session-id") ?? undefined)))
    return Response.json({ text, degraded: true });
  try {
    const name = LANGUAGES[body.to].name;
    const input = spelled
      ? `Spelled words (letters in signing order; each letter lists the classifier's guesses, best first):\n${describeSpelled(spelled)}\nBest guess: ${text}`
      : `Typed: ${text}`;
    const out = await spark(
      `A deaf person fingerspelled (or typed) a message in a live conversation. Signed English drops small words.
Similar handshapes get misread (A/E/S/T/M/N, U/V, K/P); you may swap a letter for one of its listed guesses, or restore one doubled letter (HELO -> HELLO), to make a real word that fits the conversation. Never reorder letters or words.
Write the message as ONE short natural sentence in ${name}. You may add small grammar words (do, the, is, a) and punctuation. Never add meaning that wasn't signed. Keep names and numbers. A single word stays a single word ("YES" -> "Yes.").
Output ONLY the sentence.`,
      `Recent conversation:\n${context.join("\n") || "(none)"}\n\n${input}`,
      12_000, // reading can wait longer than the live avatar
    );
    return Response.json({ text: out || text });
  } catch (e) {
    console.error(e);
    return Response.json({ text, degraded: true });
  }
}

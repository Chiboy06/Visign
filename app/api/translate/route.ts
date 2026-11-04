import { COST, reserve } from "@/lib/budget";
import { bad, jsonBody, str } from "@/lib/http";
import { isLanguage, LANGUAGES } from "@/lib/languages";
import { spark } from "@/lib/meta";

export async function POST(req: Request) {
  const body = await jsonBody(req, 4_000);
  const text = str(body?.text, 1_000);
  if (!text) return bad("text is required (1-1000 chars)");
  if (!isLanguage(body?.to)) return bad(`to must be one of: ${Object.keys(LANGUAGES).join(", ")}`);
  // Turns the words a deaf person spelled into one natural sentence in the hearing person's language.
  // On any failure the hearing person still reads the words as spelled.
  if (!(await reserve("translate", COST.text, req.headers.get("x-session-id") ?? undefined)))
    return Response.json({ text, degraded: true });
  try {
    const name = LANGUAGES[body.to].name;
    const out = await spark(
      `A deaf person fingerspelled these words, in this order, during a live conversation. Signed English drops small words.
Write what they mean as ONE short natural sentence in ${name}. You may add small grammar words (do, the, is, a) and punctuation.
Never add meaning they didn't spell. Keep names and numbers. A single word stays a single word, e.g. "YES" becomes "Yes."
Output ONLY the sentence.`,
      text,
      12_000, // reading a translation can wait longer than the live avatar
    );
    return Response.json({ text: out || text });
  } catch (e) {
    console.error(e);
    return Response.json({ text, degraded: true });
  }
}

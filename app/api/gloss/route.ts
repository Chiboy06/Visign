import { COST, reserve } from "@/lib/budget";
import { localGloss, parseGloss } from "@/lib/gloss";
import { bad, jsonBody, str } from "@/lib/http";
import { spark } from "@/lib/meta";

const INSTRUCTIONS = `You convert spoken English into Nigerian Sign Language gloss for a fingerspelling avatar.
Fingerspelling is slow, so keep only the words that carry meaning.
Rules: drop fillers (um, like, you know), articles, and forms of "to be". Keep question words, negation, names and numbers.
Use sign-language order: topic first, question word last. At most 8 tokens.
Output ONLY a JSON array of uppercase tokens, e.g. ["WATER","YOU","WANT","?"]. Use "?" as its own token for questions.`;

export async function POST(req: Request) {
  const body = await jsonBody(req, 8_000);
  const text = str(body?.text, 1_000);
  if (!text) return bad("text is required (1-1000 chars)");
  const context = Array.isArray(body?.context) ? body.context.filter((c) => typeof c === "string").slice(-4) : [];

  // Budget or Meta trouble never blocks the avatar: answer with the local gloss instead.
  if (!(await reserve("gloss", COST.text, req.headers.get("x-session-id") ?? undefined)))
    return Response.json({ gloss: localGloss(text), degraded: true });
  try {
    const prompt = context.length ? `Recent conversation:\n${context.join("\n")}\n\nConvert: ${text}` : `Convert: ${text}`;
    const raw = await spark(INSTRUCTIONS, prompt);
    return Response.json({ gloss: parseGloss(raw, text) });
  } catch (e) {
    console.error(e);
    return Response.json({ gloss: localGloss(text), degraded: true });
  }
}

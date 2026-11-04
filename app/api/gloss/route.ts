import { COST, reserve } from "@/lib/budget";
import { localGloss, parseGlossReply } from "@/lib/gloss";
import { bad, jsonBody, str } from "@/lib/http";
import { spark } from "@/lib/meta";

const INSTRUCTIONS = `A hearing person just spoke to a deaf person. The words may be English, Nigerian Pidgin, or a mix.
Return JSON with two fields:
"english": what they said as one plain, natural English sentence, so the deaf person can read it (translate Pidgin to standard English; keep the meaning exactly).
"gloss": the same English for a fingerspelling avatar: uppercase words, keep only words that carry meaning (drop fillers, articles and forms of "to be"; keep question words, negation, names, numbers), in the same order, at most 8, with "?" as its own token for questions.
Example: "Abeg you want water?" -> {"english":"Do you want water?","gloss":["YOU","WANT","WATER","?"]}
Output ONLY the JSON.`;

export async function POST(req: Request) {
  const body = await jsonBody(req, 8_000);
  const text = str(body?.text, 1_000);
  if (!text) return bad("text is required (1-1000 chars)");
  const context = Array.isArray(body?.context) ? body.context.filter((c) => typeof c === "string").slice(-4) : [];

  // Budget or Meta trouble never blocks the avatar: answer with the words as spoken and the local gloss.
  if (!(await reserve("gloss", COST.text, req.headers.get("x-session-id") ?? undefined)))
    return Response.json({ english: text, gloss: localGloss(text), degraded: true });
  try {
    const prompt = context.length ? `Recent conversation:\n${context.join("\n")}\n\nThey said: ${text}` : `They said: ${text}`;
    return Response.json(parseGlossReply(await spark(INSTRUCTIONS, prompt), text));
  } catch (e) {
    console.error(e);
    return Response.json({ english: text, gloss: localGloss(text), degraded: true });
  }
}

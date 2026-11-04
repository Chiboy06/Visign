import { COST, reserve } from "@/lib/budget";
import { bad, jsonBody, str } from "@/lib/http";
import { isLanguage, LANGUAGES } from "@/lib/languages";
import { spark } from "@/lib/meta";

export async function POST(req: Request) {
  const body = await jsonBody(req, 4_000);
  const text = str(body?.text, 1_000);
  if (!text) return bad("text is required (1-1000 chars)");
  if (!isLanguage(body?.to)) return bad(`to must be one of: ${Object.keys(LANGUAGES).join(", ")}`);
  if (body.to === "en") return Response.json({ text });

  // On any failure the hearing person still reads the original English.
  if (!(await reserve("translate", COST.text, req.headers.get("x-session-id") ?? undefined)))
    return Response.json({ text, degraded: true });
  try {
    const name = LANGUAGES[body.to].name;
    const out = await spark(
      `Translate the message into ${name}. It was fingerspelled by a deaf person in a live conversation. Keep names and numbers. Output ONLY the translation.`,
      text,
      12_000, // reading a translation can wait longer than the live avatar
    );
    return Response.json({ text: out || text });
  } catch (e) {
    console.error(e);
    return Response.json({ text, degraded: true });
  }
}

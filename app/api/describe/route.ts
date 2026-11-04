// POST /api/describe: one camera photo described for a blind or low-vision listener (Muse Spark vision).
import { COST, reserve } from "@/lib/budget";
import { bad, jsonBody } from "@/lib/http";
import { isLanguage, LANGUAGES } from "@/lib/languages";
import { spark } from "@/lib/meta";

const MAX_IMAGE = 400_000; // one 640 px JPEG from the call camera is ~60-120 KB as base64

// "Describe what's around me": one camera photo, described by Muse Spark for a blind or low-vision person.
export async function POST(req: Request) {
  const body = await jsonBody(req, MAX_IMAGE + 1_000);
  const image = body?.image;
  if (typeof image !== "string" || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image))
    return bad(`image must be a JPEG, PNG or WebP data URL under ${MAX_IMAGE / 1000} KB`);
  const lang = isLanguage(body?.lang) ? body.lang : "en";

  if (!(await reserve("describe", COST.vision, req.headers.get("x-session-id") ?? undefined)))
    return Response.json({ degraded: true, reason: "budget" }, { status: 503 });
  try {
    const text = await spark(
      `You describe a camera photo for a blind or low-vision person, to be read aloud.
Say first anything urgent: hazards, steps, traffic, fire. Then people and what they are doing (say if someone is signing or waving at the camera), then readable text, then the setting.
2 or 3 short sentences in ${LANGUAGES[lang].name}. Plain words, no lists. Never guess anyone's identity, age, race or health. If the photo is too dark or blurry, say so.`,
      "Describe this photo.",
      15_000,
      image,
    );
    if (!text) throw new Error("empty description");
    return Response.json({ text });
  } catch (e) {
    console.error(e);
    return Response.json({ degraded: true, reason: "unavailable" }, { status: 503 });
  }
}

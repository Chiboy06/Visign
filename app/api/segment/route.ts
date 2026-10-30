import { COST, reserve } from "@/lib/budget";
import { bad, degraded, jsonBody } from "@/lib/http";
import { segment } from "@/lib/meta";

// Hand crops only (MediaPipe box, ~224 px, ~10 KB). Full frames took 27-31 s from Lagos vs 4-8 s for a crop.
const MAX_IMAGE_CHARS = 60_000; // ~45 KB JPEG once base64-encoded

export async function POST(req: Request) {
  const body = await jsonBody(req, MAX_IMAGE_CHARS + 1_000);
  const image = body?.image;
  if (typeof image !== "string" || !image.startsWith("data:image/jpeg;base64,") || image.length > MAX_IMAGE_CHARS)
    return bad("image must be a JPEG hand crop under 45 KB");

  if (!(await reserve("segment", COST.segment, req.headers.get("x-session-id") ?? undefined))) return degraded("budget");
  try {
    return Response.json({ sam: await segment(image) });
  } catch (e) {
    console.error(e);
    return degraded("meta");
  }
}

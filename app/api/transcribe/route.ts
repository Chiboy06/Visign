import { reserve, transcribeCost } from "@/lib/budget";
import { bad, degraded } from "@/lib/http";
import { transcribe } from "@/lib/meta";
import { wavInfo } from "@/lib/wav";

const MAX_BYTES = 2_000_000; // ~60 s at 16 kHz; one utterance, not a whole call

export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) return bad("audio too large");
  const buf = await req.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return bad("audio too large");
  const info = wavInfo(buf);
  if (!info) return bad("audio must be mono 16-bit WAV at 16 or 24 kHz");

  const cost = transcribeCost(info.bytes, info.sampleRate);
  if (!(await reserve("transcribe", cost, req.headers.get("x-session-id") ?? undefined))) return degraded("budget");
  try {
    return Response.json({ text: await transcribe(new Blob([buf], { type: "audio/wav" })) });
  } catch (e) {
    console.error(e);
    return degraded("meta");
  }
}

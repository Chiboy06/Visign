// Thin fetch wrappers for Meta Model API. No SDK: three endpoints don't justify one.
const BASE = "https://api.meta.ai/v1";
// Spark measured 2.8-16 s from Lagos (Oct 29), mostly reasoning tokens plus ~1-2 s network.
// Past the deadline the routes fall back to on-device/local results instead of making people wait.
const SPARK_DEADLINE_MS = 6000;
const DEFAULT_TIMEOUT_MS = 10000;

const auth = () => ({ Authorization: `Bearer ${process.env.MODEL_API_KEY}` });

async function post(path: string, body: BodyInit, headers: Record<string, string> = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { ...auth(), ...headers },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Meta ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res;
}

type ResponsesOutput = { output?: { type: string; content?: { type: string; text?: string }[] }[] };

const outputText = (r: ResponsesOutput) =>
  (r.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("");

/** Muse Spark 1.3, Standard mode (prompts are not used for training). `image`: optional data URL to look at. */
export async function spark(instructions: string, text: string, deadlineMs = SPARK_DEADLINE_MS, image?: string) {
  const res = await post(
    "/responses",
    JSON.stringify({
      model: "muse-spark-1.3",
      instructions,
      input: [{ role: "user", content: [{ type: "input_text", text }, ...(image ? [{ type: "input_image", image_url: image }] : [])] }],
      reasoning: { effort: "minimal" }, // "none" is rejected for Muse Spark (HTTP 400)
      store: false,
    }),
    { "Content-Type": "application/json" },
    deadlineMs,
  );
  return outputText(await res.json()).trim();
}

/** SAM 3.1 on one still hand crop. Returns SAM's raw text grammar. Speed-tested; not yet used in the live call. */
export async function segment(imageDataUrl: string, prompt = "hand") {
  const res = await post(
    "/responses",
    JSON.stringify({
      model: "sam-3.1",
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: imageDataUrl },
          ],
        },
      ],
    }),
    { "Content-Type": "application/json" },
  );
  return outputText(await res.json());
}

/** Muse Voice Transcribe on one WAV utterance (the realtime socket would need the key in the browser). */
export async function transcribe(wav: Blob) {
  const form = new FormData();
  form.append(
    "request",
    new Blob(
      [JSON.stringify({ model: "muse-voice-transcribe-1.0", audioEncoding: "WAV", mode: "PUSH_TO_TALK", languageBias: ["English"] })],
      { type: "application/json" },
    ),
  );
  form.append("audio", wav, "utterance.wav");
  const res = await post("/asr/transcribe", form, { Accept: "application/json" });
  return ((await res.json()) as { transcript: string }).transcript.trim();
}

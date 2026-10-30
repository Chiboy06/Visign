import { createClient } from "@supabase/supabase-js";

// Hard cap is half the $150 credits; SAM stops earlier so text keeps working ("cheap mode").
export const HARD_CAP_USD = 75;
export const SAM_CAP_USD = 60;

// Official Meta prices (dev.meta.ai, Oct 2026).
export const COST = {
  segment: 0.0025, // SAM 3.1, per image
  text: 0.002, // Muse Spark flat reservation; short prompts cost ~$0.0005
  transcribePerSecond: 3 / 1000 / 60, // $3 per 1,000 minutes
};

export const capFor = (endpoint: string) => (endpoint === "segment" ? SAM_CAP_USD : HARD_CAP_USD);

// 16-bit mono PCM WAV: bytes / (sampleRate * 2). Round up to a whole second so tiny clips aren't free.
export function transcribeCost(wavBytes: number, sampleRate: number) {
  return Math.ceil(wavBytes / (sampleRate * 2)) * COST.transcribePerSecond;
}

const db = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

/** Returns true when the spend was recorded under the cap. Fails closed if the DB is unreachable. */
export async function reserve(endpoint: string, cost: number, sessionId?: string) {
  const { data, error } = await db().rpc("reserve_spend", {
    p_endpoint: endpoint,
    p_cost: cost,
    p_cap: capFor(endpoint),
    p_session: sessionId ?? null,
  });
  if (error) console.error("reserve_spend failed", error.message);
  return !error && data !== null;
}

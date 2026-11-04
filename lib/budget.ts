// Spend guard: every paid Meta call first reserves its cost in Postgres (Supabase) and is refused past the cap.
// Server-only: uses SUPABASE_SECRET_KEY.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Hard cap is half the $150 credits; SAM stops earlier so text keeps working ("cheap mode").
export const HARD_CAP_USD = 75;
export const SAM_CAP_USD = 60;

// Official Meta prices (dev.meta.ai, Oct 2026).
export const COST = {
  segment: 0.0025, // SAM 3.1, per image
  vision: 0.01, // Muse Spark with one ~640 px photo; image tokens priced conservatively
  text: 0.004, // Muse Spark: up to ~840 output (mostly reasoning) tokens measured = ~$0.0038, so the cap holds
  transcribePerSecond: 3 / 1000 / 60, // $3 per 1,000 minutes
};

export const capFor = (endpoint: string) => (endpoint === "segment" ? SAM_CAP_USD : HARD_CAP_USD);

// 16-bit mono PCM WAV: bytes / (sampleRate * 2). Round up to a whole second so tiny clips aren't free.
export function transcribeCost(wavBytes: number, sampleRate: number) {
  return Math.ceil(wavBytes / (sampleRate * 2)) * COST.transcribePerSecond;
}

let client: SupabaseClient | null = null;
const db = () =>
  (client ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
    // A stalled budget check must fail closed quickly, not hang the request (and a deaf person's sentence).
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5_000) }) },
  }));

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

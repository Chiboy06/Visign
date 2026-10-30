// Shared responses so every client (web, Android, glasses) sees the same error shape.
export const bad = (message: string) => Response.json({ error: message }, { status: 400 });

// Budget refused or Meta failed: the client falls back to on-device only.
export const degraded = (reason: string) => Response.json({ degraded: true, reason }, { status: 503 });

export async function jsonBody(req: Request, maxBytes: number) {
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) return null;
  const text = await req.text();
  if (text.length > maxBytes) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const str = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);

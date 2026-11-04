// GET /api/health: liveness check for uptime monitors. No secrets, no database call.
export function GET() {
  return Response.json({ ok: true });
}

import { AccessToken } from "livekit-server-sdk";
import { bad, jsonBody, str } from "@/lib/http";

const ROOM = /^[a-z0-9-]{4,40}$/;

export async function POST(req: Request) {
  const body = await jsonBody(req, 1_000);
  const room = str(body?.room, 40);
  const role = body?.role;
  if (!room || !ROOM.test(room)) return bad("room must be 4-40 lowercase letters, digits or dashes");
  if (role !== "hearing" && role !== "deaf") return bad("role must be hearing or deaf");

  const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity: `${role}-${crypto.randomUUID().slice(0, 8)}`,
    attributes: { role },
    ttl: "1h",
  });
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });
  return Response.json({ token: await at.toJwt(), url: process.env.LIVEKIT_URL });
}

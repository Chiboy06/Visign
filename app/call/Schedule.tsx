"use client";

// Lobby card: schedule a call for later. Makes a room link plus Google Calendar and .ics invites; no server needed.
import { useEffect, useState } from "react";
import { googleCalendarUrl, icsFile, type Invite } from "@/lib/invite";

const newRoomCode = () => Math.random().toString(36).slice(2, 8);
/** datetime-local wants local time without a zone: 2026-11-05T09:00 */
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/** Schedule a call for later: a fresh room link plus a calendar invite (Google, or .ics for Outlook and Apple). */
export function Schedule() {
  const [title, setTitle] = useState("Visign call");
  const [when, setWhen] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [invite, setInvite] = useState<(Invite & { code: string; ics: string }) | null>(null);
  const [copied, setCopied] = useState("");

  // Default: the next full hour. Only after mount, so the prerendered HTML matches.
  useEffect(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the local clock is only known in the browser
    setWhen(localInput(d));
  }, []);

  // The .ics download is an object URL; free it when the invite changes.
  useEffect(() => () => void (invite && URL.revokeObjectURL(invite.ics)), [invite]);

  function create(e: React.FormEvent) {
    e.preventDefault();
    const start = new Date(when);
    if (Number.isNaN(start.getTime())) return;
    const code = newRoomCode();
    const i = { title: title.trim() || "Visign call", start, minutes, link: `${location.origin}/call?room=${code}` };
    const ics = URL.createObjectURL(new Blob([icsFile(i, code)], { type: "text/calendar" }));
    setInvite({ ...i, code, ics });
    setCopied("");
  }

  const field = "mt-1 w-full min-w-0 rounded-2xl border-2 border-ink/15 bg-white px-4 py-2.5";
  return (
    <section className="min-w-0 rounded-[2rem] bg-white p-5 ring-1 ring-ink/10 sm:p-6" aria-labelledby="schedule-h">
      <h2 id="schedule-h" className="font-display text-2xl font-bold">Schedule for later</h2>
      <p className="mt-1 text-sm text-ink/70">Get a meeting link and add it to your calendar. No account needed.</p>
      <form onSubmit={create} className="mt-4 grid gap-3">
        <label className="block text-sm font-bold">
          Title
          <input className={field} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block text-sm font-bold">
            Starts
            <input type="datetime-local" required className={field} value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
          <label className="block text-sm font-bold">
            Length
            <select className={field} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </label>
        </div>
        <button className="rounded-full bg-vat py-3 font-display font-bold text-cloth hover:bg-dye">Create meeting link</button>
      </form>

      {invite && (
        <div className="mt-5 rounded-2xl bg-cloth p-4" aria-live="polite">
          <p className="font-display text-lg font-bold">{invite.title}</p>
          <p className="text-sm text-ink/70">
            {invite.start.toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })} · {invite.minutes} min · Room {invite.code}
          </p>
          <div className="mt-3 flex gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 text-sm">{invite.link}</code>
            <button
              className="rounded-lg border-2 border-ink/15 bg-white px-3 text-sm font-bold"
              onClick={() => navigator.clipboard.writeText(invite.link).then(() => setCopied("Link copied."), () => setCopied("Copy failed: select the link instead."))}
            >
              Copy
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-sm font-bold">
            <a className="rounded-full bg-ink px-4 py-2 text-cloth" href={googleCalendarUrl(invite)} target="_blank" rel="noopener noreferrer">
              Add to Google Calendar
            </a>
            <a className="rounded-full border-2 border-ink/15 bg-white px-4 py-2" href={invite.ics} download={`visign-${invite.code}.ics`}>
              Download .ics (Outlook, Apple)
            </a>
            <a className="rounded-full border-2 border-ink/15 bg-white px-4 py-2" href={`/call?room=${invite.code}`}>Open room</a>
          </div>
          <p className="mt-2 min-h-5 text-sm" role="status">{copied}</p>
        </div>
      )}
    </section>
  );
}

"use client";

import { Room, RoomEvent, Track } from "livekit-client";
import { useEffect, useRef, useState } from "react";
import { classify, features, type Guess, type Model } from "@/lib/classify";
import { toPoints, unflat, type Point } from "@/lib/dataset";
import { handLandmarker } from "@/lib/hands";
import { createSpeller } from "@/lib/speller";
import { encodeWav, resample } from "@/lib/wavEncode";
import { Avatar } from "./Avatar";

type Role = "hearing" | "deaf";
type Msg = { from: "me" | "them"; kind: "speech" | "sign"; text: string; gloss?: string[] };

const session = typeof crypto !== "undefined" ? crypto.randomUUID() : "server";
const headers = { "Content-Type": "application/json", "x-session-id": session };
const newRoomCode = () => Math.random().toString(36).slice(2, 8);

export default function CallPage() {
  const [role, setRole] = useState<Role>("hearing");
  const [roomCode, setRoomCode] = useState("");
  const [joined, setJoined] = useState(false);
  const [status, setStatus] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [letters, setLetters] = useState<Guess[][]>([]);
  const [talking, setTalking] = useState(false);
  const [typed, setTyped] = useState("");
  const [gloss, setGloss] = useState<{ id: number; tokens: string[] } | null>(null);
  const [poses, setPoses] = useState<Record<string, Point[]>>({});

  const room = useRef<Room | null>(null);
  const local = useRef<HTMLVideoElement>(null);
  const remote = useRef<HTMLVideoElement>(null);
  const model = useRef<Model | null>(null);
  const recent = useRef<string[]>([]);
  const mic = useRef<{ stop: () => Float32Array; rate: number } | null>(null);

  // Room and role come from the share link: /call?room=abc123&role=deaf
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    // URL is only known after mount; reading it during render would mismatch the prerendered HTML
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRoomCode(q.get("room") ?? newRoomCode());
    if (q.get("role") === "deaf") setRole("deaf");
  }, []);

  // Letter model and avatar poses (built by `npm run model`).
  useEffect(() => {
    fetch("/model/letters.json")
      .then((r) => r.json())
      .then((m: { samples: { l: string; a: number; p: number[] }[]; poses: Record<string, number[]> }) => {
        model.current = { labels: m.samples.map((s) => s.l), X: m.samples.map((s) => features(unflat(s.p), s.a)) };
        setPoses(Object.fromEntries(Object.entries(m.poses).map(([k, v]) => [k, unflat(v)])));
      })
      .catch(() => setStatus("Could not load the letter model."));
  }, []);

  function addMessage(m: Msg) {
    recent.current = [...recent.current, `${m.kind === "speech" ? "Hearing" : "Deaf"}: ${m.text}`].slice(-4);
    setMessages((all) => [...all, m]);
    if (m.from === "them" && m.kind === "speech" && m.gloss) setGloss({ id: Date.now(), tokens: m.gloss });
  }

  function send(m: Omit<Msg, "from">) {
    addMessage({ ...m, from: "me" });
    room.current?.localParticipant
      .publishData(new TextEncoder().encode(JSON.stringify(m)), { reliable: true })
      .catch(() => setStatus("Message not delivered: connection problem."));
  }

  async function join() {
    if (!/^[a-z0-9-]{4,40}$/.test(roomCode)) return setStatus("Room code: 4-40 lowercase letters, digits or dashes.");
    setStatus("Connecting…");
    recent.current = [];
    try {
      const res = await fetch("/api/token", { method: "POST", headers, body: JSON.stringify({ room: roomCode, role }) });
      const { token, url, error } = await res.json();
      if (!res.ok || !token || !url) throw new Error(error ?? "LiveKit is not configured on the server");
      const r = new Room({ adaptiveStream: true, dynacast: true });
      r.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Video && remote.current) track.attach(remote.current);
      });
      r.on(RoomEvent.DataReceived, (payload) => {
        try {
          addMessage({ ...JSON.parse(new TextDecoder().decode(payload)), from: "them" });
        } catch {} // ignore malformed messages from the other side
      });
      r.on(RoomEvent.ParticipantConnected, () => setStatus("The other person joined."));
      r.on(RoomEvent.ParticipantDisconnected, () => setStatus("The other person left."));
      await r.connect(url, token);
      await r.localParticipant.setCameraEnabled(true);
      const cam = r.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
      if (cam && local.current) cam.attach(local.current);
      room.current = r;
      window.history.replaceState(null, "", `/call?room=${roomCode}&role=${role}`);
      setJoined(true);
      setStatus(r.remoteParticipants.size ? "Connected." : "Waiting for the other person…");
    } catch (e) {
      setStatus(`Could not join: ${(e as Error).message}`);
    }
  }

  useEffect(() => () => void room.current?.disconnect(), []);

  // Deaf side: read signs from the local camera, commit held letters, decode each finished word.
  useEffect(() => {
    if (!joined || role !== "deaf") return;
    let frame = 0, stopped = false;
    const push = createSpeller();
    handLandmarker("VIDEO").then((detector) => {
      const tick = () => {
        if (stopped) return;
        const v = local.current;
        if (v && v.readyState >= 2 && model.current) {
          const t = performance.now();
          const points = toPoints(detector.detectForVideo(v, t).landmarks[0]);
          const top = points ? classify(model.current, features(points, v.videoWidth / v.videoHeight)) : null;
          const ev = push(t, top);
          if (ev.letter) setLetters((w) => [...w, ev.letter!]);
          if (ev.word) {
            setLetters([]);
            decodeWord(ev.word);
          }
        }
        frame = requestAnimationFrame(tick);
      };
      tick();
    });
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the loop must not restart on every render
  }, [joined, role]);

  async function decodeWord(word: Guess[][]) {
    const raw = word.map((pos) => pos[0].letter).join("");
    try {
      const res = await fetch("/api/decode", { method: "POST", headers, body: JSON.stringify({ letters: word, context: recent.current }) });
      const { text } = await res.json();
      send({ kind: "sign", text: text || raw });
    } catch {
      send({ kind: "sign", text: raw });
    }
  }

  // Hearing side: push-to-talk records one utterance as 16 kHz WAV for Muse Voice Transcribe.
  async function startTalk() {
    if (mic.current || talking) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const ctx = new AudioContext({ sampleRate: 16000 });
      const source = ctx.createMediaStreamSource(stream);
      // shortcut: ScriptProcessorNode is deprecated but works in every browser; move to an AudioWorklet if it is removed
      const node = ctx.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      source.connect(node);
      node.connect(ctx.destination);
      mic.current = {
        rate: ctx.sampleRate,
        stop: () => {
          node.disconnect();
          stream.getTracks().forEach((t) => t.stop());
          void ctx.close();
          const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
          chunks.reduce((o, c) => (all.set(c, o), o + c.length), 0);
          return all;
        },
      };
      setTalking(true);
    } catch (e) {
      setStatus(`Microphone unavailable: ${(e as Error).message}`);
    }
  }

  async function stopTalk() {
    const m = mic.current;
    mic.current = null;
    setTalking(false);
    if (!m) return;
    const samples = resample(m.stop(), m.rate, 16000);
    if (samples.length < 16000 * 0.4) return setStatus("Too short: hold the button while you speak.");
    setStatus("Transcribing…");
    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "audio/wav", "x-session-id": session },
        body: encodeWav(samples, 16000),
      });
      const { text, degraded } = await res.json();
      if (!text) return setStatus(degraded ? "Transcription unavailable right now: type instead." : "Didn't catch that.");
      setStatus("");
      await speak(text);
    } catch {
      setStatus("Transcription failed: type instead.");
    }
  }

  async function speak(text: string) {
    let tokens: string[] | undefined;
    try {
      const res = await fetch("/api/gloss", { method: "POST", headers, body: JSON.stringify({ text, context: recent.current }) });
      tokens = (await res.json()).gloss;
    } catch {} // the avatar side falls back to fingerspelling the words
    send({ kind: "speech", text, gloss: tokens ?? text.toUpperCase().split(/\s+/) });
  }

  function submitTyped(e: React.FormEvent) {
    e.preventDefault();
    const text = typed.trim();
    if (!text) return;
    setTyped("");
    if (role === "hearing") void speak(text);
    else send({ kind: "sign", text });
  }

  const shareLink = typeof location !== "undefined" ? `${location.origin}/call?room=${roomCode}&role=${role === "hearing" ? "deaf" : "hearing"}` : "";

  if (!joined) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-2xl font-semibold">Join a Visign call</h1>
        <fieldset className="mt-6">
          <legend className="text-sm font-medium">I am…</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["hearing", "deaf"] as const).map((r) => (
              <label key={r} className={`cursor-pointer rounded border p-3 text-center ${role === r ? "border-black bg-black text-white" : ""}`}>
                <input type="radio" name="role" className="sr-only" checked={role === r} onChange={() => setRole(r)} />
                {r === "hearing" ? "Hearing: I speak" : "Deaf: I sign"}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="mt-4 flex flex-col text-sm">
          Room code
          <input className="mt-1 rounded border px-2 py-1 font-mono" value={roomCode} onChange={(e) => setRoomCode(e.target.value.toLowerCase())} />
        </label>
        <button className="mt-4 w-full rounded bg-black py-3 text-white" onClick={join}>Join call</button>
        <p className="mt-3 break-all text-xs text-neutral-600">Send the other person: {shareLink}</p>
        <p className="mt-3 text-sm" role="status">{status}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 p-3 sm:p-6">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div className="relative overflow-hidden rounded bg-neutral-900">
          <video ref={remote} autoPlay playsInline className="aspect-video w-full object-cover" aria-label="Other person's video" />
          <video ref={local} autoPlay playsInline muted className="absolute bottom-2 right-2 w-1/4 -scale-x-100 rounded border border-white" aria-label="Your camera" />
        </div>
        {role === "deaf" && <Avatar poses={poses} gloss={gloss} />}
      </div>

      {role === "deaf" && (
        <p className="font-mono text-2xl tracking-widest" aria-live="polite">
          {letters.map((pos) => pos[0].letter).join(" ") || <span className="text-base text-neutral-500">Sign a letter and hold it…</span>}
        </p>
      )}

      <ol className="max-h-64 space-y-1 overflow-auto rounded border p-3 text-lg" role="log" aria-live="polite" aria-label="Conversation">
        {messages.map((m, i) => (
          <li key={i} className={m.from === "me" ? "text-neutral-500" : "font-medium"}>
            <span className="text-xs uppercase">{m.from === "me" ? "You" : "Them"} · {m.kind === "speech" ? "spoke" : "signed"}</span> {m.text}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        {role === "hearing" && (
          <button
            className={`rounded px-5 py-3 text-white ${talking ? "bg-red-600" : "bg-black"}`}
            onPointerDown={startTalk} onPointerUp={stopTalk} onPointerLeave={() => talking && stopTalk()}
            onKeyDown={(e) => e.key === " " && !e.repeat && startTalk()} onKeyUp={(e) => e.key === " " && stopTalk()}
          >
            {talking ? "Listening… release to send" : "Hold to speak"}
          </button>
        )}
        <form onSubmit={submitTyped} className="flex flex-1 gap-2">
          <input className="min-w-0 flex-1 rounded border px-3 py-2" placeholder="Or type a message" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type a message" />
          <button className="rounded border px-4">Send</button>
        </form>
      </div>
      <p className="text-sm text-neutral-600" role="status">{status}</p>
    </main>
  );
}

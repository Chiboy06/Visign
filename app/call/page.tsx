"use client";

// The call: lobby (join or schedule) and the in-call screen, for both roles.
//
// How a message flows:
//   Hearing: hold to speak -> startTalk/stopTalk (WAV) -> /api/transcribe -> speak() -> /api/gloss
//            -> send() over the LiveKit data channel -> the deaf side shows English + avatar.
//   Deaf:    camera -> detection loop (MediaPipe hand + k-NN letters) -> speller -> addWord/sendSentence
//            -> send() -> the hearing side runs readOut() -> /api/translate -> read aloud.
// Video goes through LiveKit; messages are JSON over its reliable data channel. Each tab is one participant.
import { Room, RoomEvent, Track, type RemoteVideoTrack } from "livekit-client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { classify, features, type Guess, type Model } from "@/lib/classify";
import { toPoints, unflat, type Point } from "@/lib/dataset";
import { loadPoses } from "@/lib/handArt";
import { drawHand, handLandmarker } from "@/lib/hands";
import { createSpeller, MIN_P } from "@/lib/speller";
import { encodeWav, resample } from "@/lib/wavEncode";
import { isLanguage, LANGUAGES, type LanguageCode } from "@/lib/languages";
import { Avatar } from "./Avatar";
import { LanguagePicker } from "./LanguagePicker";
import { Schedule } from "./Schedule";

type Role = "hearing" | "deaf";
// `translation`: what the reader sees (English for the deaf side, the chosen language for the hearing side).
// `spelled`: the deaf side's letters with the classifier's alternatives, so Muse Spark can fix misreads.
type Msg = { from: "me" | "them"; kind: "speech" | "sign" | "scene"; text: string; gloss?: string[]; translation?: string; spelled?: Guess[][][]; who?: string };
// `who`: optional display name from the join screen. It travels in messages only, never in LiveKit identities (those get logged).

const session = typeof crypto !== "undefined" ? crypto.randomUUID() : "server";
const headers = { "Content-Type": "application/json", "x-session-id": session };
const newRoomCode = () => Math.random().toString(36).slice(2, 8);

/** Lobby until joined, then the call screen. All call state lives here; helpers below are pure UI. */
export default function CallPage() {
  const [role, setRole] = useState<Role>("hearing");
  const [roomCode, setRoomCode] = useState("");
  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [camOn, setCamOn] = useState(true);
  const [status, setStatus] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [letters, setLetters] = useState<Guess[][]>([]);
  // Deaf side: spelled words waiting to go out as one sentence (no network calls while signing).
  const [sentence, setSentence] = useState<string[]>([]);
  const words = useRef<{ text: string; spelled: Guess[][] }[]>([]);
  const [talking, setTalking] = useState(false);
  const [typed, setTyped] = useState("");
  const [describing, setDescribing] = useState(false);
  // Deaf side: what the tracker sees right now ("" = no hand), shown live so the signer knows it's working.
  const [seen, setSeen] = useState<string | null>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  // Hearing side: the language signed messages are read and spoken in.
  const [lang, setLang] = useState<LanguageCode>("en");
  const [speakOut, setSpeakOut] = useState(true);
  const prefs = useRef({ lang, speakOut });
  prefs.current = { lang, speakOut };
  // Remember the language on this device (per-viewer convenience; storage can be blocked, so never required).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("visign.prefs") ?? "{}");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is only readable after mount
      if (isLanguage(saved.lang)) setLang(saved.lang);
      if (typeof saved.speakOut === "boolean") setSpeakOut(saved.speakOut);
    } catch {}
  }, []);
  // Saved only when the person changes a setting: an effect here would overwrite the saved choice on load.
  function savePrefs(next: { lang: LanguageCode; speakOut: boolean }) {
    setLang(next.lang);
    setSpeakOut(next.speakOut);
    try {
      localStorage.setItem("visign.prefs", JSON.stringify(next));
    } catch {}
  }
  const pickLang = (l: LanguageCode) => savePrefs({ lang: l, speakOut });
  const pickSpeak = (on: boolean) => savePrefs({ lang, speakOut: on });
  const [gloss, setGloss] = useState<{ id: number; tokens: string[] } | null>(null);
  const [poses, setPoses] = useState<Record<string, Point[]>>({});

  const room = useRef<Room | null>(null);
  const local = useRef<HTMLVideoElement>(null);
  // Everyone else in the room with a camera on: one tile each (a room can hold many people).
  const [remotes, setRemotes] = useState<{ id: string; track: RemoteVideoTrack }[]>([]);
  const [name, setName] = useState("");
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

  // Deaf side only: the letter model (~1 MB) for recognition and the avatar's poses (~12 KB).
  useEffect(() => {
    if (!joined || role !== "deaf") return;
    fetch("/model/letters.json")
      .then((r) => r.json())
      .then((m: { samples: { l: string; a: number; p: number[] }[] }) => {
        model.current = { labels: m.samples.map((s) => s.l), X: m.samples.map((s) => features(unflat(s.p), s.a)) };
      })
      .catch(() => setStatus("Could not load the letter model. Reload the page."));
    loadPoses().then(setPoses).catch(() => setStatus("Could not load the avatar."));
  }, [joined, role]);

  // Show a message, remember it as context for Muse Spark, and start the avatar for incoming speech.
  function addMessage(m: Msg) {
    recent.current = [...recent.current, `${m.who ?? (m.kind === "speech" ? "Hearing" : "Deaf")}: ${m.text}`].slice(-4);
    setMessages((all) => [...all, m]);
    if (m.from === "them" && m.kind === "speech" && m.gloss) setGloss({ id: Date.now(), tokens: m.gloss });
  }

  // Show our own message and broadcast it to everyone in the room (reliable data channel).
  function send(m: Omit<Msg, "from">) {
    const out = { ...m, who: name.trim() || undefined };
    addMessage({ ...out, from: "me" });
    room.current?.localParticipant
      .publishData(new TextEncoder().encode(JSON.stringify(out)), { reliable: true })
      .catch(() => setStatus("Message not delivered: connection problem."));
  }

  // Get a token, connect to the room, wire up events (video tiles, messages, people count), turn the camera on.
  async function join() {
    // One connection per tab: a second click while connecting used to open a duplicate (6x messages).
    if (connecting || room.current) return;
    if (!/^[a-z0-9-]{4,40}$/.test(roomCode)) return setStatus("Room code: 4-40 lowercase letters, digits or dashes.");
    setConnecting(true);
    setStatus("Connecting…");
    recent.current = [];
    let r: Room | null = null;
    try {
      const res = await fetch("/api/token", { method: "POST", headers, body: JSON.stringify({ room: roomCode, role }), signal: AbortSignal.timeout(20_000) });
      const { token, url, error } = await res.json();
      if (!res.ok || !token || !url) throw new Error(error ?? "LiveKit is not configured on the server");
      r = new Room({ adaptiveStream: true, dynacast: true });
      const room1 = r;
      const count = () => `${room1.remoteParticipants.size + 1} people in the call.`;
      r.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        if (track.kind === Track.Kind.Video)
          setRemotes((all) => [...all.filter((x) => x.id !== participant.identity), { id: participant.identity, track: track as RemoteVideoTrack }]);
      });
      r.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
        setRemotes((all) => all.filter((x) => !(x.id === participant.identity && x.track === track)));
      });
      r.on(RoomEvent.DataReceived, (payload, participant) => {
        if (!participant) return; // server messages: none expected
        try {
          const m: Msg = { ...JSON.parse(new TextDecoder().decode(payload)), from: "them" };
          if (typeof m.who !== "string") m.who = participant.identity.startsWith("deaf-") ? "Signer" : "Speaker";
          m.who = m.who.slice(0, 30);
          addMessage(m);
          if (m.kind === "sign" && role === "hearing") void readOut(m);
        } catch {} // ignore malformed messages from the other side
      });
      r.on(RoomEvent.ParticipantConnected, () => setStatus(count()));
      r.on(RoomEvent.ParticipantDisconnected, (p) => {
        setRemotes((all) => all.filter((x) => x.id !== p.identity));
        setStatus(room1.remoteParticipants.size ? count() : "Everyone else left.");
      });
      await r.connect(url, token);
      room.current = r;
      let note = "";
      try {
        await r.localParticipant.setCameraEnabled(true);
      } catch {
        // Often another tab holds the camera. Stay in the call: reading and typing still work.
        note = " Camera unavailable: close other tabs using it and rejoin to show video.";
        setCamOn(false);
      }
      window.history.replaceState(null, "", `/call?room=${roomCode}&role=${role}`);
      setJoined(true);
      setStatus((r.remoteParticipants.size ? count() : "Waiting for others to join…") + note);
    } catch (e) {
      await r?.disconnect(); // never leave a half-open connection behind
      room.current = null;
      setStatus(`Could not join: ${(e as Error).message}`);
    } finally {
      setConnecting(false);
    }
  }

  // Hearing side: Muse Spark turns the signed words into a sentence in the chosen language, then it's read aloud.
  async function readOut(m: Msg) {
    const { lang: to, speakOut: speak } = prefs.current;
    let text = m.text;
    // Always ask Muse Spark: it also turns spelled words ("YOU WANT WATER") into a sentence in English.
    try {
      const res = await fetch("/api/translate", {
        method: "POST", headers, signal: AbortSignal.timeout(25_000),
        body: JSON.stringify({ text: m.text, to, spelled: m.spelled, context: recent.current }),
      });
      const out = (await res.json()).text;
      if (out && out.toLowerCase() !== m.text.toLowerCase()) {
        text = out;
        setMessages((all) => all.map((x) => (x === m ? { ...x, translation: out } : x)));
      }
    } catch {} // the spelled words stay on screen
    if (speak && !sayAloud(text, to)) setStatus(`No ${LANGUAGES[to].name} voice on this device: showing text only.`);
  }

  useEffect(() => () => void room.current?.disconnect(), []);

  // Chrome loads its voice list lazily; asking early means the first message can be read aloud.
  useEffect(() => {
    if ("speechSynthesis" in window) speechSynthesis.getVoices();
  }, []);

  // Show your own camera once the call screen exists: the <video> isn't rendered while join() runs,
  // so attaching there left it empty and hand tracking never got a frame.
  useEffect(() => {
    const cam = room.current?.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
    const el = local.current;
    if (!joined || !camOn || !cam || !el) return;
    cam.attach(el);
    return () => void cam.detach(el);
  }, [joined, camOn]);

  // Deaf side: read signs from the local camera, commit held letters, decode each word, send the sentence after a pause.
  useEffect(() => {
    if (!joined || role !== "deaf") return;
    let frame = 0, stopped = false;
    const push = createSpeller();
    let shown: string | null = null;
    handLandmarker("VIDEO").then((detector) => {
      const tick = () => {
        if (stopped) return;
        const v = local.current;
        if (v && v.readyState >= 2 && v.videoWidth && model.current) try {
          const t = performance.now();
          const points = toPoints(detector.detectForVideo(v, t).landmarks[0]);
          const top = points ? classify(model.current, features(points, v.videoWidth / v.videoHeight)) : null;
          const c = overlay.current, ctx = c?.getContext("2d");
          if (c && ctx) {
            if (c.width !== v.videoWidth) [c.width, c.height] = [v.videoWidth, v.videoHeight];
            ctx.clearRect(0, 0, c.width, c.height);
            if (points) drawHand(ctx, points, "#e8a317");
          }
          // Letter plus confidence in 10% steps (re-render only when either changes); commits need MIN_P.
          const now = top ? `${top[0].letter} ${Math.round(top[0].p * 10) * 10}` : "";
          if (now !== shown) setSeen((shown = now));
          const ev = push(t, top);
          if (ev.letter) setLetters((w) => [...w, ev.letter!]);
          if (ev.word) {
            setLetters([]);
            addWord(ev.word);
          }
          if (ev.sentenceEnd) sendSentence();
        } catch (e) {
          console.error(e); // one bad frame must not stop recognition for the rest of the call
        }
        frame = requestAnimationFrame(tick);
      };
      tick();
    }).catch(() => setStatus("Hand tracking could not start on this device. Reload, or try Chrome."));
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the loop must not restart on every render
  }, [joined, role]);

  // Words wait locally; the hearing side makes one Muse Spark call per sentence (it used to be one per word).
  function addWord(word: Guess[][]) {
    words.current = [...words.current, { text: word.map((pos) => pos[0].letter).join(""), spelled: word }];
    setSentence(words.current.map((w) => w.text));
  }

  // Deaf side: send the gathered words as one message, with every letter's alternatives for Muse Spark.
  function sendSentence() {
    if (!words.current.length) return;
    send({ kind: "sign", text: words.current.map((w) => w.text).join(" "), spelled: words.current.map((w) => w.spelled) });
    words.current = [];
    setSentence([]);
  }

  // Deaf side: throw away the letters and words gathered so far.
  function clearSentence() {
    words.current = [];
    setSentence([]);
    setLetters([]);
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

  // Hearing side: stop recording, resample to 16 kHz WAV, transcribe, then send what was said.
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
        signal: AbortSignal.timeout(25_000),
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

  // One call: plain English for the deaf reader (Pidgin or mixed speech included) plus the avatar's gloss.
  async function speak(text: string) {
    let english = text, tokens: string[] | undefined;
    try {
      const res = await fetch("/api/gloss", {
        method: "POST", headers, signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({ text, context: recent.current }),
      });
      const j = await res.json();
      english = j.english || text;
      tokens = j.gloss;
    } catch {} // the deaf side still reads the words as spoken
    const translation = english.toLowerCase() !== text.toLowerCase() ? english : undefined;
    send({ kind: "speech", text, translation, gloss: tokens ?? text.toUpperCase().split(/\s+/) });
  }

  // Typing fallback for both sides: hearing text goes through the gloss step, deaf text goes out as signed.
  function submitTyped(e: React.FormEvent) {
    e.preventDefault();
    const text = typed.trim();
    if (!text) return;
    setTyped("");
    if (role === "hearing") void speak(text);
    else send({ kind: "sign", text });
  }

  // "Describe what's around me" (for blind users): one still from your camera, described by Muse Spark and read aloud.
  // Stays on this device: the description is never sent to the room.
  async function describe() {
    const v = local.current;
    if (describing) return;
    if (!camOn || !v?.videoWidth) return setStatus("Turn your camera on to describe what is around you.");
    setDescribing(true);
    setStatus("Looking…");
    try {
      const c = document.createElement("canvas");
      c.width = 640;
      c.height = Math.round((640 * v.videoHeight) / v.videoWidth);
      c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
      const { lang: to, speakOut: speak } = prefs.current;
      const res = await fetch("/api/describe", {
        method: "POST", headers, signal: AbortSignal.timeout(25_000),
        body: JSON.stringify({ image: c.toDataURL("image/jpeg", 0.7), lang: role === "hearing" ? to : "en" }),
      });
      const { text } = await res.json();
      if (!res.ok || !text) throw new Error();
      setMessages((all) => [...all, { from: "me", kind: "scene", text }]);
      setStatus("");
      if (role === "hearing" && speak && !sayAloud(text, to)) setStatus(`No ${LANGUAGES[to].name} voice on this device: showing text only.`);
    } catch {
      setStatus("Could not describe the scene right now. Try again.");
    } finally {
      setDescribing(false);
    }
  }

  // Camera on/off; the effect above re-attaches the self view when it comes back on.
  async function toggleCam() {
    const r = room.current;
    if (!r) return;
    try {
      await r.localParticipant.setCameraEnabled(!camOn);
      setCamOn(!camOn);
    } catch {
      setStatus("Camera unavailable: close other apps using it.");
    }
  }

  // Leave cleanly: disconnect (releases camera and room) and go back to the join screen.
  async function leave() {
    await room.current?.disconnect();
    room.current = null;
    words.current = [];
    setSentence([]);
    setLetters([]);
    setMessages([]);
    setCamOn(true);
    setRemotes([]);
    setSeen(null);
    setJoined(false);
    setStatus("You left the call.");
  }

  // roomCode is only set after mount, so the server and the first client render both show no link (no hydration mismatch).
  const shareLink = roomCode ? `${location.origin}/call?room=${roomCode}&role=${role === "hearing" ? "deaf" : "hearing"}` : "";

  if (!joined) {
    return (
      <main className="flex flex-1 flex-col">
        <header className="adire px-5 py-10 text-cloth sm:px-8">
          <div className="mx-auto max-w-6xl">
            <Link href="/" className="font-display text-xl font-bold">Visign</Link>
            <h1 className="mt-6 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Meetings for speaking and signing</h1>
            <p className="mt-3 max-w-2xl text-lg text-cloth/80">Start a call now, join with a code, or schedule one and send the invite.</p>
          </div>
        </header>
        <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] items-start gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_26rem]">
          <div>
          <h2 className="mb-5 font-display text-2xl font-bold">Start or join now</h2>
          <fieldset>
            <legend className="font-display text-xl font-bold">How will you talk?</legend>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {(["hearing", "deaf"] as const).map((r) => {
                const on = role === r;
                const tone = r === "hearing" ? "border-vat bg-vat text-cloth" : "border-sun bg-sun text-ink";
                return (
                  <label key={r} className={`cursor-pointer rounded-3xl border-4 p-5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-sun ${on ? tone : "border-ink/15 bg-white"}`}>
                    <input type="radio" name="role" className="sr-only" checked={on} onChange={() => setRole(r)} />
                    <span className="block font-display text-2xl font-bold">{r === "hearing" ? "I speak" : "I sign"}</span>
                    <span className={`mt-1 block text-sm ${on ? "" : "text-ink/60"}`}>{r === "hearing" ? "Hearing" : "Deaf or hard of hearing"}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {role === "hearing" && (
            <div className="mt-6">
              <LanguagePicker lang={lang} onLang={pickLang} speak={speakOut} onSpeak={pickSpeak} />
            </div>
          )}

          <label className="mt-8 block font-display text-xl font-bold" htmlFor="name">
            Your name <span className="font-sans text-base font-normal text-ink/60">(optional, shown in the chat)</span>
          </label>
          <input
            id="name" className="mt-2 w-full rounded-2xl border-2 border-ink/15 bg-white px-4 py-3 text-xl"
            value={name} maxLength={30} onChange={(e) => setName(e.target.value)} autoComplete="given-name"
          />

          <label className="mt-6 block font-display text-xl font-bold" htmlFor="room">Room code</label>
          <div className="mt-2 flex gap-2">
            <input
              id="room" className="min-w-0 flex-1 rounded-2xl border-2 border-ink/15 bg-white px-4 py-3 text-xl tracking-wider"
              value={roomCode} onChange={(e) => setRoomCode(e.target.value.toLowerCase())} autoComplete="off" spellCheck={false}
            />
            <button type="button" className="rounded-2xl border-2 border-ink/15 bg-white px-4 font-bold" onClick={() => setRoomCode(newRoomCode())}>
              New code
            </button>
          </div>
          <p className="mt-1 text-sm text-ink/60">Got an invite? Its code is already filled in. Otherwise paste the code you were sent.</p>

          <button className="mt-6 w-full rounded-full bg-ink py-4 font-display text-lg font-bold text-cloth hover:bg-dye disabled:opacity-60" onClick={join} disabled={connecting}>
            {connecting ? "Joining…" : "Join call"}
          </button>

          {shareLink && (
            <div className="mt-6 rounded-2xl bg-white p-4">
              <p className="text-sm text-ink/70">Send this link to anyone joining. It opens with the other role chosen; they can switch it.</p>
              <div className="mt-2 flex gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-cloth px-3 py-2 text-sm">{shareLink}</code>
                <button
                  className="rounded-lg border-2 border-ink/15 px-3 text-sm font-bold"
                  onClick={() => navigator.clipboard.writeText(shareLink).then(() => setStatus("Link copied."), () => setStatus("Copy failed: select the link instead."))}
                >
                  Copy
                </button>
              </div>
            </div>
          )}
          <p className="mt-4 min-h-6 text-sm" role="status">{status}</p>
          <p className="mt-6 text-sm leading-relaxed text-ink/70">
            By joining, you agree that your speech clips are sent to Meta&apos;s AI to be transcribed, and spelled words
            to Meta&apos;s AI to be decoded. Video travels between participants through LiveKit and is never recorded.
            Hand tracking runs on your device.
          </p>
          </div>
          <Schedule />
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col bg-ink text-cloth">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-display text-xl font-bold">Visign</Link>
            <span className="rounded-full bg-white/10 px-3 py-1 text-sm">Room {roomCode}</span>
            <button
              className="rounded-full border border-white/20 px-3 py-1 text-sm hover:bg-white/10"
              onClick={() => navigator.clipboard.writeText(shareLink).then(() => setStatus("Invite link copied."), () => setStatus("Copy failed."))}
            >
              Copy invite link
            </button>
          </div>
          <p className="flex min-w-0 items-center gap-2 text-sm text-cloth/80 sm:truncate" role="status">
            <span className="h-2 w-2 rounded-full bg-sun" aria-hidden="true" />
            {status || "In call"}
          </p>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-[minmax(0,1fr)] gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Stage: the other person, your own tile, and the call controls floating over the video */}
          <div className="relative overflow-hidden rounded-[1.75rem] bg-dye ring-1 ring-white/10">
            {remotes.length === 0 ? (
              <div className="grid min-h-64 w-full place-items-center p-6 pt-28 text-center sm:aspect-video sm:min-h-0 sm:pt-6">
                <div>
                  <p className="font-display text-2xl font-bold">Waiting for others to join</p>
                  <p className="mt-2 text-cloth/70">Share the invite link. Several people can join one room.</p>
                </div>
              </div>
            ) : (
              <div className={remotes.length > 1 ? "grid grid-cols-2 gap-2 p-2 sm:pb-24" : ""}>
                {remotes.map((p) => (
                  <RemoteTile key={p.id + p.track.sid} track={p.track} label={p.id.startsWith("deaf-") ? "Signer" : "Speaker"} rounded={remotes.length > 1} />
                ))}
              </div>
            )}
            <div className={`absolute right-4 top-4 overflow-hidden rounded-2xl ring-2 ring-cloth/80 ${role === "deaf" ? "w-1/3 sm:w-2/5" : "w-1/4 min-w-20"}`}>
              <video ref={local} autoPlay playsInline muted className="aspect-video w-full -scale-x-100 bg-ink object-cover" aria-label="Your camera" />
              {role === "deaf" && <canvas ref={overlay} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100 object-cover" />}
              <span className="absolute bottom-1 left-2 text-xs font-bold drop-shadow">{camOn ? "You" : "Camera off"}</span>
            </div>

            <div className="mx-auto my-3 flex w-fit items-center gap-2 rounded-full bg-ink/75 px-3 py-2 backdrop-blur sm:absolute sm:bottom-4 sm:left-1/2 sm:my-0 sm:-translate-x-1/2 sm:gap-3">
              {role === "hearing" && (
                <button
                  aria-pressed={talking}
                  className={`relative flex h-12 items-center gap-2 rounded-full px-4 font-display font-bold sm:h-14 sm:px-5 ${talking ? "bg-sun text-ink" : "bg-vat text-cloth"}`}
                  onPointerDown={startTalk} onPointerUp={stopTalk} onPointerLeave={() => talking && stopTalk()}
                  onKeyDown={(e) => e.key === " " && !e.repeat && startTalk()} onKeyUp={(e) => e.key === " " && stopTalk()}
                >
                  {talking && <span className="absolute inset-0 animate-ping rounded-full bg-sun/50" aria-hidden="true" />}
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="relative h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                  </svg>
                  <span className="relative whitespace-nowrap">
                    {/* Phones get the short label so the whole control bar fits; screen readers get the full one. */}
                    <span className="min-[400px]:hidden" aria-hidden="true">{talking ? "Release" : "Hold"}</span>
                    <span className="max-[399px]:sr-only">{talking ? "Release to send" : "Hold to speak"}</span>
                  </span>
                </button>
              )}
              <button
                aria-label="Describe what my camera sees" title="Describe what my camera sees" onClick={describe} disabled={describing}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full sm:h-12 sm:w-12 bg-white/15 hover:bg-white/25 disabled:animate-pulse"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
                </svg>
              </button>
              <button
                aria-pressed={!camOn} aria-label={camOn ? "Turn camera off" : "Turn camera on"} onClick={toggleCam}
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-full sm:h-12 sm:w-12 ${camOn ? "bg-white/15 hover:bg-white/25" : "bg-cloth text-ink"}`}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" />
                  {!camOn && <path d="M3 3l18 18" />}
                </svg>
              </button>
              <button aria-label="Leave call" onClick={leave} className="grid h-11 w-11 shrink-0 place-items-center rounded-full sm:h-12 sm:w-12 bg-red-600 hover:bg-red-700">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 rotate-[135deg]" fill="currentColor">
                  <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z" />
                </svg>
              </button>
            </div>
          </div>

          {role === "deaf" && (
            <section className="flex flex-col gap-3 rounded-[1.75rem] bg-dye/70 p-4 ring-1 ring-white/10">
              <p className="flex items-center gap-2 text-sm" aria-label="Hand tracker">
                <span className={`h-2.5 w-2.5 rounded-full ${seen ? "bg-green-400" : seen === "" ? "bg-cloth/40" : "animate-pulse bg-sun"}`} aria-hidden="true" />
                {seen === null
                  ? camOn ? "Starting hand tracking…" : "Camera off: turn it on to sign."
                  : seen ? (
                    <>
                      Hand seen. Reading <b className="font-display text-base text-sun">{seen.split(" ")[0]}</b>
                      <span className="text-cloth/70">
                        {Number(seen.split(" ")[1]) >= MIN_P * 100 ? `· ${seen.split(" ")[1]}% sure, hold still` : `· only ${seen.split(" ")[1]}% sure: make the shape clearer`}
                      </span>
                    </>
                  ) : "No hand in view. Raise one hand inside your camera frame, palm facing the camera."}
              </p>
              <div aria-label="Letters you are signing" aria-live="polite" className="flex min-h-16 flex-wrap items-center gap-2">
                {letters.length ? (
                  letters.map((pos, i) => (
                    <span key={i} className="grid h-16 w-14 place-items-center rounded-2xl bg-sun font-display text-4xl font-bold text-ink">
                      {pos[0].letter}
                    </span>
                  ))
                ) : (
                  <p className="text-cloth/70">Sign a letter and hold it still. Lower your hand briefly to finish a word.</p>
                )}
              </div>
              <div aria-label="Your sentence" className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                {sentence.length ? (
                  sentence.map((w, i) => (
                    <span key={i} className="rounded-full bg-sun/20 px-4 py-1.5 font-display text-xl font-bold text-sun">{w}</span>
                  ))
                ) : (
                  <p className="text-sm text-cloth/60">Words gather here. Pause for 2.5 seconds to send them as one sentence.</p>
                )}
                <span className="ml-auto flex gap-2">
                  <button className="rounded-full border border-white/20 px-4 py-2 font-bold disabled:opacity-40" onClick={clearSentence} disabled={!sentence.length && !letters.length}>
                    Clear
                  </button>
                  <button className="rounded-full bg-sun px-5 py-2 font-display font-bold text-ink disabled:opacity-40" onClick={sendSentence} disabled={!sentence.length}>
                    Send now
                  </button>
                </span>
              </div>
            </section>
          )}
        </div>

        <aside className="flex min-h-0 min-w-0 flex-col gap-4">
          {role === "deaf" ? <Avatar poses={poses} gloss={gloss} /> : <LanguagePicker lang={lang} onLang={pickLang} speak={speakOut} onSpeak={pickSpeak} />}

          <section className="flex min-h-80 flex-1 flex-col rounded-[1.75rem] bg-dye/70 ring-1 ring-white/10">
            <h2 className="px-5 pt-4 font-display text-lg font-bold">Conversation</h2>
            <ol className="flex max-h-[28rem] flex-1 flex-col gap-3 overflow-auto px-4 py-3" role="log" aria-live="polite" aria-label="Conversation">
              {messages.length === 0 && (
                <li className="py-6 text-center text-cloth/60">
                  {role === "hearing" ? "Hold the button and speak, or type below." : "Their words will appear here and on the signer."}
                </li>
              )}
              {messages.map((m, i) => (
                <li key={i} className={`max-w-[88%] ${m.from === "me" ? "self-end text-right" : "self-start"}`}>
                  <span className="text-xs text-cloth/60">{m.kind === "scene" ? "Your camera sees (only you)" : `${m.from === "me" ? "You" : m.who ?? "They"} ${m.kind === "speech" ? "spoke" : "signed"}`}</span>
                  <p className={`mt-0.5 rounded-3xl px-4 py-2 text-left text-lg ${m.kind === "speech" ? "bg-vat text-cloth" : m.kind === "sign" ? "bg-sun text-ink" : "bg-cloth text-ink"}`}>
                    <span dir="auto" className="block">{m.translation ?? m.text}</span>
                    {m.translation && <span className="mt-1 block text-sm opacity-70">{m.text}</span>}
                  </p>
                </li>
              ))}
            </ol>
            <form onSubmit={submitTyped} className="flex gap-2 border-t border-white/10 p-3">
              <input
                className="min-w-0 flex-1 rounded-full border border-white/15 bg-ink/60 px-4 py-2.5 text-cloth placeholder:text-cloth/40"
                placeholder="Type a message" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type a message"
              />
              <button className="rounded-full bg-sun px-5 font-display font-bold text-ink">Send</button>
            </form>
          </section>
        </aside>
      </div>
    </main>
  );
}

/** Speaks text with a browser voice for the language. Returns false when the device has no such voice. */
function sayAloud(text: string, lang: LanguageCode): boolean {
  if (!("speechSynthesis" in window)) return false;
  const tag = LANGUAGES[lang].voice;
  const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(tag));
  if (!voice && tag !== "en") return false; // never read Yoruba with an English voice: it would be unintelligible
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? "en-NG";
  speechSynthesis.speak(u);
  return true;
}

/** One remote participant's video; the LiveKit track stays attached while the tile is shown. */
function RemoteTile({ track, label, rounded }: { track: RemoteVideoTrack; label: string; rounded: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    track.attach(el);
    return () => void track.detach(el);
  }, [track]);
  return (
    <div className={`relative overflow-hidden bg-ink ${rounded ? "rounded-2xl" : ""}`}>
      <video ref={video} autoPlay playsInline className="aspect-video w-full object-cover" aria-label={`${label} video`} />
      <span className="absolute left-3 top-3 rounded-full bg-ink/70 px-3 py-1 text-sm backdrop-blur">{label}</span>
    </div>
  );
}

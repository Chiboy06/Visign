import Link from "next/link";
import { HeroHand } from "./HeroHand";

const stats = [
  { n: "430M", t: "people live with disabling hearing loss (WHO)" },
  { n: "300+", t: "sign languages are in use worldwide" },
  { n: "~7.7M", t: "deaf people in Nigeria (estimate)" },
];

const steps = [
  { h: "Open a room", p: "Pick “I speak” or “I sign” and share the invite link. No app to install, no account needed." },
  { h: "Speak or fingerspell", p: "Hold the button and talk, or spell words to your camera. Hands are tracked on your own device." },
  { h: "Both understood", p: "Speech becomes captions and a signing avatar. Signing becomes one natural sentence, read aloud." },
];

const audiences = [
  { h: "Deaf and hard of hearing people", p: "Read what is said in plain English and watch it fingerspelled. Reply by signing, not typing." },
  { h: "Families, friends and coworkers", p: "Talk with a deaf person today, before you learn to sign. Pidgin is understood." },
  { h: "Clinics, schools and front desks", p: "A browser tab on any phone or laptop. Several people can join the same room." },
  { h: "Blind and low-vision listeners", p: "Signed sentences are spoken aloud, so a blind and a deaf person can talk to each other." },
];

const meta = [
  { h: "Muse Voice Transcribe", p: "Turns the hearing person’s speech into text, one utterance at a time." },
  { h: "Muse Spark", p: "Turns Pidgin into plain English, and spelled letters plus the conversation into one sentence in Yorùbá, Hausa, Igbo, Pidgin, French or English." },
  { h: "SAM 3.1", p: "Tested for hand outlines; the next step for telling look-alike fist letters apart." },
];

const roadmap = [
  { when: "Now", items: ["Two-way live calls, several people per room", "NSL and ASL fingerspelling", "Six reading languages, read aloud"] },
  { when: "Next", items: ["Accounts and team workspaces for organisations", "Word signs (HELLO, THANK YOU) from motion data", "Saved transcripts, with consent"] },
  { when: "Later", items: ["Captions in smart glasses", "Signing avatar in VR meeting rooms", "Native mobile apps"] },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="adire text-cloth">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8" aria-label="Main">
          <Link href="/" className="font-display text-2xl font-bold">Visign</Link>
          <div className="flex items-center gap-5 text-sm sm:gap-7">
            <a href="#how" className="hidden hover:underline sm:inline">How it works</a>
            <a href="#who" className="hidden hover:underline sm:inline">Who it’s for</a>
            <a href="#roadmap" className="hidden hover:underline sm:inline">Roadmap</a>
            <Link href="/call" className="rounded-full bg-cloth px-4 py-2 font-bold text-ink">Start a call</Link>
          </div>
        </nav>
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-14 pt-6 sm:px-8 md:grid-cols-[1.1fr_1fr] md:pb-20">
          <div>
            <p className="inline-block rounded-full bg-white/10 px-3 py-1 text-sm">Built on Meta’s Muse models</p>
            <h1 className="mt-6 font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-7xl">
              Speak. Sign. Both understood.
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-cloth/85">
              A live video call between hearing and deaf people. Speech turns into captions and a signing avatar;
              fingerspelling turns into a spoken sentence. Nigerian Sign Language and ASL, in any browser.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/call" className="rounded-full bg-sun px-8 py-4 font-display text-lg font-bold text-ink transition-transform hover:-translate-y-0.5">
                Start a free call
              </Link>
              <a href="#how" className="rounded-full border-2 border-cloth/40 px-8 py-4 font-display text-lg font-bold hover:bg-white/10">
                See how it works
              </a>
            </div>
          </div>
          <HeroHand />
        </div>
      </section>

      <section className="border-b border-ink/10 bg-white" aria-label="Why it matters">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:grid-cols-3 sm:px-8">
          {stats.map((s) => (
            <div key={s.n}>
              <p className="font-display text-4xl font-extrabold text-vat">{s.n}</p>
              <p className="mt-1 text-ink/70">{s.t}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="mx-auto w-full max-w-6xl scroll-mt-6 px-5 py-14 sm:px-8 md:py-20">
        <h2 className="font-display text-4xl font-bold tracking-tight">How it works</h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.h} className="rounded-3xl bg-white p-6 ring-1 ring-ink/10">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-sun font-display font-bold">{i + 1}</span>
              <h3 className="mt-4 font-display text-2xl font-bold">{s.h}</h3>
              <p className="mt-2 leading-relaxed text-ink/75">{s.p}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="who" className="scroll-mt-6 bg-dye text-cloth">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 md:py-20">
          <h2 className="font-display text-4xl font-bold tracking-tight">Who it’s for</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {audiences.map((a, i) => (
              <div key={a.h} className={`border-l-8 pl-6 ${i % 2 ? "border-sun" : "border-vat"}`}>
                <h3 className="font-display text-2xl font-bold">{a.h}</h3>
                <p className="mt-2 max-w-prose leading-relaxed text-cloth/80">{a.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1fr_1.3fr] md:py-20">
        <div>
          <h2 className="font-display text-4xl font-bold tracking-tight">Meta AI, where it matters</h2>
          <p className="mt-4 leading-relaxed text-ink/75">
            Hand tracking runs on your device and video travels over LiveKit, never through our server. Only short text and speech clips reach
            Meta’s models, through our server, so no key ever sits in your browser.
          </p>
        </div>
        <ul className="grid gap-4">
          {meta.map((m) => (
            <li key={m.h} className="rounded-3xl bg-white p-5 ring-1 ring-ink/10">
              <h3 className="font-display text-xl font-bold">{m.h}</h3>
              <p className="mt-1 leading-relaxed text-ink/75">{m.p}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="roadmap" className="scroll-mt-6 border-t border-ink/10 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 md:py-20">
          <h2 className="font-display text-4xl font-bold tracking-tight">Roadmap</h2>
          <p className="mt-3 max-w-prose text-ink/75">
            Honest about today: Visign reads fingerspelling, not full sign language yet.
          </p>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {roadmap.map((r, i) => (
              <div key={r.when} className={`rounded-3xl p-6 ${i === 0 ? "bg-sun" : "bg-cloth"}`}>
                <h3 className="font-display text-2xl font-bold">{r.when}</h3>
                <ul className="mt-3 list-disc space-y-1.5 pl-5">
                  {r.items.map((x) => <li key={x}>{x}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="adire text-cloth">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-5 py-14 sm:px-8 md:flex-row md:items-center md:justify-between">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">Try it now: two devices, one link.</h2>
          <Link href="/call" className="rounded-full bg-sun px-8 py-4 font-display text-lg font-bold text-ink">Start a call</Link>
        </div>
      </section>

      <footer className="border-t border-ink/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-ink/70 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>Visign. Built with NSL and ASL data, credited in the repository.</p>
          <nav className="flex gap-5" aria-label="Data tools">
            <Link className="underline underline-offset-4 hover:text-ink" href="/tools/record">Record signs</Link>
            <Link className="underline underline-offset-4 hover:text-ink" href="/tools/convert">Convert datasets</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}

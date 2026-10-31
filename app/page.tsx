import Link from "next/link";
import { HeroHand } from "./HeroHand";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="adire text-cloth">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1.1fr_1fr] md:py-20">
          <div>
            <p className="font-display text-2xl font-bold">Visign</p>
            <h1 className="mt-10 font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-7xl">
              Speak. Sign. Both understood.
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-cloth/85">
              A live video call where speech turns into captions and a signing hand, and fingerspelling turns into text.
              Nigerian Sign Language and ASL, in any browser.
            </p>
            <Link
              href="/call"
              className="mt-9 inline-block rounded-full bg-sun px-8 py-4 font-display text-lg font-bold text-ink transition-transform hover:-translate-y-0.5"
            >
              Start a call
            </Link>
          </div>
          <HeroHand />
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-2 md:py-20">
        <div className="border-l-8 border-vat pl-6">
          <h2 className="font-display text-3xl font-bold">When you speak</h2>
          <p className="mt-3 max-w-prose text-lg leading-relaxed">
            Hold the button and talk. The other person reads your words and watches them fingerspelled, trimmed to the
            words that matter so signing keeps up with you.
          </p>
        </div>
        <div className="border-l-8 border-sun pl-6">
          <h2 className="font-display text-3xl font-bold">When they sign</h2>
          <p className="mt-3 max-w-prose text-lg leading-relaxed">
            They spell each word with one hand to their camera. You read it as text, with unclear letters resolved
            using the conversation so far.
          </p>
        </div>
      </section>

      <footer className="mt-auto border-t border-ink/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-ink/70 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>
            Built on Meta Muse Spark, Muse Voice Transcribe and SAM 3.1. Hands are tracked on your device; video never
            touches our server.
          </p>
          <nav className="flex gap-5" aria-label="Data tools">
            <Link className="underline underline-offset-4 hover:text-ink" href="/tools/record">Record signs</Link>
            <Link className="underline underline-offset-4 hover:text-ink" href="/tools/convert">Convert datasets</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}

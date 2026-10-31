import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-10">
      <h1 className="text-3xl font-semibold">Visign</h1>
      <p className="mt-2 text-neutral-600">A two-way bridge between sign language (NSL and ASL) and speech.</p>
      <Link href="/call" className="mt-6 inline-block rounded bg-black px-5 py-3 text-white">Start a call</Link>
      <h2 className="mt-8 font-medium">Data tools</h2>
      <ul className="mt-2 list-disc pl-5 text-sm">
        <li><Link className="underline" href="/tools/record">Sign recorder</Link>: capture letters and word signs from your webcam.</li>
        <li><Link className="underline" href="/tools/convert">Dataset converter</Link>: turn NSL images or ASLNow JSON into landmarks.</li>
      </ul>
    </main>
  );
}

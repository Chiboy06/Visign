"use client";

import { useState } from "react";
import { ASLNOW_ASPECT, countByLabel, fitToBox, labelFromPath, sourceKey, toPoints, type Lang, type Sample } from "@/lib/dataset";
import { downloadJson, drawHand, handLandmarker } from "@/lib/hands";

type Row = Sample & { id: number; file: string; preview?: string; excluded?: boolean };

const PER_LABEL_IN_REVIEW = 12;

export default function ConvertPage() {
  const [lang, setLang] = useState<Lang>("nsl");
  const [rows, setRows] = useState<Row[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function convert(files: File[]) {
    setBusy(true);
    const added: Row[] = [];
    const missed: string[] = [];
    const detector = files.some((f) => f.type.startsWith("image/")) ? await handLandmarker("IMAGE") : null;

    for (const [i, file] of files.entries()) {
      const path = file.webkitRelativePath || file.name;
      if (!/\.(jpe?g|png|webp|json)$/i.test(file.name)) continue;
      const label = labelFromPath(path);
      if (!label) {
        missed.push(`${path}: no label in file or folder name`);
        continue;
      }
      setStatus(`${i + 1} / ${files.length}  ${file.name}`);
      try {
        if (file.name.toLowerCase().endsWith(".json")) {
          const points = toPoints(JSON.parse(await file.text()));
          if (!points) missed.push(`${path}: not 21 landmarks`);
          else added.push({ id: 0, file: path, lang, label, source: "aslnow", aspect: ASLNOW_ASPECT, points });
        } else if (detector) {
          const img = await createImageBitmap(file);
          const result = detector.detect(img);
          const aspect = img.width / img.height;
          img.close();
          const points = toPoints(result.landmarks[0]);
          if (!points) missed.push(`${path}: no hand found`);
          else
            added.push({
              id: 0, file: path, lang, label, aspect, points,
              source: `${lang}:${sourceKey(file.name)}`,
              handedness: result.handedness[0]?.[0]?.categoryName,
              preview: URL.createObjectURL(file),
            });
        }
      } catch (e) {
        missed.push(`${path}: ${(e as Error).message}`);
      }
      if (i % 10 === 0) await new Promise((r) => setTimeout(r)); // keep the page responsive
    }

    setRows((prev) => [...prev, ...added.map((r, k) => ({ ...r, id: prev.length + k }))]);
    setProblems((prev) => [...prev, ...missed]);
    setStatus(`Added ${added.length}, skipped ${missed.length}.`);
    setBusy(false);
  }

  const kept = rows.filter((r) => !r.excluded);
  const counts = countByLabel(kept);
  const labels = Object.keys(countByLabel(rows)).sort();

  function exportJson() {
    const samples: Sample[] = kept.map(({ lang, label, source, aspect, handedness, points }) => ({
      lang, label, source, aspect, handedness, points,
    }));
    downloadJson(`landmarks-${new Date().toISOString().slice(0, 10)}.json`, { version: 1, samples });
  }

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-8">
      <h1 className="text-2xl font-semibold">Dataset converter</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Turns sign images (NSL dataset) or ASLNow JSON into hand landmarks. Labels come from the file prefix
        (<code>a_frame_….jpg</code>) or the folder name (<code>B/….json</code>). Everything runs in this browser.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-4">
        <label className="flex flex-col text-sm">
          Language of the files you load next
          <select className="mt-1 rounded border px-2 py-1" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            <option value="nsl">NSL: Nigerian Sign Language</option>
            <option value="asl">ASL: American Sign Language</option>
          </select>
        </label>
        <label className="flex flex-col text-sm">
          Pick a folder
          <input
            type="file" disabled={busy} className="mt-1 text-sm"
            // @ts-expect-error webkitdirectory is supported by Chrome, Edge, Firefox and Safari but not typed by React
            webkitdirectory=""
            onChange={(e) => e.target.files && convert([...e.target.files])}
          />
        </label>
        <label className="flex flex-col text-sm">
          …or pick files
          <input
            type="file" multiple disabled={busy} accept="image/*,.json" className="mt-1 text-sm"
            onChange={(e) => e.target.files && convert([...e.target.files])}
          />
        </label>
        <button
          className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
          disabled={busy || kept.length === 0} onClick={exportJson}
        >
          Download landmarks.json ({kept.length})
        </button>
      </div>

      <p className="mt-3 text-sm" role="status" aria-live="polite">{busy ? `Working… ${status}` : status}</p>

      {labels.length > 0 && (
        <section className="mt-6">
          <h2 className="font-medium">Samples kept per label</h2>
          <p className="mt-1 text-xs text-neutral-600">
            Click a card to exclude a wrong or unclear sample (e.g. a &quot;W&quot; showing two fingers).
          </p>
          {labels.map((label) => (
            <div key={label} className="mt-4">
              <h3 className="text-sm font-semibold">
                {label} <span className="font-normal text-neutral-500">· {counts[label] ?? 0} kept</span>
              </h3>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {rows.filter((r) => r.label === label).slice(0, PER_LABEL_IN_REVIEW).map((r) => (
                  <button
                    key={r.id}
                    title={r.file}
                    aria-pressed={!r.excluded}
                    aria-label={`${r.label} sample ${r.file}, ${r.excluded ? "excluded" : "kept"}`}
                    onClick={() => setRows((all) => all.map((x) => (x.id === r.id ? { ...x, excluded: !x.excluded } : x)))}
                    className={`relative overflow-hidden rounded border text-left ${r.excluded ? "opacity-30" : ""}`}
                  >
                    {r.preview && (
                      // eslint-disable-next-line @next/next/no-img-element -- local object URLs, not optimisable
                      <img src={r.preview} alt="" className="aspect-video w-full object-cover" />
                    )}
                    <HandThumb points={r.points} aspect={r.aspect} />
                    <span className="absolute left-1 top-1 rounded bg-white/80 px-1 text-xs">{r.lang}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {problems.length > 0 && (
        <details className="mt-6 text-sm">
          <summary>{problems.length} files skipped</summary>
          <ul className="mt-2 max-h-64 overflow-auto font-mono text-xs">
            {problems.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </details>
      )}
    </main>
  );
}

function HandThumb({ points, aspect }: { points: Sample["points"]; aspect: number }) {
  return (
    <canvas
      width={120} height={120} className="mx-auto block"
      ref={(c) => {
        const ctx = c?.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, 120, 120);
        drawHand(ctx, fitToBox(points, aspect));
      }}
    />
  );
}

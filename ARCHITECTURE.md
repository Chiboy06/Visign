# Visign: system architecture

Status: **draft v2 for team review**. Nothing is built yet. Use it with PLAN.md, which covers what we build and when; this file covers how and why.

Evidence labels used below:
- **[official]**: from the vendor's own docs or pricing page, checked on Oct 29, 2026.
- **[3rd-party]**: from comparison sites only. Re-check before relying on it.
- **[Day 1]**: we measure it ourselves. No decision rests on a guess without a Day 1 check.

---

## 0. Design principles (every decision follows these)

1. **Recognition runs on the device; the server only adds intelligence.** If the server or Meta's API is slow or down, Visign keeps working with lower accuracy.
2. **Video goes through a managed real-time platform, never through our own server code.** We don't build media infrastructure.
3. **One API contract for every device.** Browser, phone and glasses use the same endpoints.
4. **Secrets and the budget are guarded on the server.** Nothing secret goes to the browser.
5. **A sign language is data, not code.** Adding NSL words or a new language means new database rows, not new code.
6. **No lock-in where it matters:** open-source or standard formats for calls (LiveKit), data (SQL), avatars (VRM/glTF) and models (TFLite `.task` files).

---

## 1. The full stack at a glance

| Layer | Choice | One-line reason |
|---|---|---|
| App | **Next.js 16 (App Router)** + React + TypeScript, installable as a PWA | Team choice: industry standard, huge community, native on Vercel. Camera/call/avatar screens are client components. |
| Calls (1:1 and group) | **LiveKit** (Cloud now, self-host later) | Open-source, TURN included, every platform SDK, group calls with the same code |
| Hand / body tracking | **MediaPipe Tasks**, `@mediapipe/tasks-vision` | On-device, 17 ms per frame on a Pixel 6 CPU [official] |
| Letter classifier | Our own k-NN on joint points (TS) | Tiny, explainable, top-3 output |
| Avatar | **2D first, 3D (VRM + three.js) as a stretch**, both from the same recordings | 2D is safe; 3D is the wow factor if it lands in time |
| Server | **Next.js Route Handlers** (`app/api/*/route.ts`), deployed on **Vercel** | One project and one deploy. Route Handlers are plain HTTP endpoints, so Android and glasses clients can call them. Vercel scales and load-balances automatically. |
| Backup host (**deferred until real launch**) | The same code on Cloudflare Workers through the OpenNext adapter (`@opennextjs/cloudflare`), built by GitHub Actions on Linux | A second live link if Vercel fails during the demo or judging. Building on a Linux runner avoids OpenNext's Windows limits. No code changes, only a `wrangler.jsonc` file and secrets. |
| Database | **Supabase (Postgres)** | Biggest community of any option (114k GitHub stars), standard Postgres, auth ready for later |
| File storage | **Supabase Storage** | Recordings and avatar models, in the same project as the database |
| AI | Meta: Muse Voice Transcribe, Muse Spark 1.3, SAM 3.1 | See section 6 |
| Quality | GitHub Actions CI, pinned versions, Vercel logs (Sentry deferred) | Enough for a hackathon |

---

## 1b. Community health (GitHub API, Oct 29, 2026)

| Project | Stars | Last push | License | Verdict |
|---|---|---|---|---|
| three.js | 117k | today | MIT | Industry standard for web 3D |
| Supabase | 114k | today | Apache-2.0 | Biggest database community |
| Vite | 84k | today | MIT | Standard build tool |
| MediaPipe | 37k | today | Apache-2.0 | Google-backed, active |
| Hono | 33k | yesterday | MIT | Very active, runs inside Next.js route handlers |
| **LiveKit** server | **22k** | today | Apache-2.0 | **Largest open-source real-time community** |
| Capacitor | 17k | today | MIT | Standard PWA → app store wrapper |
| PeerJS | 13.5k | **Feb 2026** | MIT | Slowing down, which is another reason to drop it |
| SAM 3 | 12k | Oct 23 | custom | Meta, active |
| Sentry JS | 8.8k | today | custom | Standard error tracking |
| Kalidokit | 5.7k | **Aug 2025** | MIT | Popular but barely maintained (a risk, as noted in section 4) |
| Cloudflare workers-sdk | 4.7k | today | Apache-2.0 | Smaller repo, but backed by Cloudflare's large Discord and docs |
| three-vrm | 2.2k | Oct 22 | MIT | Niche but active, maintained by pixiv |
| Daily JS | 145 | Oct 16 | BSD-2 | Small public community |
| Stream video JS | 125 | today | custom | Small public community; support is mostly paid or private |

**Stars measure popularity, not quality.** Recent activity and the license matter just as much. Every pick below is active and permissively licensed.

---

## 2. Calls: video SDK comparison and decision

We first planned PeerJS (direct peer to peer). For industry standard and group calls we need a **managed SFU**: a selective forwarding unit, a media server that receives each person's stream once and forwards it to everyone else. Every serious video product uses one.

| SDK | Free tier | Paid | Open source? | Platforms | TURN included | Notes |
|---|---|---|---|---|---|---|
| **LiveKit** | **5,000 WebRTC participant-min/month, 100 concurrent connections, 50 GB downstream** [official] | Ship $50/month: 150k min, then $0.0005/min [official] | **Yes** (Apache 2.0 server; self-host anytime) | Web, React, React Native, Android, iOS, Flutter, Unity, Rust | Yes | Data channels for our letters/gloss. "Agents" framework if we ever process media on the server. 99.99% uptime listed [official]. |
| **Stream Video** (you've used it) | Maker program: free for **< 5 team members and < $10k monthly revenue** [official SDK page]; allowance reported as $100/month credit [3rd-party, conflicting] | Usage-based | SDKs open, servers closed | Web, React, React Native, Android, iOS, Flutter | Yes | Generous for a small team; vendor lock-in |
| **Agora** | **10,000 min/month** per account [official docs] | Per 1,000 min, varies by quality [3rd-party, conflicting] | No | All major platforms | Yes (cloud proxy is extra) | Large global network (200+ countries [official]); I found no confirmed African region |
| **Daily** | 10,000 participant-min/month [3rd-party] | About $0.004/participant-min [3rd-party] | No | Web, React Native, Android, iOS | Yes | Simple API |
| **Cloudflare Realtime** (SFU + TURN) | **1,000 GB/month shared between SFU and TURN**, then $0.05/GB [official] | Per GB | No | Low-level WebRTC | Yes | Same vendor as our server, but we'd build the call logic ourselves |
| Twilio Video, 100ms | — | — | — | — | — | Skip: Twilio's future is uncertain; 100ms has nothing extra for us |

### Decision: **LiveKit Cloud**, with Stream as the alternative
- **Why LiveKit:**
  - It's **open source**. We can move from Cloud to our own servers at any scale without rewriting the app. Stream and Agora can't offer that.
  - TURN is built in, which removes our biggest Nigeria risk (mobile networks blocking direct connections).
  - 1:1 and group calls use the same code.
  - It has every SDK we'll need (web now, Android/iOS/Flutter later).
  - Data channels carry our letters and gloss inside the call.
- **Free-tier math:** a 2-person call uses 2 participant-minutes per minute, so **5,000 min ≈ 41 hours of 1:1 calls per month**. That's plenty for building, the demo and judging.
- **Stream is acceptable** if the team moves faster with it, since you already know it. The cost is lock-in. Decide as a team; the rest of the architecture doesn't change.
- **What it needs from us:** one endpoint, `POST /api/token`, that issues a LiveKit access token (signed with our LiveKit secret, server-side only).
- **[Day 1]:** check that `livekit-server-sdk` issues tokens from the Next.js Node runtime. Test call quality on MTN/Airtel mobile data. Find the nearest LiveKit edge region to Lagos.

---

## 3. Database: what we store and why

You're right that it's needed. Without accounts it still does four jobs:

| Table | What it holds | Why it matters |
|---|---|---|
| `signs` | id, language (`nsl`/`asl`), gloss (`HELLO`), type (letter/word), version, status (draft/approved), Storage path of the motion file | **The product's core.** "Record once, works both ways" lives here. A new language is just rows. |
| `recordings` | id, sign_id, contributor (anonymous device id), consent flag, created_at, quality score, Storage path | Training data plus avatar motion. A consent record for every recording, because this is people's body data. |
| `corrections` | session_id, predicted top-3, the letter the user chose, created_at (**opt-in**) | **The data flywheel:** every correction is a free labelled example that makes the classifier better |
| `usage_ledger` | timestamp, endpoint, cost in USD, session_id | **Exact** budget tracking for the $75 cap (replaces the KV idea, which was only approximate) |

**No accounts:** each device gets a random anonymous ID stored locally. No names, emails or phone numbers.

### Comparison

| | **Cloudflare D1** | Supabase | Firebase |
|---|---|---|---|
| Engine | SQLite (plain SQL) | Postgres | NoSQL documents |
| Free tier | **5 GB storage, 5M rows read/day, 100k rows written/day** [3rd-party, matches Cloudflare docs] | 500 MB, **pauses after 1 week of inactivity** [3rd-party] | Spark plan |
| Connection from our server | Cloudflare-only direct binding (not usable on Vercel) | Over the network, with keys | Over the network |
| Long-run | Standard SQL, so migrating to Postgres is straightforward | Auth + storage + realtime built in | Lock-in, harder analytics |

### Decision (v3, re-ranked on community): **Supabase**
- **Community and support:** 114k GitHub stars, active daily, a large Discord, and the most tutorials and examples. AI coding assistants also know it well. D1 is a sub-product inside Cloudflare's 4.7k-star `workers-sdk` repo.
- **Postgres** is the industry-standard database. Atomic updates keep the budget ledger exact, and row-level security is available when we add accounts. **Supabase Auth** is ready for when we need it.
- **Storage** holds the big files (motion JSON, `.vrm` models) in the same project.
- **The 1-week inactivity pause** on the free tier can't happen before judging ends. The last activity is around Nov 4, so the earliest pause is around Nov 11, after judging ends on Nov 8. No keep-alive job needed. Upgrade to Pro ($25/month) if Visign goes live for real users.
- **How the server talks to it:** the API uses `@supabase/supabase-js` with the **service-role key as a Vercel environment secret**. The browser never talks to the database directly in v1, so all rules stay on the server.
- Schema changes go through **Supabase CLI migrations** (versioned SQL in git).
- **[Day 1]:** put the Vercel functions region and the Supabase region in the same place (EU, which is closest to Lagos among the usual options) and measure the time between them.

---

## 4. Avatar: how a 3D cartoon is made from a recording

### The pipeline
```
1. RECORD    a person signs to a webcam
             → MediaPipe Holistic Landmarker (web): per frame, 33 body + 2×21 hand (+ face) points
             → saved as a motion JSON (raw, reusable forever)
2. CHARACTER make a cartoon character in VRoid Studio (free, by pixiv) → export a .vrm file
             (VRM is an open 3D avatar standard with named bones for arms, hands and every finger joint)
3. RETARGET  convert joint positions → bone rotations
             (Kalidokit: MIT; solves pose, hands and face from MediaPipe points into VRM rotations)
             + smoothing filter (removes camera jitter) → done ONCE at record time, saved as an animation clip
4. PLAY      three.js + @pixiv/three-vrm render the character; it plays the saved clip for each gloss word
             and blends ~150 ms between signs; unknown words → fingerspelled clips
```

**Why retarget at record time:** phones only play an animation, which is cheap, instead of solving maths every frame. Clips can also be exported as **glTF animations**, the standard format that Unity, Android and glasses apps can load later. That's the long-run payoff.

### Honest risks
- **Kalidokit is old** (last major activity around 2021–22) and its examples use MediaPipe's **deprecated** Holistic "Solutions" API. The landmark format is the same in the new Tasks API, so it should work, but **that's unverified**. Fallback: compute the finger bone rotations ourselves. It's 15 joints per hand, each one the angle between two bone vectors, which is well-understood maths.
- **One camera can't see depth well.** Fingers pointing at the camera are noisy. Mitigations: record facing the camera with good light, smooth the motion, and hand-fix the few bad frames in the saved clip.
- **Ready Player Me (a common avatar source) shut down on Jan 31, 2026**, so use VRoid.
- **Effort:** 2–3 days for someone who knows three.js. That's the whole hackathon.

### Decision: build both, and keep 3D off the critical path
- **Day 2:** the 2D avatar (canvas, drawn from the same motion JSON) is the guaranteed version.
- **In parallel:** one teammate builds the 3D VRM avatar from the **same motion JSON**. If it's smooth by Day 3 midday, it replaces 2D in the demo. If not, it's in the "next" section of the video.
- No wasted work either way: the recordings feed both.

---

## 5. MediaPipe: deep dive (Windows and Linux)

### What we use
| Task | Output | Where |
|---|---|---|
| **Hand Landmarker** | 21 points per hand (image + 3D world coordinates), plus left/right | **Live** recognition on every device |
| **Holistic Landmarker** | Body + hands + face points together | **Recording only** (it's heavier, and the avatar needs arms) |

### Speed [official]
Whole Hand Landmarker pipeline on a **Pixel 6: 17.12 ms on CPU, 12.27 ms on GPU**. That's about 58 fps on CPU in theory. In practice the camera's 30 fps is the limit. Laptops are typically faster; low-end Android phones will be slower. **[Day 1]:** measure on your phones.

It runs palm detection only when tracking is lost, then follows the hand cheaply frame to frame [official]. That's why it's fast.

### Windows vs Linux
| Path | Windows | Linux | Our use |
|---|---|---|---|
| **Web** (`@mediapipe/tasks-vision` in Chrome/Edge) | ✅ GPU via WebGL | ✅ GPU via WebGL | **Main path: identical on both, so the OS doesn't matter** |
| **Python** (`pip install mediapipe`) | ✅ CPU. GPU delegate **not supported on Windows** (an open GitHub request) | ✅ CPU; GPU possible | Optional, for batch dataset conversion only |

### Engineering decisions
1. **Convert the NSL dataset in the browser too**, with a converter page that loops over the images. The training data and the live app then use **the exact same model file and code**. If Python made the training points and the web made the live points, small version differences would quietly reduce accuracy. CPU speed is fine: about 1,500 images × ~20 ms ≈ 30 seconds.
2. **Pin exact versions** of `@mediapipe/tasks-vision` and the `.task` model file, and serve the model from our own CDN, not Google's URL, so an upstream change can't break the demo. The npm package is past 1.x now; pick the latest stable release on Day 1 and lock it.
3. **Use the Tasks API only.** The old "Solutions" packages (`@mediapipe/hands`, `@mediapipe/holistic`) are deprecated.
4. **Linux camera note:** Chrome needs camera permission, and some Linux webcams default to low frame rates in low light. Test both machines on Day 1 with the same lighting.
5. If you use Python, use a dedicated virtual environment on Python 3.11 or 3.12. MediaPipe wheels usually lag the newest Python release (**[Day 1]** check).

---

## 6. Meta AI models (unchanged)

| Job | Model | Called when | Cost |
|---|---|---|---|
| Speech → text | Muse Voice Transcribe | While the hearing person speaks | **[Day 1]** |
| Text → gloss | Muse Spark 1.3 | Once per sentence | About $0.0005 |
| Hand outline for unsure letters | SAM 3.1 (`"hand"`) | Held-still, low-confidence frames only | $0.0025/frame [official] |
| Top-3 guesses + conversation → words | Muse Spark 1.3 | When the signer pauses | About $0.0005 |

---

## 7. API contract (every client uses only these)

| Endpoint | In | Out |
|---|---|---|
| `POST /api/token` | Room name, role | LiveKit access token |
| `POST /api/transcribe` | Audio chunk | Text |
| `POST /api/gloss` | Sentence + recent turns | `["HELLO","HOW","YOU"]` |
| `POST /api/decode` | Per-letter top-3 + conversation | Words |
| `POST /api/segment` | JPEG ≤ 200 KB | SAM response passed through |
| `GET /api/signs?lang=nsl` | — | Sign list + motion file URLs (cached on the CDN) |
| `POST /api/recordings` | Motion JSON + consent | id (stored as status `draft`) |
| `POST /api/corrections` | Top-3 + chosen letter (opt-in) | ok |

The rules for every endpoint:
- Validate input (types, size limits).
- Check the rate limit and the budget against `usage_ledger`.
- Return `degraded: true` on any Meta failure so the client falls back to on-device only.

Message types inside the call are defined once in `shared/messages.ts`.

---

## 8. Scaling to new platforms

| Stage | What changes | What stays the same |
|---|---|---|
| **Now: PWA** | — | — |
| **App stores** | Wrap with Capacitor | Everything else |
| **Native Android/iOS** | LiveKit native SDKs + MediaPipe native SDKs + a native UI | API, database, sign library, avatar clips (glTF), classifier maths |
| **Smart glasses** | Companion app built with xg-glass-sdk; glasses show captions, the phone does the work | API and call infrastructure: the glasses are just another LiveKit participant |
| **New sign languages** | New rows in `signs` plus recordings | All code |
| **Group calls / classrooms** | Nothing: LiveKit already does group calls | — |
| **Huge scale** | Self-host LiveKit; Supabase Pro or self-hosted Postgres | App code |

---

## 8b. Two hosts, one codebase (deferred until real launch)

| | Primary | Backup |
|---|---|---|
| Host | Vercel | Cloudflare Workers (OpenNext) |
| URL | `visign.vercel.app` | `visign.<account>.workers.dev` |
| Deployed by | Vercel's GitHub integration, on every push to `main` | GitHub Actions job on `ubuntu-latest`, on every push to `main` |
| Secrets | Vercel environment variables | `wrangler secret put` (Cloudflare secrets) |

**Rules that keep both working:**
- Only standard Next.js App Router features and Route Handlers. No Vercel-only extras (Edge Config, Vercel KV, `@vercel/og`) and no Node middleware, which OpenNext doesn't support.
- **Both hosts share Supabase, LiveKit and Meta.** The backup covers a **hosting** outage only. An outage at one of those three services hits both links.
- **Both links share one budget**, because the cost ledger is in Supabase, so the $75 cap still holds with two hosts.
- Smoke test on every deploy: `GET /api/health` on both URLs, checked in CI.
- **Order of work:** the Vercel deploy is Day 1. The Cloudflare backup is added on **Day 3 morning**, after the demo works, so it never delays the main build.

---

## 9. Load and load balancing

| Problem | What happens | How we handle it |
|---|---|---|
| Many users at once | Vercel functions scale automatically; LiveKit spreads calls across its edge servers | **Load balancing is built into both platforms** |
| Media load | Video goes through LiveKit, never our server | Our server stays tiny |
| LiveKit free cap (100 concurrent connections) | New joins fail | Ship plan ($50) gives 1,000 concurrent. Show "busy, try again" before that. |
| Meta cost spike | Each signer can trigger SAM | Per-user limit (≤ 1 SAM call per 2 s) and a global cap in `usage_ledger`: cheap mode at $60, stop at $75 |
| Meta 429 (rate limit) or outage | Calls rejected or slow | Retry once with a wait, ~3 s timeout, then `degraded: true` and on-device only. **The call never breaks.** |
| Supabase free limits (500 MB, connection caps) | Writes fail | Corrections and sessions are best-effort; the budget ledger is written first. Motion files go in Storage, not the database. Pro plan if needed. |
| Abuse or spam | Cost and noise | Per-IP and per-session limits, size limits, CORS restricted to our domain, recordings saved as `draft` until reviewed |

**Rough capacity (estimate):**
- **LiveKit free:** 100 concurrent connections = 50 simultaneous 1:1 calls.
- **Vercel Hobby:** generous function limits for a demo. **Hobby is for non-commercial use only**, so move to Pro ($20/month) before real launch.
- The first real limit is **Meta cost**, which the ledger caps.

---

## 10. Audit checklists

**Security**
- [ ] The Meta key, LiveKit secret and Supabase service-role key exist only as Vercel environment secrets (server-only, never `NEXT_PUBLIC_`). They're never in git, the client or logs. `.env` is in `.gitignore`.
- [ ] Every endpoint validates its input. Use prepared SQL statements only (no string-built SQL, so no SQL injection).
- [ ] CORS allows only our domain. Rate limits apply per IP and per session.
- [ ] LiveKit tokens are short-lived (e.g. 1 hour) and scoped to one room.

**Privacy (deaf users are a vulnerable group)**
- [ ] A consent screen before the camera or mic turns on. It says plainly that audio clips and some frames go to Meta for processing.
- [ ] Recordings store **joint points, not video**. That's less identifying, smaller and still enough for both directions.
- [ ] Corrections are opt-in. There are no accounts and no personal data. Users can delete their contributions by device ID.

**Engineering baseline**
- [ ] Lockfile committed, exact versions pinned (MediaPipe model files included).
- [ ] GitHub Actions: type-check, lint and unit tests (the classifier and the budget logic) on every push.
- [ ] Vercel runtime logs checked after every deploy (Sentry deferred).
- [ ] Separate preview and production Vercel environments, Supabase projects and LiveKit projects.

**Failure modes**

| Failure | Fallback |
|---|---|
| Camera/mic denied | Explanation screen + typed chat |
| Speech recognition fails | Web Speech API, then typing |
| Wrong letter | "Type letter" override + undo (saved as a correction) |
| Unknown word | Fingerspell it |
| 3D avatar not ready | 2D avatar |
| Budget reaches $60 / $75 | Cheap mode / paid calls refused, with a notice |
| LiveKit unreachable | Clear error with a retry button |

---

## 11. How we work: plan → build → review → audit, daily gates
1. **Plan:** pick the day's tasks from PLAN.md, each with a "done when" line.
2. **Build:** the smallest version that passes it.
3. **Review:** each other's code, tested on a **real phone over mobile data** and on **both Windows and Linux**.
4. **Audit:** section 10 checklists, spend checked in `usage_ledger` and Meta billing, and measured numbers recorded in section 12.

---

## 12. Day 1 measurements (each one confirms or changes a decision)

| Measurement | Target | Measured | If it misses the target |
|---|---|---|---|
| SAM 3.1 round trip from Nigeria | < 1 s | **Missed (Oct 29, laptop in Lagos).** Accuracy is good: it found both hands in a test photo. Full 960 px frame uploaded (241 KB): **31.1 / 27.5 s**. Same frame by URL: 9.2 / 13.4 s. **Hand crop, 188×224 (9.8 KB): 7.6 / 3.9 s.** | Done: `/api/segment` accepts crops ≤ 45 KB only. The client crops with the MediaPipe box. SAM moves **off the live path**: it shows the outline overlay and refines uncertain letters when the word is decoded, never blocking a letter. Re-measure from Vercel. | SAM for the visible outline only |
| Muse Spark gloss delay | < 2 s | **Missed, from the laptop in Lagos (Oct 29): 2.8–16.7 s, typical ~8 s.** 150–800 hidden reasoning tokens per reply even at `minimal` (`none` is rejected). One connect timeout. | Done: 6 s deadline, then local gloss (filler/article removal). Decode shows raw letters first. **Re-measure from Vercel**, where the network leg is far shorter. | Shorter prompts or a smaller model |
| Voice Transcribe delay + price | < 2 s | **2 s clip: 4.25 / 2.23 / 1.94 s** (first call cold). $0.18/hour [official]. | Mostly met. Most of the delay is the Lagos network (a bare Meta request takes 0.9–2.3 s from here, Google 1.2–1.9 s). | Web Speech API as primary |
| MediaPipe fps: Windows laptop / Linux laptop / phones | ≥ 15 | | Lower the resolution or frame rate |
| LiveKit call on MTN/Airtel mobile data | Connects, < 300 ms delay | | Try Stream; check regions |
| `livekit-server-sdk` on the Next.js Node runtime | Works | | Sign tokens with `jose` directly |
| Kalidokit with Tasks API landmarks | Fingers rotate correctly | | Our own finger-angle solver |
| Classifier on a held-out signer | ≥ 80% static letters | | More samples + SAM outline features |

---

## Sources
- Calls:
  - [LiveKit pricing](https://livekit.com/pricing)
  - [Stream Video SDK](https://getstream.io/video/sdk)
  - [Agora free minutes](https://docs.agora.io/en/api-reference/faq/account/billing_free)
  - [Agora network](https://www.agora.io/en/network)
  - [Cloudflare Realtime pricing](https://developers.cloudflare.com/realtime/sfu/pricing)
  - [100ms pricing overview](https://www.100ms.live/blog/video-call-api-pricing)
  - [Digital Samba comparison](https://www.digitalsamba.com/blog/top-video-conferencing-sdk-vendors)
- Database:
  - [D1 vs Supabase (freetier.co)](https://freetier.co/compare/cloudflare-d1-vs-supabase)
  - [D1 free tier](https://freetier.co/articles/cloudflare-d1-free-tier-limits-pricing-and-alternatives)
  - [Database hosting options](https://flaviocopes.com/database-hosting-options/)
- MediaPipe:
  - [Hand Landmarker guide + benchmark](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)
  - [Holistic Landmarker (web)](https://developers.google.com/edge/mediapipe/solutions/vision/holistic_landmarker/web_js)
  - [Windows GPU issue #4575](https://github.com/google-ai-edge/mediapipe/issues/4575)
- Avatar:
  - [Kalidokit](https://awesome.ecosyste.ms/projects/github.com%2Fyeemachine%2Fkalidokit)
  - [VTuber with three.js + VRM](https://forem.com/wawasensei/how-to-create-a-vtuber-studio-with-threejs-react-vrm-2f6f)
  - [Ready Player Me shutdown](https://avatarsdk.com/blog/2026/08/31/avatar-platforms-2026-whos-alive-whos-gone/)

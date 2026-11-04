# Visign: 3-day build plan

> Planning document written before the build. Not everything here was built; README.md describes what is.

Meta Global AI Developer Hackathon, Indie Dev Track (a team of up to 4; list every member on the form).
**Submission deadline: Nov 4, 9:00 PM ET = Nov 5, 3:00 AM Lagos time.** Aim to submit on the evening of Nov 4.
Submit at cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit. You must be signed in to see the form, so check its fields on Day 1.

## 1. What the rules mean for us

| Clause | What it means for Visign |
|---|---|
| Judging: **Impact 30%**, **Use of Meta AI tooling 25%**, **Technical depth 20%**, **Demo 25%** | Half the score is impact plus demo. The video has to show a real two-way conversation. |
| Meta tooling: "beyond a basic integration, surfaced unexpected capabilities" | Each Meta model does a core job (section 3), and the video points each one out. |
| Demo: "holds up live" | Every risky part needs a fallback. |
| The submission must be your original work; open-source licenses must be followed | Use only CC BY or MIT data, and credit it in the README. **No non-commercial (NC) data.** |
| Meta gets a perpetual license to the submission and there is no confidentiality | Keep API keys out of git. |
| $150 credits for the event window | **Hard cap: $75** (section 5). |
| Bonus prizes (community vote, most viral) | Post the demo clip publicly on Nov 4. |

## 2. What we're building (and what we aren't)

A live video call between a hearing person and a deaf person, working in both directions:
- **Hearing → deaf:** speech becomes text, the text becomes short sign order ("gloss"), and a **2D cartoon avatar** signs it in the corner of the call.
- **Deaf → hearing:** the deaf person's signing is tracked and read as letters, the letters become words, and the words appear as captions.

It runs on desktop and mobile from one codebase, as a web app that installs on phones (a PWA).

**Not building:** full sign-language grammar, continuous signing, a 3D avatar, native app-store apps, accounts or smart glasses. Those go in the README roadmap; the glasses path is xg-glass-sdk.

**Our edge over Terp 360** (Signvrse, Kenya, 2025 Africa Prize): Terp 360 only goes speech → sign. **Visign is two-way in a live call and supports Nigerian Sign Language.**

## 3. Models: what each one does

**No Meta model reads sign language.** The letter recognition is our own work. Each Meta model has one clear job:

| Job | Model | Runs where | Cost |
|---|---|---|---|
| Speech → text | **Muse Voice Transcribe** (Meta) | API | Price not checked yet (Day 1) |
| Speech → short gloss ("um, would you like water?" → WATER YOU WANT?) | **Muse Spark 1.3** (Meta) | API | About $0.0005 per message |
| Live hand tracking: 21 joints per hand | **MediaPipe Hand Landmarker** (open source, Apache 2.0) | On the device, about 15–30 fps | Free |
| Joints → letter, with the top 3 guesses | **Our classifier** (a nearest-neighbour model or small neural net on the joints) | On the device, under 1 ms | Free |
| Hand outline for letters the classifier is unsure about | **SAM 3.1** (Meta), prompt `"hand"` | API, **only on held-still, uncertain frames** | $0.0025 per frame |
| Letter guesses + conversation → the right word | **Muse Spark 1.3** | API | About $0.0005 per message |

**How the pieces link (the clever part):**
- **A. Joints + outline:** MediaPipe joints get confused when fingers overlap (A/E/M/N/S/T). SAM's silhouette tells those apart. Both feed one classifier.
- **B. Muse Spark as the decoder:** we send it the top 3 guesses with confidence for each letter, plus recent conversation. It picks the word that makes sense ("do you want water?" → Y-E-S, not Y-E-A).
- **C. One recording, two directions:** the joint recordings that train the classifier also animate the avatar.

**How SAM 3.1 works:** you send an image and a short phrase (`"hand"`). It finds every matching object and returns a box plus a pixel-precise mask, with a stable ID per object across video frames. It needs no training. The call is `POST https://api.meta.ai/v1/responses` with `model: "sam-3.1"`, and `@meta-sam/parser` decodes the output. Empty output means no hand was found.
- **Limits:** it outlines the hand but doesn't know letters. For video it takes uploaded clip files, not a live camera, so we send still frames.
- **Speed:** about 30 ms on Meta's GPU. My estimate over the API from Nigeria is 0.4–1 s. **Not measured yet; that's the first Day 1 test.**

## 4. Data

**NSL and ASL are both first-class.** Verified Oct 30 by viewing real samples: NSL fingerspelling handshapes match ASL's (A, B, L, V, Y, 5 identical), so the two datasets reinforce each other for static letters. The language setting changes the word signs, not the alphabet.

| Source | Verified | Use | License |
|---|---|---|---|
| **NSL Alphanumeric Dataset**, Adeniyan et al. (zenodo.org/records/21672976, also on Kaggle) | ✅ 8 real images viewed: at least 4 different Nigerian signers, real rooms, correct handshapes. 33,582 images, about 1,000 per class, letters A–Y (no J/Z) and digits 1–9. | Main NSL letter data, plus variety across signers | CC BY 4.0: **credit it in the README** |
| **ASLNow!** (Hugging Face, sid220/asl-now-fingerspelling) | ✅ Downloaded all 2,122 samples. Skeletons for A, B, L, V, W, Y, M, Z drawn and correct. **Same MediaPipe 21-point format we use**, so no conversion needed. | ASL letters A–Z, including single-frame J and Z; extra variety for the shared static letters | MIT |
| **Team recordings** | — | J and Z with motion, plus word signs in **both** NSL and ASL: HELLO, HOW, YOU, YES, NO, THANK-YOU, WATER, PLEASE. Ideally signed by deaf signers. | Our own |
| FSboard (Google) | License only (CC BY 4.0, per the arXiv paper) | **Later:** over 3 million characters of continuous phone fingerspelling, for decoding whole words. Too large for 3 days. | CC BY 4.0 |
| ~~Kolawole NSL set~~ | — | Use only as a list of words to record, never as training data | CC BY-NC 4.0 (non-commercial, so excluded) |

**Data-quality issues found (handle in the converter):**
- **Every NSL image is augmented** (rotated with black corners, or with added noise); there are no originals. Normalize joints relative to the wrist and the hand's own rotation so this doesn't matter.
- **Many NSL images are near-duplicate video frames.** Sample across different source videos (from the file names), not consecutive frames.
- **Some NSL backgrounds show the letter as printed text** (e.g. "A", "L" on a headboard). It's harmless for our joint-only classifier, but never train an image model on it.
- **A possible NSL mislabel:** a "W" sample showed two fingers, like V; ASLNow's W has three. Spot-check about 10 images per class and drop wrong ones.

**Pipeline (don't download all 17.8 GB):**
1. NSL: fetch about **50 images per class by byte range** from the Zenodo archive (scripts proven Oct 30: read the archive's table of contents, then fetch single files), spread across different source videos.
2. Run MediaPipe over them in the browser converter and save the 21 joint points to `landmarks.json`, a few MB. ASLNow! is already joints: just copy it in, tagged `asl`.
3. Record about 30 samples per letter per team member with the same recorder page. Word signs are recorded as **joint sequences over time**, with both hands.
4. Train the classifier on the combined points. Keep **one person's data out of training** and test on it, so we know how well it works on a new signer.

## 5. Budget: hard cap at $75 of the $150

| Use | Cap |
|---|---|
| Building and testing | $45 |
| Demo recording | $15 |
| Reserve for judges trying it live | $15 |

- The server keeps a running cost total for every call.
- **At $60:** cheap mode, with SAM off and on-device recognition only.
- **At $75:** it refuses all paid calls.
- Also limit SAM calls per minute per user. Check Meta's billing page daily.

## 6. Avatar: 2D cartoon driven by recorded motion

- A friendly 2D character (head and body) drawn on a canvas. The hands are drawn from the 21 joint points with thick, rounded, outlined fingers.
- It **replays recorded motion** and blends smoothly from one sign to the next. This avoids the "mechanical" look Terp 360's testers complained about.
- Muse Spark turns speech into gloss. Recorded words play as signs; any other word is fingerspelled.
- Muse Image may design the character's face and outfit as a still image. **Not the hands**, because image models draw fingers badly.
- Honest limit: real signing also uses the face and body. Plan a review by a deaf signer, and put it on the roadmap.

## 7. Architecture

```
Hearing device                                  Deaf device
 mic → server → Voice Transcribe → text          camera → MediaPipe (on device) → hold detector
     → Muse Spark → gloss ──── data channel ──►     → classifier (top-3) ─┬─ sure → letter
 captions ◄──── data channel ──── words ◄──────     unsure → server → SAM mask → classifier
                                                   letters → server → Muse Spark decoder → words
                                                 gloss → avatar replays recorded joints
        LiveKit video + data channel (TURN included). Video never goes through our server.
```

- **Frontend:** Next.js 15 (App Router) + React + TypeScript, as a PWA (manifest file + icon), phone-first layout. Camera/call/avatar screens are client components. Roles are set with `?role=hearing` / `?role=deaf`.
- **Server:** Next.js Route Handlers (`app/api/*/route.ts`). It holds the key (never in the browser), forwards calls to Meta, and enforces the cost cap. ARCHITECTURE.md explains why.
- **Hosting:** Vercel (native Next.js, HTTPS by default, automatic scaling). **A TURN relay is required for mobile data.**
- **Why it scales:** video is peer to peer, the server is stateless and passes only text and occasional frames, and one codebase covers desktop and mobile.

## 8. Team split (adjust after your discussion)
- **Person A, recognition:** recorder page, dataset → joint points, classifier, SAM link, Muse Spark decoder.
- **Person B, call + avatar:** LiveKit call, speech pipeline, 2D avatar (3D VRM as a stretch if a third person or spare time allows), phone layout, deployment.
- **Both:** recording signs, the demo script and video, the README.

## 9. Day plan

**Day 1: prove the risky parts**
- [ ] A: get the API key working through the server, with the cost cap built in from the start. Time **SAM**, **Muse Spark** and **Voice Transcribe** calls from here, and check Voice Transcribe's price and how it handles Nigerian accents.
- [ ] A: download the NSL subset. Build the recorder page (MediaPipe → JSON) and convert the dataset to joint points.
- [ ] B: PWA shell deployed over HTTPS, and a LiveKit call working **between a laptop and a phone on mobile data**. Set up the Supabase schema (ARCHITECTURE.md section 3).
- [ ] B: speech pipeline from mic → Voice Transcribe → Muse Spark gloss → text arriving on the other device.
- [ ] Both: record letters and word signs.
- **Done when:** one direction works as text across two devices, and we have the latency numbers.

**Day 2: both directions**
- [ ] A: classifier with top-3 output, the held-out signer test, the SAM outline for uncertain letters, and the Muse Spark decoder → captions.
- [ ] B: 2D avatar replaying the recorded joints, gloss → signs or fingerspelling.
- **Done when:** a full two-way conversation works end to end, even if it's rough.

**Day 3: polish, demo, submit**
- [ ] Fix only what breaks the demo script. Add the fallbacks: type letters by hand, a replay button, and cheap mode.
- [ ] README: the problem, diagram, where each Meta model is used, dataset credits (CC BY), and a roadmap mentioning Terp 360 as related work.
- [ ] Demo video (2–3 minutes), then submit, then post the clip publicly.

## 10. Demo video script (about 2.5 minutes)
1. **Hook (15 s):** "Speech-to-text helps a deaf person read what's said. Nothing translates back."
2. **Live conversation (75 s):** one person on a laptop, one on a phone. Hearing: "Hi, how are you? Would you like some water?" → the avatar signs it. Deaf: signs "YES THANK-YOU" → caption appears.
3. **Under the hood (40 s):** the joints, the SAM outline on a confusable letter, the top-3 guesses → the Muse Spark pick, and speech → gloss.
4. **Impact (20 s):** Nigerian Sign Language users, works on any phone, smart glasses next.

## 11. Still to check (Day 1)
- Voice Transcribe price, speed and accent handling.
- Real SAM speed from Nigeria.
- Muse Spark's image input cost, if we use it.
- API rate limits on our account.
- The submission form's fields.
- Whether MediaPipe finds hands reliably in the NSL images.

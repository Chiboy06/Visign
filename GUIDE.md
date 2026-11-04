# Visign: finishing guide (training, testing, video, submission)

Written for everyone on the team, including non-programmers. Follow it top to bottom.

**The official deadline is Tuesday Nov 4, 9:00 PM New York time, which is Wednesday Nov 5, 3:00 AM Lagos time.**
Plan to submit on **Nov 4 in the evening (Lagos)**, so a bad connection can't make you miss it.

---

## 1. Your plan for the last day

| Lagos time | What | Who | Section |
|---|---|---|---|
| Morning, 1 hour | Record your signs in the recorder | Every signer on the team | [3](#3-recording-your-signs-training-data) |
| +15 min | Retrain the model and check the scores | Whoever has the code | [4](#4-retraining-the-model) |
| +20 min | Test a real call: laptop plus phone | Two people | [5](#5-testing) |
| +2 hours | Record and edit the demo video | Everyone | [6](#6-the-demo-video) |
| Evening | Fill in the submission form and post the clip | The Representative | [7](#7-submitting) |
| Before you submit | Read the rules checklist | Representative | [8](#8-rules-checklist-dont-get-disqualified) |

If time runs short, **cut recording, never the video.** The demo video is 25% of the score.

---

## 2. Where Visign stands

**Works (tested):**
- Hearing person speaks → Meta transcribes → Muse Spark shortens it → the deaf person sees text plus the avatar fingerspelling.
- Deaf person fingerspells to the camera → letters appear live → Muse Spark turns them into a word → the hearing person reads it.
- Typing works both ways as a backup.
- The budget guard stops paid AI calls at $75 (half your credits).
- The duplicate-message bug from the first test is fixed.

**Known limits (say these honestly in the video if asked):**
- It recognizes **fingerspelled letters**, not full signed sentences. No usable public dataset of signed sentences exists for NSL, and the ASL ones are research-only licenses we can't use (see Section 9).
- Word signs (HELLO, THANK-YOU…) are fingerspelled by the avatar for now.
- Each spoken message takes about 6 seconds, mostly network time from Lagos to Meta's servers. Translations take another 5–12 s.
- It understands **fingerspelling only**, not full signs (WATER, THANK-YOU…). In the video, say "fingerspelling".
- Speech input is in English (Meta's transcription doesn't support Yoruba, Hausa or Igbo yet). Translation applies to what the hearing person reads and hears.
- Reading aloud uses the device's own voices. Most phones and laptops have English and French, but rarely Yoruba, Hausa or Igbo; then the text is shown without audio.

---

## 3. Recording your signs (training data)

### Why this matters
"Training" here means **showing the app examples of each letter.** When you sign later, it finds the examples that look most like your hand and picks the most common letter among them. Right now its examples come from strangers (an American dataset). **Adding your own team's hands is the biggest accuracy boost available.** It also turns Visign into a Nigerian Sign Language project with Nigerian signers, which helps the Impact score (30%).

### What is saved
**No photos and no video.** The recorder saves only **21 dots per hand** (the joints MediaPipe tracks). That's private, small, and exactly what the app uses.

### What you need
- A laptop with a webcam and **Chrome or Edge**.
- **Good, even light** in front of you (not a bright window behind you).
- A plain-ish background.
- 15–20 minutes per person.
- **Each signer must agree** to their hand data being used, by ticking the consent box. Don't record anyone who hasn't.

### Steps (for each person)
1. Open the app: the Vercel link + `/tools/record`, or `http://localhost:3000/tools/record` if running locally.
2. Tick the **consent** box.
3. **Signer ID:** type your **initials** (e.g. `ca`). Never your full name. Use the **same initials every time.**
4. **Language:** choose **NSL**.
5. Click **Start camera** and allow camera access. You'll see your hand with a skeleton drawn on it.
6. **Sign:** pick **A** from the menu.
7. Make the A handshape, hold it still, and press **Space**. "Captured A" appears.
8. Repeat **25 times** for A, changing slightly each time: a bit closer, a bit further, tilted a little left or right, higher or lower in the frame. **Variety teaches more than repeats.**
9. Move to **B** and repeat, through every letter you know.
   - **J and Z** move. The recorder switches to **motion mode** automatically: press Space, then do the movement within 1.5 seconds. Record about 10 of each.
   - Digits **1–9** work the same as letters.
10. At the end, click **Download**. A file like `recording-rec:ca-1730000000.json` is saved.
11. Send the file to whoever runs Section 4 (WhatsApp, Drive, email: it's small).

**Tips:**
- If the skeleton isn't drawn on your hand, the app can't see it. Fix the light or move closer.
- One wrong capture doesn't matter much. If you capture many wrong ones, reload the page and start that letter again (nothing is saved until Download).
- **Several people** recording 25 per letter beats one person recording 100 per letter.

### Optional: the NSL photo dataset
We downloaded 495 real Nigerian Sign Language photos (15 per letter and digit) into `data/raw/nsl`.
1. Open `/tools/convert`, choose **NSL**, click **Pick a folder** and choose `data/raw/nsl`.
2. Wait until it finishes. Look at the cards: **click any card whose hand clearly doesn't match its letter** (for example a "W" with only two fingers). That excludes it.
3. Click **Download landmarks.json** and treat that file like a recording in Section 4.

---

## 4. Retraining the model

Done once, on the laptop that has the code, after collecting everyone's files.

1. Put every downloaded file (`recording-….json`, `landmarks-….json`) into the folder **`data/landmarks/`** in the project. Create the folder if it doesn't exist.
2. Open a terminal in the project folder (in VS Code: **Terminal → New Terminal**) and run:
   ```bash
   npm run model
   ```
3. Read the output. Here's what each line means:

   | Line | Meaning | Good result |
   |---|---|---|
   | `samples: 3500 ({"asl":2122,"nsl":1378})` | How many examples it learned from, per language | NSL count went up |
   | `held-out accuracy: top-1 …` | Score on examples it didn't train on, but from **the same people** (flattering) | Above 90% |
   | `new-person test, ca: 78% …` | **The honest score:** trained without `ca`, tested on `ca` | Above 70% is good for fingerspelling |
   | `weakest letters: A 84%…` | Letters it confuses most | Record more of these |
   | `top confusions: A→S x2` | Which pairs get mixed up (A read as S) | Expected for similar shapes |

4. If a letter is weak, **record more of that letter** (from more people) and run `npm run model` again.
5. Publish the new model so the live app uses it:
   ```bash
   git add data/landmarks public/model
   git commit -m "data: add team NSL recordings and retrain"
   git push
   ```
   Vercel redeploys automatically in about 2 minutes. Recordings are committed so teammates can retrain too; they contain only hand dots and initials.

---

## 5. Testing

### Test A: the letters, alone (5 minutes)
1. Open `/call`, choose **I sign**, click **Join call**. It's fine that nobody else is there.
2. Sign a letter and hold it still for half a second. **An ochre tile with the letter should appear.**
3. Spell a short word (e.g. **H-I**), then **lower your hand briefly** to finish it. Spell another, then pause for **3 seconds** (or tap **Send now**) to send the whole sentence.
4. Write down letters that come out wrong; those are the ones to record more of.

### Test B: the full call, two devices (15 minutes)
Use **the Vercel link (`https://…`)**. Phones block the camera and microphone on non-HTTPS links.
1. **Laptop:** `/call` → **I speak** → **Join call** → copy the share link.
2. **Phone:** open the link → it opens as **I sign** → **Join call**.
3. Check each item:
   - [ ] Both sides see each other's video.
   - [ ] Laptop: **hold** the round button, say "Would you like some water?", release. After about 6 s the phone shows the text **once**, and the avatar spells it **once**.
   - [ ] Phone: sign a short word, lower the hand, and the laptop shows the word **once**.
   - [ ] Typing works both ways.
4. **Only click Join once** and wait. Use one tab per device.

### If something fails
| You see | Do this |
|---|---|
| "Camera unavailable" | Close other tabs or apps using the camera, reload, join again |
| "Transcription unavailable" | Check `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in Vercel → Settings → Environment Variables, then Redeploy |
| "Could not join" | Check the three `LIVEKIT_` variables in Vercel, then Redeploy |
| Letters are mostly wrong | Better light; record more of your own samples (Section 3) |
| Anything else | Copy the exact message and send it to the developer |

---

## 6. The demo video

Judges score the demo at **25%**: "a working, impressive demo, whether the product holds up live, and the quality of the demo video."

### Length and format
- **2–3 minutes.** Check the submission form for any limit; it's only visible once you're logged in, so check it **today**.
- Landscape, 1080p if possible. Record the laptop screen (Windows: **Win + Alt + R**, or OBS Studio, which is free) **and** film the phone or person with a second phone.
- Upload to **YouTube (Unlisted)** or Loom, and test that the link opens in a private window.

### Script (about 2.5 minutes)
1. **The problem (0:00–0:20).** A person on camera: "Speech-to-text helps a deaf person read what's said. But when they sign back, nobody understands. Visign translates both ways."
2. **Hearing → deaf (0:20–1:00).** Split screen. The hearing person holds the button: "Hi, would you like some water?" Show the phone: the caption appears, then the avatar fingerspells WATER.
3. **Deaf → hearing (1:00–1:40).** The deaf signer spells **Y-E-S**, or a short group like **YOU · WANT · WATER** that the hearing side receives as "Do you want water?" (practise words that recognize reliably first). Show the ochre letter tiles, then the laptop receiving "YES". Then switch the laptop's **Read and hear signing in** to **Yoruba** (or Pidgin), sign again, and show the translation appear with the English underneath. Ask a native speaker to check it before recording.
4. **How Meta's AI does it (1:40–2:15)**, with on-screen labels:
   - **Muse Voice Transcribe** turns speech into text.
   - **Muse Spark** shortens speech to the words worth signing, and fixes unclear letters using the conversation ("H-E-L-O" becomes "HELLO"), and translates signed messages into Yoruba, Hausa, Igbo, Pidgin or French.
   - **SAM 3.1** outlines the hand to tell look-alike letters apart.
   - Hands are tracked on the device, so video never touches our server.
5. **Impact (2:15–2:35).** "Built with Nigerian signers for Nigerian Sign Language and ASL. Works on any phone browser. Next: word signs, more Nigerian data, smart glasses."

### Recording tips
- **Rehearse twice** before recording. Each spoken message takes ~6 s; **cut the waits** in editing (say "sped up" on screen if you do).
- Use words you've **tested** (Test A) for the signing part.
- Good light on the signer's hand; plain background; quiet room.

### Video rules (important)
- **Never show `.env`, API keys, or the Vercel / Supabase / LiveKit dashboards.** Anything shown is public forever.
- **No copyrighted music.** Use none, or YouTube Audio Library tracks marked free to use.
- **Everyone who appears must agree.** Meta gets the right to use the video in its marketing.
- Don't overclaim. Say "fingerspelling", not "translates full sign language".

---

## 7. Submitting

1. Go to **https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit** and sign in with the account that was accepted. **Open it today** to see the fields.
2. Track: **Indie Developer** (it must match your application).
3. Typical content to have ready:
   - **Name:** Visign
   - **One-line description:** "A live two-way bridge between sign language and speech: speech becomes captions and a fingerspelling avatar, and fingerspelling becomes text. NSL and ASL, in any browser."
   - **Demo video link.**
   - **Live app link** (the Vercel `https://…` link).
   - **Code:** https://github.com/Chiboy06/Visign. Make sure the repo is **public**, or give the judges access if the form asks.
   - **Team members:** every person, listed by the Representative.
   - **How you used Meta's models:** copy the three bullets from the video script, step 4.
4. Submit, then **check you got a confirmation** (screen or email).
5. Optional: post the clip on X or LinkedIn with #MetaHackathon for the bonus "community / most viral" prizes.

---

## 8. Rules checklist: don't get disqualified

From the Official Rules (re-read Nov 1; unchanged since applications):

- [ ] **Submitted before Nov 4, 9:00 PM ET (Nov 5, 3:00 AM Lagos).**
- [ ] **One track only**: Indie. The submission must be entered in the same track.
- [ ] **Team of up to 4**: all members listed; one Representative submits; everyone has read the rules.
- [ ] **Everyone is 18+** and eligible (Nigeria is eligible).
- [ ] **Original work.** Our code is ours. Open-source parts (Next.js, MediaPipe, LiveKit, Supabase) are MIT or Apache-2.0, which is allowed.
- [ ] **Data licenses respected and credited** (in the README): NSL dataset (CC BY 4.0) and ASLNow! (MIT). **Don't add datasets marked "NC" / non-commercial** (e.g. How2Sign): the rules give Meta a license to use the project for any purpose.
- [ ] **Privacy:** the call screen tells users what goes to Meta's AI; recordings need consent and store initials only.
- [ ] **Uses Meta's models:** Muse Spark, Muse Voice Transcribe, SAM 3.1 (25% of the score).
- [ ] **Credits:** used only for this project, under $75 so far. Re-read the **Credit Terms** from your Meta dashboard (Claude couldn't open the expired link).
- [ ] **Video:** no secrets on screen, no copyrighted music, everyone shown has agreed.
- [ ] **Code of conduct:** respectful in Discord and all event spaces.

---

## 9. Why we don't train on full sentences (if the judges ask)

| Dataset | What it is | Why we can't use it |
|---|---|---|
| How2Sign | ASL sentences | Research-only license (non-commercial) |
| YouTube-ASL | ASL sentences | Videos are under YouTube's terms; downloading them isn't allowed |
| PopSign | 250 single ASL words | Usable (CC BY 4.0), but words, not sentences, ASL only, and a new model would be needed |
| NSL sentences | — | **None exist publicly.** That gap is part of why Visign matters. |

Recognizing continuous signed sentences is an open research problem. Fingerspelling plus a conversation-aware AI decoder is what works reliably today. Recording Nigerian signers with our own tool is how we build toward word signs and sentences.

---

## 10. Words you might hear

| Word | Plain meaning |
|---|---|
| Landmarks / hand points | The 21 dots on your hand joints that the app tracks |
| Training data | Example hand shapes with their correct letter |
| Model | The file (`public/model/letters.json`) holding all those examples |
| Classifier | The part that compares your hand to the examples and picks a letter |
| Held-out / new-person test | Checking the model on examples it didn't learn from |
| Gloss | The short version of a sentence used for signing ("WATER YOU WANT?") |
| Deploy / redeploy | Publishing the latest code to the Vercel link |
| Environment variables | The secret keys stored in Vercel, never in the code |

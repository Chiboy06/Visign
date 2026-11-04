# Visign: submission kit

Copy-paste text for the Cerebral Valley form, plus the demo script. Fill in the three links and the team list.

- **Track:** Indie Developer
- **Live app:** `https://<your-project>.vercel.app`
- **Code:** https://github.com/Chiboy06/Visign (make it **public** before submitting)
- **Demo video:** `<YouTube unlisted or Loom link>`
- **Team:** `<names>` (the Representative submits and lists everyone)

---

## One-line description
A live two-way video call between a hearing and a deaf person: speech becomes captions and a fingerspelling avatar, and fingerspelling becomes a natural sentence, read aloud in the listener's language.

## Short description (about 100 words)
Speech-to-text helps a deaf person read what is said, but when they sign back, nobody understands. Visign translates both ways in one call that runs in any browser. The hearing person holds a button and talks, in English or Nigerian Pidgin. The deaf person reads plain English and watches a cartoon signer fingerspell it. The deaf person fingerspells to their camera. Their letters become one natural sentence that the hearing person reads and hears, in English, Yorùbá, Hausa, Igbo, Pidgin or French. Hands are tracked on the device, video goes peer to peer, and it's built with Nigerian Sign Language data.

## How we used Meta's AI
- **Muse Voice Transcribe** turns the hearing person's speech into text, one utterance at a time.
- **Muse Spark 1.3**, two jobs, one call per message each:
  1. **Speech → reader:** turns English or **Nigerian Pidgin** into plain English for the deaf reader, plus a short gloss of the words worth fingerspelling for the avatar.
  2. **Signing → listener:** receives every spelled letter **with the hand classifier's alternatives** and the recent conversation. It fixes look-alike handshapes (A/E/S/T/M/N), restores double letters, and writes **one natural sentence in the listener's language**. Example: Y-O-U · W-A-N-T · W-A-T-**S**-R becomes "Do you want water?".
- **SAM 3.1:** tested on hand crops (it found every hand). From Lagos it takes 4–8 s per crop, too slow for a live letter, so it's our next step for separating fist letters, not part of the live loop yet.

## How it works
- **On the device:** MediaPipe tracks 21 hand joints. A k-nearest-neighbour classifier reads letters from hand-shape features that ignore position, size and which hand is used. A speller turns held letters into words and pauses into sentences.
- **Call:** LiveKit carries video peer to peer, with a data channel for messages.
- **Server:** Next.js route handlers on Vercel. The Meta key never reaches the browser.
- **Budget:** every paid AI call reserves spend first in a locked Postgres function (Supabase). It stops at $75, half our credits.
- **Fallbacks:** if Meta is slow or down, the app shows the words as spelled or spoken instead of freezing. Typing works both ways.

## Data (all licensed for this use, credited in the repo)
- **NSL Alphanumeric Dataset** (Adeniyan, Afolayan & Johnson, 2026, CC BY 4.0): 483 Nigerian Sign Language samples.
- **ASLNow!** (MIT): 2,122 ASL letter samples.
- **Team recordings:** our own recorder saves hand joints only, never video, with consent.

**Accuracy:** 95.8% top-1 and 99.0% top-3 on held-out samples. That's optimistic, because the same signers are in training and test; our tool also reports an honest new-person score.

## What's new here
- **Both directions in one call**, on any phone or laptop, with no special hardware.
- **The conversation helps read the signing:** Muse Spark sees the classifier's alternatives and what was just said, so "WATSR" after "I'm thirsty" becomes "water".
- **Built for Nigeria:** Nigerian Sign Language data, Pidgin understood, replies in Yorùbá, Hausa or Igbo.
- **A sign recorder that lets a community add its own data.** One recording trains recognition and can drive the avatar.

## Honest limits
- Visign understands **fingerspelling**, not full signs (WATER or THANK-YOU as real signs, facial grammar). No openly licensed NSL dataset of signs or sentences exists.
- Speech input is English or Pidgin. Meta's transcription doesn't support Yorùbá, Hausa or Igbo yet; translation applies to what the listener reads and hears.
- Read-aloud uses the device's voices. Most devices have English and French, but rarely Yorùbá, Hausa or Igbo (then text only).
- From Lagos, each AI step takes a few seconds, mostly network time.

## What's next
1. Word signs from motion: DynASL-24 (CC BY 4.0: HELLO, THANKS, PLEASE, YES, NO…) plus Nigerian signers recorded with our tool.
2. SAM 3.1 for look-alike fist letters, once it runs in the background.
3. App-store builds, then smart glasses (captions in view).

---

## Demo video script (2–3 minutes)

**Before recording:**
- Use the **Vercel `https://` link** on two devices.
- Rehearse once.
- Pick words that recognize reliably (test them in Test A of GUIDE.md).

1. **The problem (0:00–0:20).** "Speech-to-text helps a deaf person read. But when they sign back, nobody understands. Visign works both ways."
2. **Hearing → deaf (0:20–0:55).** Laptop, as **I speak**: hold the button and say *"Abeg, you want water?"* Show the phone: it reads **"Do you want water?"** (Pidgin under it) and the avatar spells YOU WANT WATER.
3. **Deaf → hearing (0:55–1:40).** Phone, as **I sign**: spell **Y-E-S**, lower the hand briefly, then pause. Show the ochre tiles, then the laptop receiving **"Yes."** and reading it aloud. Then on the laptop, pick **Yorùbá** (or Naijá) and sign again to show the translated sentence.
4. **How Meta's AI does it (1:40–2:15).** On-screen labels:
   - *Muse Voice Transcribe:* speech to text.
   - *Muse Spark:* Pidgin to English and the avatar's words; spelled letters plus alternatives into one sentence in your language.
   - *SAM 3.1:* tested for hand outlines, our next step.
   - *Hands tracked on your device; video never touches our server.*
5. **Impact (2:15–2:40).** "Built with Nigerian Sign Language data, for any phone browser. Next: real word signs recorded by Nigerian signers."

**Rules for the video:**
- Cut the waiting time in editing (say "sped up").
- Never show `.env`, API keys or dashboards.
- No copyrighted music.
- Everyone on camera has agreed to appear.
- Say "fingerspelling", not "full sign language".

## Using the voice features
- **Hearing person speaking:** press and **hold** the round **Hold to speak** button (or hold Space), talk, then **release**. The words go when you let go.
- **Hearing person listening:** on the join screen or in the call, pick a language chip and keep **Read aloud** on. Each signed sentence is spoken by the device's voice. If the device has no voice for that language, the app says so and shows the text only.
- **Deaf person:** no audio is needed. Read the captions and watch the avatar.

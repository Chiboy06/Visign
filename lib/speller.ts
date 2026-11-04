import type { Guess } from "./classify";

export const HOLD_MS = 500; // a letter counts once its handshape is held this long
export const GAP_MS = 1200; // no hand for this long ends the word
export const MIN_P = 0.45; // below this the classifier is unsure: don't commit
export const SENTENCE_GAP_MS = 3000; // no hand for this long after a word ends the sentence

export type SpellEvent = { letter?: Guess[]; word?: Guess[][]; sentenceEnd?: true };

/**
 * Turns per-frame classifier guesses into committed letters and finished words.
 * The same letter is never committed twice in a row while the hand stays up: classifier flicker
 * (O, unsure, O) used to produce "OOOOO". shortcut: so a double letter (the LL in HELLO) needs the
 * hand lowered between the two; Muse Spark's decode usually restores it from context.
 */
export function createSpeller() {
  let candidate: string | null = null;
  let since = 0;
  let committed = false;
  let lastCommitted: string | null = null;
  let lastHand = 0;
  let word: Guess[][] = [];
  let sentenceOpen = false; // a word was finished and the sentence hasn't been closed yet

  return function push(t: number, top: Guess[] | null): SpellEvent {
    if (!top || top.length === 0) {
      candidate = null;
      committed = false;
      lastCommitted = null;
      if (word.length > 0 && t - lastHand >= GAP_MS) {
        const done = word;
        word = [];
        sentenceOpen = true;
        return { word: done };
      }
      if (sentenceOpen && word.length === 0 && t - lastHand >= SENTENCE_GAP_MS) {
        sentenceOpen = false;
        return { sentenceEnd: true };
      }
      return {};
    }
    lastHand = t;
    const best = top[0];
    if (best.p < MIN_P || best.letter !== candidate) {
      candidate = best.p < MIN_P ? null : best.letter;
      since = t;
      committed = false;
      return {};
    }
    if (!committed && t - since >= HOLD_MS && best.letter !== lastCommitted) {
      committed = true;
      lastCommitted = best.letter;
      word.push(top);
      return { letter: top };
    }
    return {};
  };
}

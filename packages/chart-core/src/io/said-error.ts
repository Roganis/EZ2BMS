// An error about a file someone gave EZ2BMS - a chart that does not read, a
// MIDI file with no tempo to cut by - said the way findings are (i18n/say.ts):
// `message` in English, for the log, the tests and an import note that keeps
// it, and `said` to show in the language chosen (`textOf(e)`). A mistake in
// EZ2BMS itself is thrown with its English alone: no one is shown it to act on.

import { knownSaid, sayEnglish, type Said } from '../i18n/say';

export class SaidError extends Error {
  readonly said?: Said;

  constructor(what: Said | string) {
    super(typeof what === 'string' ? what : sayEnglish(what));
    if (typeof what !== 'string') this.said = what;
  }
}

/**
 * What an error says, to put inside another message (why a chart was left
 * out): its `said` when it has one this EZ2BMS knows - any error may carry
 * one - else its English text.
 */
export function errorSaid(e: unknown): Said | string {
  const s = e && typeof e === 'object' ? (e as { said?: unknown }).said : undefined;
  if (knownSaid(s)) return s;
  return e instanceof Error ? e.message : String(e);
}

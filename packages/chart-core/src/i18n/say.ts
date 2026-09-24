// A message chart-core says - a lint finding, what an import could not
// bring across, why an edit was refused - kept as its catalog key and
// values, so whoever shows it says it in the language chosen then, not the
// one it was made in. `message` beside it stays English: the log, the
// tests and a song file written by an older EZ2BMS read that.

import { coreCatalogs } from './core';
import { coreEn, type CoreKey } from './en';
import type { Locale } from './translate';

/** A value in a message: plain, or another message said inside it. */
export type SaidValue = string | number | Said;
export type SaidParams = Record<string, SaidValue>;

export interface Said {
  key: CoreKey;
  params?: SaidParams;
}

/** `key` with its values, to say later. */
export function said(key: CoreKey, params?: SaidParams): Said {
  return params ? { key, params } : { key };
}

function render(s: Said, locale: Locale, mark: boolean): string {
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(s.params ?? {}))
    params[k] = typeof v === 'object' ? render(v, locale, false) : v;
  return coreCatalogs.format(s.key, params, locale, mark);
}

/** In the language chosen (setCoreLocale). */
export function sayText(s: Said): string {
  return render(s, coreCatalogs.getLocale(), true);
}

/** In English, never pseudo-marked: the `message` kept beside it, for the log and the tests. */
export function sayEnglish(s: Said): string {
  return render(s, 'en', false);
}

/** A message's English and its key: what a finding or a note carries. */
export const saying = (s: Said): { message: string; said: Said } => ({
  message: sayEnglish(s),
  said: s,
});

/** Whether a stored message's key is one this EZ2BMS knows (a newer one's may not be). */
export function knownSaid(v: unknown): v is Said {
  if (!v || typeof v !== 'object') return false;
  const s = v as Said;
  if (typeof s.key !== 'string' || !Object.prototype.hasOwnProperty.call(coreEn, s.key))
    return false;
  if (s.params === undefined) return true;
  if (!s.params || typeof s.params !== 'object' || Array.isArray(s.params)) return false;
  return Object.values(s.params).every(
    (p) => typeof p === 'string' || typeof p === 'number' || knownSaid(p),
  );
}

/**
 * What to show for a finding or note: its message in the language chosen,
 * or its English text when it has none (made before M9.6, or by a newer
 * EZ2BMS with messages this one does not know).
 */
export function textOf(m: { message: string; said?: Said }): string {
  return m.said && knownSaid(m.said) ? sayText(m.said) : m.message;
}

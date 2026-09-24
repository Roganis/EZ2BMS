// Messages in the language chosen: ICU MessageFormat (intl-messageformat),
// so English says "1 note" and "2 notes" while Korean and Japanese say it
// once, and a sentence can put its numbers where its language needs them.
//
// A catalog maps a key to a message. English is the source: every key is
// in it, and a Korean or Japanese catalog is typed against it (a missing key
// is a type error once a translation is finished; until then the English
// stands in). chart-core has its catalogs for what it says (lint, import
// notes); the editor has its own for its screens, through the same `Catalogs`.

import IntlMessageFormat from 'intl-messageformat';

export type Locale = 'en' | 'ko' | 'ja';
export const LOCALES: readonly Locale[] = ['en', 'ko', 'ja'];
/** Each language named in itself, for the language menu. */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', ko: '한국어', ja: '日本語' };

export type Params = Record<string, string | number | boolean | Date | null | undefined>;

/** The language a system asks for (`navigator.language`, `LANG`): Korean, Japanese, else English. */
export function localeOf(tag: string | null | undefined): Locale {
  const t = (tag ?? '').toLowerCase();
  if (t.startsWith('ko')) return 'ko';
  if (t.startsWith('ja')) return 'ja';
  return 'en';
}

/**
 * A pseudo-language for tests and for finding what is not translated yet:
 * every translated message comes out marked, ⟦so⟧, with its letters
 * accented, so English left in the UI stands out.
 */
export function pseudo(s: string): string {
  const map: Record<string, string> = {
    a: 'å',
    e: 'é',
    i: 'ï',
    o: 'ø',
    u: 'ü',
    A: 'Å',
    E: 'É',
    O: 'Ø',
    U: 'Ü',
  };
  return `⟦${s.replace(/[aeiouAEOU]/g, (c) => map[c]!)}⟧`;
}

export class Catalogs<K extends string> {
  private locale: Locale = 'en';
  private pseudoOn = false;
  private readonly cache = new Map<string, IntlMessageFormat>();

  constructor(
    private readonly en: Record<K, string>,
    private readonly others: Partial<Record<Exclude<Locale, 'en'>, Partial<Record<K, string>>>>,
  ) {}

  setLocale(l: Locale, pseudoOn = false): void {
    this.locale = l;
    this.pseudoOn = pseudoOn;
  }

  getLocale(): Locale {
    return this.locale;
  }

  /** The keys, for tests and tools. */
  keys(): K[] {
    return Object.keys(this.en) as K[];
  }

  /** The message for `key` in `locale`, or English when the translation has none yet. */
  source(key: K, locale: Locale = this.locale): string {
    const own = locale === 'en' ? undefined : this.others[locale]?.[key];
    return own ?? this.en[key];
  }

  /** `key` in the current language, with its parameters. */
  t(key: K, params?: Params): string {
    return this.format(key, params, this.locale);
  }

  /** `key` in a given language (the palette also searches the English titles). */
  format(key: K, params: Params | undefined, locale: Locale): string {
    const msg = this.source(key, locale);
    const id = `${locale}\u0000${key}`;
    let f = this.cache.get(id);
    if (!f) {
      f = new IntlMessageFormat(msg, locale, undefined, { ignoreTag: true });
      this.cache.set(id, f);
    }
    const out = String(f.format(params as Record<string, never>));
    return this.pseudoOn && locale === this.locale ? pseudo(out) : out;
  }
}

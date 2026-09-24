// Messages in the language chosen: ICU MessageFormat (intl-messageformat),
// so English says "1 note" and "2 notes" while Korean and Japanese say it
// once, and a sentence can put its numbers where its language needs them.
//
// A catalog maps a key to a message. English is the source: every key is
// in it, and a Korean or Japanese catalog is typed against it (a missing key
// is a type error once a translation is finished; until then the English
// stands in). chart-core has its catalogs for what it says (lint, import
// notes); the editor has its own for its screens, through the same `Catalogs`.

import { IntlMessageFormat } from 'intl-messageformat';

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

  /**
   * `key` in a given language (the palette also searches the English
   * titles). `mark: false` never marks it in the pseudo-language: the
   * English a finding keeps for the log stays plain.
   */
  format(key: K, params: Params | undefined, locale: Locale, mark = true): string {
    // English standing in for a missing translation counts in English
    // ("1 note", not Korean's single form "1 notes").
    const own = locale !== 'en' && this.others[locale]?.[key] !== undefined;
    const lang: Locale = own ? locale : 'en';
    const id = `${lang}\u0000${key}`;
    let f = this.cache.get(id);
    if (!f) {
      f = new IntlMessageFormat(this.source(key, lang), lang, undefined, { ignoreTag: true });
      this.cache.set(id, f);
    }
    const out = String(f.format(params as Record<string, never>));
    return mark && this.pseudoOn && locale === this.locale ? pseudo(out) : out;
  }
}

/** A message's parts as intl-messageformat parses them (the fields read here). */
interface Part {
  type: number;
  value?: unknown;
  options?: Record<string, { value: Part[] }>;
  children?: Part[];
}
// intl-messageformat's element types: 0 text, 7 `#` (the plural's number).
const LITERAL = 0;
const POUND = 7;

/** The parameters a message takes (`{n}`, `{n, plural, ...}`), sorted. Throws when it does not parse. */
export function messageArgs(message: string, locale: Locale = 'en'): string[] {
  const out = new Set<string>();
  const walk = (parts: Part[]): void => {
    for (const p of parts) {
      if (p.type !== LITERAL && p.type !== POUND && typeof p.value === 'string') out.add(p.value);
      for (const o of Object.values(p.options ?? {})) walk(o.value);
      if (p.children) walk(p.children);
    }
  };
  walk(new IntlMessageFormat(message, locale, undefined, { ignoreTag: true }).getAst() as Part[]);
  return [...out].sort();
}

/**
 * What is wrong with a set of catalogs: a message that does not parse, a
 * translated key English does not have, or a translation taking other
 * parameters than the English (it would print `{n}`, or drop a number).
 * Tests run it on every catalog; an empty list is a pass.
 */
export function catalogProblems(
  en: Record<string, string>,
  others: Partial<Record<Locale, Partial<Record<string, string>>>>,
): string[] {
  const problems: string[] = [];
  const argsOf = (key: string, m: string, l: Locale): string[] | null => {
    try {
      return messageArgs(m, l);
    } catch (e) {
      problems.push(`${l} ${key}: does not parse (${(e as Error).message})`);
      return null;
    }
  };
  const want = new Map<string, string[] | null>();
  for (const [k, m] of Object.entries(en)) want.set(k, argsOf(k, m, 'en'));
  for (const [l, cat] of Object.entries(others) as [Locale, Record<string, string>][]) {
    for (const [k, m] of Object.entries(cat ?? {})) {
      if (!want.has(k)) {
        problems.push(`${l} ${k}: not in the English catalog`);
        continue;
      }
      const got = argsOf(k, m, l);
      const w = want.get(k);
      const say = (a: string[]) => (a.length ? a.map((x) => `{${x}}`).join(', ') : 'none');
      if (got && w && got.join(',') !== w.join(','))
        problems.push(`${l} ${k}: takes ${say(got)}, English ${say(w)}`);
    }
  }
  return problems;
}

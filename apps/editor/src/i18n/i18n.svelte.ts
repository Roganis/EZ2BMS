// The editor's words in the language chosen (Preferences), or the
// system's. The catalogs are per area (en/*.ts) with English the source;
// Korean and Japanese are typed against it (ko/, ja/). `t` reads the
// language as Svelte state, so every screen re-renders when it changes.
// chart-core's own messages (lint, import notes) follow the same choice.

import {
  Catalogs,
  localeOf,
  sayText,
  setCoreLocale,
  textOf,
  type Locale,
  type Params,
  type Said,
} from '@ez2bms/chart-core';
import { en, type MessageKey } from './en';
import { ja } from './ja';
import { ko } from './ko';

export type { MessageKey };
export type LanguageChoice = 'auto' | Locale;

const catalogs = new Catalogs<MessageKey>(en, { ko, ja });

class I18n {
  locale = $state<Locale>('en');
  pseudo = $state(false);

  /** The language for a choice: the system's for `auto`. */
  resolve(choice: LanguageChoice): Locale {
    return choice === 'auto' ? localeOf(globalThis.navigator?.language) : choice;
  }

  apply(choice: LanguageChoice, pseudo = false): void {
    const l = this.resolve(choice);
    catalogs.setLocale(l, pseudo);
    setCoreLocale(l, pseudo);
    this.locale = l;
    this.pseudo = pseudo;
    if (typeof document !== 'undefined') document.documentElement.lang = l;
  }
}

export const i18n = new I18n();

/** `key` in the current language. */
export function t(key: MessageKey, params?: Params): string {
  void i18n.locale;
  void i18n.pseudo;
  return catalogs.t(key, params);
}

/** A piece of a message: its text, or where a slot's markup goes. */
export type Part = { text: string } | { slot: string };

/**
 * `key` with some parameters left as slots, for a sentence with markup
 * around a value (`Saved <b>{file}</b>`): the translation still orders the
 * sentence, and the component draws each slot itself.
 *
 *   {#each tParts('x.saved', { file }, ['file']) as p, i (i)}
 *     {#if 'slot' in p}<b>{file}</b>{:else}{p.text}{/if}
 *   {/each}
 *
 * A slot must be a plain `{param}`, not a plural's number.
 */
export function tParts(key: MessageKey, params: Params, slots: string[]): Part[] {
  // Marked by private-use characters around an index: nothing a message
  // says, and nothing the pseudo-language accents.
  const marked: Params = { ...params };
  slots.forEach((s, i) => (marked[s] = `\ue000${i}\ue001`));
  return t(key, marked)
    .split(/\ue000(\d+)\ue001/)
    .map((piece, i): Part => (i % 2 ? { slot: slots[Number(piece)]! } : { text: piece }))
    .filter((p) => !('text' in p) || p.text !== '');
}

/**
 * What chart-core said (a finding, an import note: `{message, said}`), in
 * the current language, re-said when the language changes. A note without
 * `said` (an older song file's) is its English text.
 */
export function tCore(m: { message: string; said?: Said }): string {
  void i18n.locale;
  void i18n.pseudo;
  return textOf(m);
}

/** A chart-core message (a fix's label, a hold kind's description), reactive like `t`. */
export function tSaid(s: Said): string {
  void i18n.locale;
  void i18n.pseudo;
  return sayText(s);
}

/** `key` in English (what the palette also searches, and the docs are generated from). */
export function tEn(key: MessageKey, params?: Params): string {
  return catalogs.format(key, params, 'en');
}

/** Whether the catalog has `key` (command titles are looked up by id). */
export function hasMessage(key: string): key is MessageKey {
  return Object.prototype.hasOwnProperty.call(en, key);
}

/** The catalogs, for tests. */
export const editorCatalogs = { en, ko, ja };

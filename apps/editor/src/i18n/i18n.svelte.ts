// The editor's words in the language chosen (Preferences), or the
// system's. The catalogs are per area (en/*.ts) with English the source;
// Korean and Japanese are typed against it (ko/, ja/). `t` reads the
// language as Svelte state, so every screen re-renders when it changes.
// chart-core's own messages (lint, import notes) follow the same choice.

import { Catalogs, localeOf, setCoreLocale, type Locale, type Params } from '@ez2bms/chart-core';
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

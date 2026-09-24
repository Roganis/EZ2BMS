// chart-core's own messages - what lint finds, what an import could not
// bring across - in the language the editor chose (setCoreLocale). The
// catalogs are en.ts (the source), ko.ts and ja.ts.

import { coreEn, type CoreKey } from './en';
import { coreJa } from './ja';
import { coreKo } from './ko';
import { Catalogs, type Locale, type Params } from './translate';

export const coreCatalogs = new Catalogs<CoreKey>(coreEn, { ko: coreKo, ja: coreJa });

/** Speak `locale` from now on (findings are made again by whoever shows them). */
export function setCoreLocale(locale: Locale, pseudo = false): void {
  coreCatalogs.setLocale(locale, pseudo);
}

/** A chart-core message in the current language. */
export function msg(key: CoreKey, params?: Params): string {
  return coreCatalogs.t(key, params);
}

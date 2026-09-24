// The message machinery (i18n/translate.ts): parameters, plurals as each
// language counts, English standing in for a missing translation, the
// pseudo-language, and the system's language picked up.

import { describe, expect, it } from 'vitest';
import { Catalogs, localeOf, pseudo } from '../src/i18n/translate';

const en = {
  notes: '{n, plural, one {# note} other {# notes}} on {lane}',
  saved: 'Saved',
  only: 'Only in English',
} as const;

function catalogs() {
  return new Catalogs<keyof typeof en>(en, {
    ko: { notes: '{lane}에 노트 {n}개', saved: '저장했습니다' },
    ja: { notes: '{lane}にノート{n}個', saved: '保存しました' },
  });
}

describe('messages', () => {
  it('fill their parameters, and count as each language does', () => {
    const c = catalogs();
    expect(c.t('notes', { n: 1, lane: 'lane 3' })).toBe('1 note on lane 3');
    expect(c.t('notes', { n: 2, lane: 'lane 3' })).toBe('2 notes on lane 3');
    c.setLocale('ko');
    expect(c.t('notes', { n: 1, lane: '3번 레인' })).toBe('3번 레인에 노트 1개');
    expect(c.t('saved')).toBe('저장했습니다');
    c.setLocale('ja');
    expect(c.t('notes', { n: 2, lane: 'レーン3' })).toBe('レーン3にノート2個');
  });

  it('fall back to English where a translation has no message yet', () => {
    const c = catalogs();
    c.setLocale('ko');
    expect(c.t('only')).toBe('Only in English');
    // English is always there to search by.
    expect(c.format('saved', undefined, 'en')).toBe('Saved');
  });

  it('mark every message in the pseudo-language (not the English another language searches by)', () => {
    const c = catalogs();
    c.setLocale('en', true);
    expect(c.t('saved')).toBe('⟦Såvéd⟧');
    expect(c.format('saved', undefined, 'en')).toBe('⟦Såvéd⟧');
    c.setLocale('ko', true);
    expect(c.format('saved', undefined, 'en')).toBe('Saved');
    expect(pseudo('Open a song')).toBe('⟦Øpén å søng⟧');
  });

  it('take the system language', () => {
    expect(localeOf('ko-KR')).toBe('ko');
    expect(localeOf('ja')).toBe('ja');
    expect(localeOf('en-US')).toBe('en');
    expect(localeOf('de-DE')).toBe('en');
    expect(localeOf(undefined)).toBe('en');
  });
});

// What chart-core says keeps its key and values (i18n/say.ts), so the editor
// says it in the language chosen when it is shown, not the one it was made
// in; and a note stored in a song file keeps them too, beside its English.

import { describe, expect, it } from 'vitest';
import { setCoreLocale } from '../src/i18n/core';
import { knownSaid, said, sayEnglish, sayText, textOf } from '../src/i18n/say';
import { lintSong } from '../src/lint/lint';
import { newChart } from '../src/model/defaults';
import { newSongFile, parseSongFile, serializeSongFile } from '../src/song/songfile';

describe('said', () => {
  it('is said in the language chosen when shown, its English kept', () => {
    const data = newChart({ mode: '5k', tier: 'NM', level: 25, title: 'T' });
    const [level] = lintSong({
      key: 'abc',
      charts: [{ file: 'streetmix1p-abc.bmson', data, mode: '5k', tier: 'NM' }],
    }).filter((f) => f.rule === 'level');
    expect(level!.message).toBe("Level 25 is outside 1-20, which EZ2PORT's song list uses");
    expect(level!.said).toEqual({ key: 'lint.level', params: { level: 25 } });
    try {
      setCoreLocale('en', true);
      expect(textOf(level!)).toBe("⟦Lévél 25 ïs øütsïdé 1-20, whïch ÉZ2PØRT's søng lïst üsés⟧");
      // The English stays English, whatever is shown.
      expect(sayEnglish(level!.said!)).toBe(level!.message);
    } finally {
      setCoreLocale('en');
    }
  });

  it('says a reason inside a sentence in the same language', () => {
    const s = said('lint.bga-codec', { src: 'a.avi', why: said('movie.no-video') });
    expect(sayText(s)).toBe('The BGA a.avi will not play: no video track was found in it');
  });

  it('keeps an import note said again after a round trip through the song file', () => {
    const song = newSongFile('abc');
    const s = said('lint.plate-text', { text: 'A', title: 'B' });
    song.source = {
      from: 'ez2ac',
      notes: [
        { chart: 'x.bmson', rule: 'r', severity: 'info', message: sayEnglish(s), said: s },
        // An older EZ2BMS's note: its English alone.
        { chart: 'x.bmson', rule: 'old', severity: 'info', message: 'kept as it was' },
      ],
    };
    const back = parseSongFile(serializeSongFile(song)).song.source!.notes!;
    expect(back[0]!.said).toEqual(s);
    expect(textOf(back[0]!)).toBe('The title plate reads "A"; the song is titled "B"');
    expect(textOf(back[1]!)).toBe('kept as it was');
  });

  it("falls back to the English for a key this EZ2BMS does not know (a newer one's)", () => {
    const note = { message: 'from the future', said: { key: 'lint.not-yet', params: {} } };
    expect(knownSaid(note.said)).toBe(false);
    expect(textOf(note as never)).toBe('from the future');
    expect(knownSaid({ key: 'lint.level', params: { level: { key: 'nope' } } })).toBe(false);
  });
});

// The title plate spec: the shipped layout (TEXT.md s7) and the CJK forms.
// Its pixels are the host's, checked against EZ2PORT in plate.oracle.test.ts.

import { describe, expect, it } from 'vitest';
import { lintSong, type PlateCheck } from '../src/lint/lint';
import { newChart } from '../src/model/defaults';
import {
  PLATE_TINTS,
  guessCjkForms,
  hasCjk,
  plateSpecFor,
  plateTint,
  readPlateSettings,
  titlePlate,
} from '../src/publish/plate';
import { parseSongFile, serializeSongFile } from '../src/song/songfile';

describe('titlePlate', () => {
  it('sets a lone title on baseline 22, nine tall, ending at 246 within 236', () => {
    expect(titlePlate('NEON PARADE')).toEqual({
      w: 256,
      h: 32,
      cjk: 'kr',
      lines: [
        {
          text: 'NEON PARADE',
          x: 246,
          baseline: 22,
          cap: 9,
          face: 'bold',
          ink: 'ffffff',
          align: 'right',
          maxWidth: 236,
        },
      ],
    });
  });

  it('puts a subtitle under a smaller title, in grey and without the halo', () => {
    const p = titlePlate(
      'Title',
      'Sub',
      PLATE_TINTS.find((t) => t.id === 'orange-halo'),
    );
    expect(p.lines.map((l) => [l.baseline, l.cap, l.ink, l.glow])).toEqual([
      [15, 7, 'ffffff', 'eb4800'],
      [27, 6, 'c5c5c5', undefined],
    ]);
    // A subtitle of spaces is none.
    expect(titlePlate('Title', '  ').lines).toHaveLength(1);
  });

  it('guesses the CJK forms: kana is Japanese, anything else Korean', () => {
    expect(guessCjkForms('ネオン')).toBe('jp');
    expect(guessCjkForms('ｱｲｳ')).toBe('jp');
    expect(guessCjkForms('네온')).toBe('kr');
    expect(guessCjkForms('歌')).toBe('kr');
    expect(titlePlate('歌', '', undefined, 'tc').cjk).toBe('tc');
  });
});

describe('plate settings', () => {
  const song = { title: 'Neon Parade', subtitle: 'Extended' };

  it('read only what they should, and keep the rest for the song file to carry', () => {
    expect(readPlateSettings({ title: 'X', tint: 'green', cjk: 'jp' })).toEqual({
      title: 'X',
      tint: 'green',
      cjk: 'jp',
    });
    expect(readPlateSettings({ ink: 'FFFFFF' })).toBeUndefined(); // lower-case hex only
    expect(readPlateSettings({ cjk: 'xx' })).toBeUndefined();
    expect(readPlateSettings({ title: 'X', future: 1 })).toBeUndefined();
    const text = '{"key":"abc","plate":{"tint":"custom","ink":"ff00aa","glow":"00ffcc"}}';
    const { song: s, warnings } = parseSongFile(text);
    expect(warnings).toEqual([]);
    expect(Object.keys(JSON.parse(serializeSongFile(s)))).toEqual(['key', 'plate']);
    const odd = parseSongFile('{"key":"abc","plate":{"tint":5}}');
    expect(odd.warnings).toHaveLength(1);
    expect(JSON.parse(serializeSongFile(odd.song))).toEqual({ key: 'abc', plate: { tint: 5 } });
  });

  it("turn into the spec: the song's words unless told otherwise, the chosen colours", () => {
    expect(plateSpecFor({}, song).lines.map((l) => l.text)).toEqual(['Neon Parade', 'Extended']);
    expect(plateSpecFor({ subtitle: '' }, song).lines.map((l) => l.text)).toEqual(['Neon Parade']);
    expect(plateSpecFor({ title: 'NP' }, song).lines[0]!.text).toBe('NP');
    expect(plateTint({ tint: 'cyan-halo' })).toMatchObject({ ink: 'ffffff', glow: '42d3ef' });
    expect(plateTint({ tint: 'custom', ink: '123456' })).toEqual({
      id: 'custom',
      label: 'Custom',
      ink: '123456',
    });
    expect(plateTint({ tint: 'nope' }).id).toBe('white');
  });

  it('knows CJK words as the port does', () => {
    expect(hasCjk('네온')).toBe(true);
    expect(hasCjk('ネオン')).toBe(true);
    expect(hasCjk('ＡＢ')).toBe(true);
    expect(hasCjk('Déjà vu ★')).toBe(false);
  });

  it('are linted from what the render found', () => {
    const c = {
      file: 'streetmix1p-abc.bmson',
      data: newChart({ mode: '5k', tier: 'NM', level: 3 }),
      mode: '5k' as const,
      tier: 'NM' as const,
    };
    const found = (plate: PlateCheck) =>
      lintSong({ key: 'abc', charts: [c], plate })
        .filter((f) => /plate|art-missing/.test(f.rule))
        .map((f) => `${f.rule}:${f.severity}`);
    expect(found({ songTitle: 'T', text: 'T', missing: [] })).toEqual([]);
    expect(found({ songTitle: 'T', text: 'U', missing: ['\u{e000}'] })).toEqual([
      'plate-glyphs:warning',
      'plate-text:info',
    ]);
    expect(found({ songTitle: 'T', missing: [], error: 'no CJK font' })).toEqual([
      'plate-failed:error',
    ]);
    expect(
      found({ songTitle: 'T', missing: [], image: { src: 'p.png', path: undefined } }),
    ).toEqual(['art-missing:error']);
  });
});

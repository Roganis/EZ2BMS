// The title plate spec: the shipped layout (TEXT.md s7) and the CJK forms.
// Its pixels are the host's, checked against EZ2PORT in plate.oracle.test.ts.

import { describe, expect, it } from 'vitest';
import { PLATE_TINTS, guessCjkForms, titlePlate } from '../src/publish/plate';

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

// ScratchMix's fret-and-strum (engine/strum.ts), rule for rule from EZ2PORT's
// reference/play.c 2426-2501: a fret alone is silent and unjudged, a strum
// plays and judges every fret held on its side (the pedal is not a fret) and
// arms a six-frame latch that a late fret still counts inside.

import { describe, expect, it } from 'vitest';
import { J } from '../src/engine/score';
import { PlaySession } from '../src/engine/session';
import { effectiveIni, songIniFrom } from '../src/engine/songini';
import { STRUM_WINDOW_MS } from '../src/engine/strum';
import { newChart } from '../src/model/defaults';
import type { ModeId } from '../src/modes/ids';
import { modeDef } from '../src/modes/registry';
import { compileSong } from '../src/publish/package';

const ini = (mode: ModeId) =>
  effectiveIni(
    songIniFrom(
      5,
      { KOOL: 9, COOL: 27, GOOD: 53, MISS: 73 },
      { COOL: 0.2, GOOD: 0.1, MISS: -1.8, FAIL: -4.8 },
    ),
    mode,
  );

/** One note per lane `xs`, all at beat 4 (2000 ms at 120 BPM). */
function session(mode: ModeId, xs: number[], strum = true) {
  const data = newChart({ mode, tier: 'NM', bpm: 120 });
  data.info.resolution = 240;
  data.channels = [{ id: 1, name: 'k.wav' }];
  data.notes = xs.map((x, i) => ({ id: i + 1, ch: 1, x, y: 240 * 4, l: 0, c: false }));
  const plan = compileSong({ key: 'strum', title: '', artist: '', genre: '' }, [
    { data, mode, tier: 'NM' },
  ]).charts[0]!.plan;
  const columns = modeDef(mode).columns;
  const s = new PlaySession(plan, columns, ini(mode), { autoplay: false, strum });
  const col = (x: number) => columns.findIndex((c) => c.x === x);
  return { s, col };
}

const heads = (r: { fx: { instalment: boolean; j: J; lane: number }[] }) =>
  r.fx.filter((f) => !f.instalment).map((f) => [f.lane, f.j]);
const laneSounds = (r: { sounds: { voice: string }[] }) =>
  r.sounds.filter((c) => c.voice.startsWith('lane')).length;

describe('ScratchMix: frets and the strum', () => {
  it('a fret alone sounds nothing and judges nothing', () => {
    const { s, col } = session('scratch', [11]);
    s.advance(2000);
    const r = s.press(col(11), 2000);
    expect(laneSounds(r)).toBe(0);
    expect(heads(r)).toEqual([]);
  });

  it('a strum plays and judges every fret held on its side', () => {
    const { s, col } = session('scratch', [11, 13, 15]);
    s.advance(2000);
    s.press(col(11), 1995);
    s.press(col(13), 1996);
    const r = s.strum(0, 2000);
    expect(laneSounds(r)).toBe(2);
    expect(heads(r)).toEqual([
      [col(11), J.KOOL],
      [col(13), J.KOOL],
    ]);
    // Only down edges strum; releasing a fret afterwards does nothing.
    s.release(col(11));
    expect(heads(s.strum(0, 2010))).toEqual([]);
  });

  it('a fret pressed inside the latch counts; one frame too late does not', () => {
    // Strummed a latch's length before the note, fretted on it.
    const inside = session('scratch', [12]);
    inside.s.advance(2000);
    inside.s.strum(0, 2000 - STRUM_WINDOW_MS);
    expect(heads(inside.s.press(inside.col(12), 2000))).toEqual([[inside.col(12), J.KOOL]]);
    const late = session('scratch', [12]);
    late.s.advance(2000);
    late.s.strum(0, 2000 - STRUM_WINDOW_MS - 1);
    expect(heads(late.s.press(late.col(12), 2000))).toEqual([]);
  });

  it('the pedal is not a fret, and each side strums its own', () => {
    // Club (10K) has pedals and two sides: the rule on a field that has them.
    const { s, col } = session('10k', [10, 11, 21]);
    s.advance(2000);
    s.press(col(10), 1990);
    s.press(col(11), 1990);
    s.press(col(21), 1990);
    expect(heads(s.strum(0, 2000))).toEqual([[col(11), J.KOOL]]);
    expect(heads(s.strum(1, 2000))).toEqual([[col(21), J.KOOL]]);
    // Pressing the pedal inside the latch still does nothing.
    s.release(col(10));
    expect(heads(s.press(col(10), 2001))).toEqual([]);
  });

  it('other modes are untouched: a key is a note', () => {
    const { s, col } = session('5k', [11], false);
    s.advance(2000);
    expect(heads(s.press(col(11), 2000))).toEqual([[col(11), J.KOOL]]);
    expect(heads(s.strum(0, 2000))).toEqual([]);
  });
});

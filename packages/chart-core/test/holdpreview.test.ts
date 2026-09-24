// The hold preview (engine/holdpreview.ts) against the engine it describes:
// a hold of every kind, played through by PlaySession's autoplay (itself
// checked against EZ2PORT's score.c by the oracle), is paid exactly the
// instalments the preview shows, each at the tick after the one it shows.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { holdPreview, HOLD_KIND_INFO } from '../src/engine/holdpreview';
import { PlaySession } from '../src/engine/session';
import { effectiveIni, songIniFrom } from '../src/engine/songini';
import { newChart } from '../src/model/defaults';
import { modeDef } from '../src/modes/registry';
import { compileSong } from '../src/publish/package';
import { TickConverter } from '../src/timing/ticks';

const ini = effectiveIni(
  songIniFrom(
    5,
    { KOOL: 9, COOL: 27, GOOD: 53, MISS: 73 },
    { COOL: 0.2, GOOD: 0.1, MISS: -1.8, FAIL: -4.8 },
  ),
  '5k',
);

function play(kind: number, l: number, res = 240) {
  const data = newChart({ mode: '5k', tier: 'NM', bpm: 150 });
  data.info.resolution = res;
  data.channels = [{ id: 1, name: 'k.wav' }];
  const y = 4 * res;
  data.notes = [{ id: 1, ch: 1, x: 11, y, l, c: false, ...(kind ? { kind } : {}) }];
  const plan = compileSong({ key: 'hp', title: '', artist: '', genre: '' }, [
    { data, mode: '5k', tier: 'NM' },
  ]).charts[0]!.plan;
  const columns = modeDef('5k').columns;
  const s = new PlaySession(plan, columns, ini, { autoplay: true });
  const lane = columns.findIndex((c) => c.x === 11);
  const paidMs: number[] = [];
  const end = plan.endMs + 3000;
  for (let ms = 0; ms <= end; ms++)
    for (const f of s.advance(ms).fx) if (f.instalment && f.lane === lane) paidMs.push(f.ms);
  return { data, plan, paidMs, preview: holdPreview(data, data.notes[0]!)! };
}

describe('the hold preview', () => {
  it('shows what the engine pays, where it pays it, for every kind', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 13 }),
        fc.integer({ min: 1, max: 32 }).map((q) => q * 30),
        (kind, l) => {
          const { data, plan, paidMs, preview } = play(kind, l);
          expect(paidMs).toHaveLength(preview.pays);
          const tc = new TickConverter(240, data.stopEvents);
          preview.at.forEach((y, k) => {
            const due = tc.tick(y).tick;
            // Paid on the first frame past the due tick.
            expect(paidMs[k]).toBeGreaterThanOrEqual(Math.floor(plan.tempo.msAt(due + 1)) - 1);
            expect(paidMs[k]).toBeLessThanOrEqual(Math.ceil(plan.tempo.msAt(due + 1)) + 1);
          });
        },
      ),
      { numRuns: 60 },
    );
  });

  it('says when a perfect play cannot reach 100%', () => {
    // A two-beat hold: kind 0 pays every quarter of a beat.
    const k0 = play(0, 480).preview;
    expect(k0).toMatchObject({ pays: 7, counts: 8, balanced: true, stepTicks: 12 });
    // Kind 4 pays once, but the counter counts it in 1/32s.
    expect(play(4, 480).preview).toMatchObject({ pays: 1, balanced: false });
    // Kind 6: one instalment, the last, and it counts as one.
    const k6 = play(6, 480).preview;
    expect(k6).toMatchObject({ pays: 1, counts: 2, balanced: true });
    expect(k6.at).toEqual([k0.at.at(-1)! + 60]);
    // 7-12: nothing while held; 9-12 do not even count the head.
    expect(play(7, 480).preview).toMatchObject({ pays: 0, counts: 1, balanced: true, at: [] });
    expect(play(9, 480).preview).toMatchObject({ pays: 0, counts: 0, balanced: false });
    expect(HOLD_KIND_INFO.map((k) => k.kind)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('places instalments through a STOP inside the hold', () => {
    const data = newChart({ mode: '5k', tier: 'NM', bpm: 150 });
    data.stopEvents = [{ y: 1080, duration: 240 }];
    const n = { y: 960, l: 480 };
    const p = holdPreview(data, n)!;
    const tc = new TickConverter(240, data.stopEvents);
    // Every instalment position converts back to its tick; none lands in the gap's middle.
    const ticks = p.at.map((y) => tc.tick(y).tick);
    const start = tc.tick(960).tick;
    const gapTicks = (240 * 48) / 240;
    expect(
      ticks.every(
        (t, k) => t === start + (k + 1) * 12 || (t >= start + 24 && t <= start + 24 + gapTicks),
      ),
    ).toBe(true);
    expect(p.pays).toBe(Math.floor((tc.holdTicks(960, 480) + 6) / 12) - 1);
    expect(holdPreview(data, { y: 0, l: 0 })).toBeUndefined();
  });
});

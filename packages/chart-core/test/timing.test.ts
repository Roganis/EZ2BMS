import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EngineTempo } from '../src/timing/engine-tempo';
import { formatPosition, formatSeconds, positionOf } from '../src/timing/measures';
import { rescaleChart } from '../src/timing/rescale';
import { gridsFor, stepPulses, SNAP_GRIDS } from '../src/timing/snap';
import { TickConverter } from '../src/timing/ticks';
import { TimingMap } from '../src/timing/timing-map';
import { newChart } from '../src/model/defaults';

const R = 240;

describe('TimingMap (bmson timing)', () => {
  it('times a constant tempo', () => {
    const m = new TimingMap({ resolution: R, initBpm: 120, bpmEvents: [], stopEvents: [] });
    expect(m.secondsAt(0)).toBe(0);
    expect(m.secondsAt(R)).toBeCloseTo(0.5, 12);
    expect(m.pulseAt(1)).toBeCloseTo(2 * R, 9);
  });

  it('applies a BPM change from its own position', () => {
    const m = new TimingMap({
      resolution: R,
      initBpm: 120,
      bpmEvents: [{ y: 4 * R, bpm: 240 }],
      stopEvents: [],
    });
    expect(m.secondsAt(4 * R)).toBeCloseTo(2, 12);
    expect(m.secondsAt(8 * R)).toBeCloseTo(3, 12);
    expect(m.bpmAt(4 * R - 1)).toBe(120);
    expect(m.bpmAt(4 * R)).toBe(240);
  });

  it('freezes at a STOP, after the notes at its position, at the new BPM', () => {
    const m = new TimingMap({
      resolution: R,
      initBpm: 120,
      bpmEvents: [{ y: 2 * R, bpm: 60 }],
      stopEvents: [{ y: 2 * R, duration: R }],
    });
    // A note on the STOP sounds before it...
    expect(m.secondsAt(2 * R)).toBeCloseTo(1, 12);
    // ...the STOP lasts one beat at 60 BPM (1 s), then time moves on at 60 BPM.
    expect(m.stopAt(2 * R)).toBeCloseTo(1, 12);
    expect(m.secondsAt(3 * R)).toBeCloseTo(3, 12);
    expect(m.pulseAt(1.5)).toBe(2 * R);
    expect(m.pulseAt(2.5)).toBeCloseTo(2.5 * R, 9);
  });

  it('can ignore STOPs', () => {
    const src = { resolution: R, initBpm: 120, bpmEvents: [], stopEvents: [{ y: R, duration: R }] };
    expect(new TimingMap(src, { ignoreStops: true }).secondsAt(2 * R)).toBeCloseTo(1, 12);
    expect(new TimingMap(src).secondsAt(2 * R)).toBeCloseTo(1.5, 12);
  });

  it('inverts outside STOPs (property)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ y: fc.nat(20_000), bpm: fc.double({ min: 30, max: 600, noNaN: true }) }),
          {
            maxLength: 8,
          },
        ),
        fc.nat(30_000),
        (bpmEvents, y) => {
          const m = new TimingMap({ resolution: R, initBpm: 150, bpmEvents, stopEvents: [] });
          expect(m.pulseAt(m.secondsAt(y))).toBeCloseTo(y, 6);
        },
      ),
    );
  });
});

describe('TickConverter (bmson -> EZ2 ticks)', () => {
  it('converts exactly on the EZ2 grid and reports off-grid rounding', () => {
    const c = new TickConverter(R, []);
    expect(c.tick(R)).toEqual({ tick: 48, err: 0 });
    expect(c.tick(5)).toEqual({ tick: 1, err: 0 });
    const off = c.tick(7); // 1.4 ticks
    expect(off.tick).toBe(1);
    expect(off.err).toBeCloseTo(0.4, 12);
    expect(c.tick(-3).tick).toBe(0);
    expect(c.onGrid(10)).toBe(true);
    expect(c.onGrid(12)).toBe(false);
  });

  it('turns a STOP into a gap after its own position', () => {
    const c = new TickConverter(R, [{ y: R, duration: R }]);
    expect(c.tick(R).tick).toBe(48); // at the stop: not shifted
    expect(c.tick(R + 5).tick).toBe(48 + 48 + 1); // after: shifted by the stop
  });

  it('keeps a hold across a STOP whole (the importer shortens it)', () => {
    const c = new TickConverter(R, [{ y: R, duration: R }]);
    // A hold from beat 0 to beat 2 spans the stop: 2 beats + 1 beat of gap.
    expect(c.holdTicks(0, 2 * R)).toBe(3 * 48);
    expect(c.holdTicks(0, 0)).toBe(0);
  });
});

describe('EngineTempo (the engine tempo map)', () => {
  it('rounds BPMs to f32 and drops what the engine drops', () => {
    const t = new EngineTempo(150.3, [
      { tick: 96, bpm: 0 },
      { tick: 96, bpm: 1001 },
      { tick: 192, bpm: 174.1 },
    ]);
    expect(t.points).toEqual([
      { tick: 0, bpm: Math.fround(150.3) },
      { tick: 192, bpm: Math.fround(174.1) },
    ]);
  });

  it('integrates across changes like ez2_tempo_seconds', () => {
    const t = new EngineTempo(120, [{ tick: 192, bpm: 240 }]);
    expect(t.msAt(192)).toBe(2000);
    expect(t.msAt(384)).toBe(3000);
    expect(t.tickAtMs(2500)).toBeCloseTo(288, 9);
    expect(t.tickAtMs(-500)).toBeCloseTo(-48, 9); // lead-in extrapolates backwards
    expect(t.bpmAt(191)).toBe(120);
    expect(t.bpmAt(192)).toBe(240);
  });
});

describe('positions, snap grids, rescale', () => {
  it('labels positions in EZ2 measures and ticks', () => {
    expect(formatPosition(positionOf(0, R))).toBe('000:1:00');
    expect(formatPosition(positionOf(4 * R + R + 5, R))).toBe('001:2:01');
    expect(formatSeconds(83.4567)).toBe('1:23.457');
  });

  it('offers only grids EZFF can hold', () => {
    expect(SNAP_GRIDS.map((g) => g.label)).toContain('1/12');
    expect(SNAP_GRIDS.map((g) => g.label)).not.toContain('1/128');
    expect(gridsFor(240).length).toBe(SNAP_GRIDS.length);
    expect(
      stepPulses(
        SNAP_GRIDS.find((g) => g.perMeasure === 192)!,
        240,
      ),
    ).toBe(5);
    expect(gridsFor(100).map((g) => g.perMeasure)).toEqual([4, 8, 16]);
  });

  it('moves STOPs, holds and BGA with the notes', () => {
    const c = newChart({ mode: '5k', tier: 'NM' });
    c.channels.push({ id: 1, name: 'a.wav' });
    c.notes.push({ id: 1, ch: 1, x: 11, y: 240, l: 120, c: false });
    c.stopEvents.push({ y: 480, duration: 60 });
    c.bga = { header: [], bga: [{ y: 720, id: 1 }], layer: [], poor: [] };
    const r = rescaleChart(c, 480);
    expect(r.worstError).toBe(0);
    expect(c.notes[0]).toMatchObject({ y: 480, l: 240 });
    expect(c.stopEvents[0]).toEqual({ y: 960, duration: 120 });
    expect(c.bga.bga[0]!.y).toBe(1440);
    expect(c.info.resolution).toBe(480);
  });
});

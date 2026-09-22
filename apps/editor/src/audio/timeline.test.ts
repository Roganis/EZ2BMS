import { EngineTempo } from '@ez2bms/chart-core';
import { describe, expect, it } from 'vitest';
import { PlanTimeline } from './timeline';

describe('plan timeline', () => {
  const tempo = new EngineTempo(150, [{ tick: 192 * 4, bpm: Math.fround(174) }]);
  const t = new PlanTimeline(tempo, 240, [{ y: 480, duration: 240 }]);

  it('maps pulses to the engine milliseconds and back', () => {
    expect(t.msAt(0)).toBe(0);
    expect(t.msAt(240)).toBeCloseTo(400, 6); // a beat at 150 BPM
    for (const y of [0, 100, 479, 481, 1000, 3000, 5000])
      expect(t.pulseAt(t.msAt(y))).toBeCloseTo(y, 6);
  });

  it('turns a STOP into a gap: time runs, the position holds', () => {
    const at = t.msAt(480);
    const after = t.msAt(481);
    expect(after - at).toBeGreaterThan(399); // the 240-pulse gap at 150 BPM, plus one pulse
    expect(t.pulseAt(at + 200)).toBe(480);
  });
});

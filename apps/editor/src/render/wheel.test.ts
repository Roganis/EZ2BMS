import { describe, expect, it } from 'vitest';
import { WheelScene } from './wheel';

const run = (s: WheelScene, n: number, hasDisc: (i: number) => boolean = (i) => i === 0) => {
  for (let t = 0; t < n; t++) s.tick(false, false, hasDisc);
};

describe('the wheel scene', () => {
  it('turns the focused disc a whole turn per tier step, and back', () => {
    const s = new WheelScene(8);
    run(s, 5);
    expect(s.swingFor).toBe(0);
    expect(s.angle).toBe(0);
    s.setTier('HD');
    run(s, 200);
    expect(Math.round(s.angle)).toBe(360);
    s.setTier('EX');
    run(s, 200);
    expect(Math.round(s.angle)).toBe(1080);
    s.setTier('NM');
    run(s, 200);
    expect(Math.round(s.angle)).toBe(0);
  });

  it('latches afresh on each song that comes to rest, and not on one without a disc', () => {
    const s = new WheelScene(3);
    s.setTier('SHD');
    run(s, 200);
    expect(Math.round(s.angle)).toBe(720);
    // A step: the chase runs, the neighbour (no disc) never takes the swing.
    expect(s.tick(true, false, (i) => i === 0)).toBe(1);
    run(s, 60);
    expect(s.wheel.cursor).toBe(1);
    expect(s.focused(1, false)).toBe(false);
    expect(s.swingFor).toBe(0);
    // Back to a song with a disc: the swing restarts from 0 toward its tier.
    s.tick(false, true, () => true);
    run(s, 2, () => true);
    expect(s.swingFor).toBe(0);
    s.tick(true, false, () => true);
    for (let t = 0; t < 60 && s.swingFor !== 1; t++) s.tick(false, false, () => true);
    expect(s.swingFor).toBe(1);
    // Its first frame from 0: a sixth of the way past 180, plus the tier's 90.
    expect(s.angle).toBe(120);
  });
});

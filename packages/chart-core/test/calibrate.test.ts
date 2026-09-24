// The latency calibration's arithmetic (input/calibrate.ts): warm-up taps
// dropped, outliers cut by the median absolute deviation, the median kept.

import { describe, expect, it } from 'vitest';
import { calibrate, median, type Tap } from '../src/input/calibrate';

const taps = (offsets: number[]): Tap[] => offsets.map((offsetMs, beat) => ({ beat, offsetMs }));

describe('latency calibration', () => {
  it('is the median of the taps after the warm-up', () => {
    // Warm-up taps way off; then a steady player 30 ms late, give or take.
    const r = calibrate(taps([200, -150, 90, 60, 28, 31, 30, 33, 27, 30, 29, 32]))!;
    expect(r.offsetMs).toBe(30);
    expect(r.used).toBe(8);
    expect(r.dropped).toBe(4);
    expect(r.spreadMs).toBeGreaterThan(0);
    expect(r.spreadMs).toBeLessThan(5);
  });

  it('drops a slip or a double tap, but not a merely sloppy tap', () => {
    const r = calibrate(taps([0, 0, 0, 0, 40, 44, 38, 41, 42, 39, 45, 250, -180, 52]))!;
    // 250 and -180 are out; 52 is within 15 ms of the rest and stays.
    expect(r.used).toBe(8);
    expect(r.offsetMs).toBe(41.5);
  });

  it('says nothing from too few taps', () => {
    expect(calibrate(taps([10, 10, 10, 10, 10, 10, 10]))).toBeNull();
    expect(calibrate(taps([0, 0, 0, 0, 10, 12, 11, 9, 10, 10]))?.offsetMs).toBe(10);
    // Warm-up is by beat, whichever taps came.
    expect(calibrate([4, 5, 6, 7, 8, 9].map((beat) => ({ beat, offsetMs: -12 })))?.offsetMs).toBe(
      -12,
    );
  });

  it('takes the middle of an even count', () => {
    expect(median([1, 4, 2, 3])).toBe(2.5);
    expect(median([5])).toBe(5);
    expect(median([])).toBeNaN();
  });
});

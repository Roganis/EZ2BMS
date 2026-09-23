import { describe, expect, it } from 'vitest';
import { webBackend } from '../bridge/web';
import { PeakTiles } from './peaktiles';

/** A mono 16-bit WAV at 8 kHz, `seconds` long, silent but for single loud samples at `clicks` seconds. */
function wav(seconds: number, clicks: number[]): Uint8Array {
  const n = Math.round(seconds * 8000);
  const b = new Uint8Array(44 + n * 2);
  const dv = new DataView(b.buffer);
  const tag = (o: number, s: string) => [...s].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  tag(0, 'RIFF');
  dv.setUint32(4, 36 + n * 2, true);
  tag(8, 'WAVEfmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true);
  dv.setUint32(28, 16000, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  tag(36, 'data');
  dv.setUint32(40, n * 2, true);
  for (const c of clicks) dv.setInt16(44 + Math.round(c * 8000) * 2, 30000, true);
  return b;
}

describe('peak tiles', () => {
  it('answer from the whole-file level first, then fetch the level a stretch needs', async () => {
    const backend = webBackend(new Map([['/s/stem.wav', wav(10, [7.5])]]));
    const asked: [number, number, number][] = [];
    const audio = {
      peakRange: (id: number, level: number, from: number, count: number) => {
        asked.push([level, from, count]);
        return backend.audio.peakRange(id, level, from, count);
      },
    };
    let loads = 0;
    const tiles = new PeakTiles(audio, () => loads++);
    const [l] = await backend.audio.load(['/s/stem.wav']);
    expect(l!.seconds).toBe(10);
    // Nothing until the mipmap's shape and its whole-file level are here.
    expect(tiles.range(l!, 7.49, 7.51)).toBeUndefined();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(loads).toBeGreaterThan(0);
    // 10 s at the browser's 48 kHz: 7500 buckets of 64; level 1 (3750) is one tile.
    expect(asked.slice(0, 2)).toEqual([
      [0, 0, 0],
      [1, 0, 4096],
    ]);
    // 20 ms is coarser than level 1 buckets: level 1 answers, nothing is fetched.
    expect(tiles.range(l!, 7.49, 7.51)![1]).toBe(30000);
    expect(asked).toHaveLength(2);
    // 1 ms (48 frames) wants level 0, bucket 5625 - tile 1: level 1 answers meanwhile.
    expect(tiles.range(l!, 7.4995, 7.5005)![1]).toBe(30000);
    await new Promise((r) => setTimeout(r, 0));
    expect(asked.at(-1)).toEqual([0, 4096, 4096]);
    expect(tiles.range(l!, 7.4995, 7.5005)![1]).toBe(30000);
    expect(tiles.range(l!, 7.49, 7.495)).toEqual([0, 0]);
    expect(tiles.range(l!, 2, 3)).toEqual([0, 0]);
    // Past the end: silence, not a fetch.
    expect(tiles.range(l!, 11, 12)).toEqual([0, 0]);
    // A tile is fetched once.
    const n = asked.length;
    tiles.range(l!, 7.49, 7.51);
    tiles.range(l!, 1, 1.02);
    expect(asked.length).toBe(n);
  });
});

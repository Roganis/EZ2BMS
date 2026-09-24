import { describe, expect, it, vi } from 'vitest';
import type { Loaded } from '../bridge';
import { ThumbCache } from './thumbs';

const loaded = (id: number | null): Loaded => ({
  path: `s${id}.wav`,
  id,
  frames: 100,
  channels: 1,
  seconds: 1,
  error: id === null ? 'bad file' : null,
});

describe('ThumbCache', () => {
  it('batches requests per width and caches per loaded sound', async () => {
    vi.useFakeTimers();
    const thumbs = vi.fn(async (ids: number[], width: number) => {
      const out = new Int16Array(ids.length * width * 2);
      ids.forEach((id, k) => out.fill(id, k * width * 2, (k + 1) * width * 2));
      return out;
    });
    const c = new ThumbCache({ thumbs });
    const a = loaded(3);
    const b = loaded(5);
    const pa = c.request(a, 4);
    const pb = c.request(b, 4);
    const pa2 = c.request(a, 4);
    const pw = c.request(a, 8);
    await vi.advanceTimersByTimeAsync(30);
    const [ra, rb, ra2, rw] = await Promise.all([pa, pb, pa2, pw]);
    expect(thumbs).toHaveBeenCalledTimes(2);
    expect(thumbs).toHaveBeenCalledWith([3, 5], 4);
    expect(thumbs).toHaveBeenCalledWith([3], 8);
    expect([...ra]).toEqual(new Array(8).fill(3));
    expect([...rb]).toEqual(new Array(8).fill(5));
    expect(ra2).toBe(ra);
    expect(rw).toHaveLength(16);
    expect(c.get(a, 4)).toBe(ra);
    await c.request(a, 4);
    expect(thumbs).toHaveBeenCalledTimes(2);
    // The same file loaded again is a new Loaded: fetched afresh.
    const again = c.request({ ...a }, 4);
    await vi.advanceTimersByTimeAsync(30);
    await again;
    expect(thumbs).toHaveBeenCalledTimes(3);
    await expect(c.request(loaded(null), 4)).rejects.toThrow('bad file');
    vi.useRealTimers();
  });
});

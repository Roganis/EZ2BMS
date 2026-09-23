import { describe, expect, it } from 'vitest';
import { wavSeconds, webBackend } from './web';

const enc = (s: string) => new TextEncoder().encode(s);

/** A minimal PCM WAV: 16-bit stereo at 44.1 kHz, `frames` long. */
function wav(frames: number): Uint8Array {
  const data = frames * 4;
  const b = new Uint8Array(44 + data);
  const dv = new DataView(b.buffer);
  b.set(enc('RIFF'), 0);
  dv.setUint32(4, 36 + data, true);
  b.set(enc('WAVEfmt '), 8);
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 2, true);
  dv.setUint32(24, 44100, true);
  dv.setUint32(28, 44100 * 4, true);
  dv.setUint16(32, 4, true);
  dv.setUint16(34, 16, true);
  b.set(enc('data'), 36);
  dv.setUint32(40, data, true);
  return b;
}

describe('the browser backend', () => {
  it('imports flat into the song, reusing the same bytes and never overwriting', async () => {
    const files = new Map<string, Uint8Array>([
      ['/song/kick.wav', enc('old kick')],
      ['/song/snare.ogg', enc('snare')],
      ['/song/stems/pad.wav', enc('pad')],
      ['/src/kick.wav', enc('new kick')],
      ['/src/kit/snare.ogg', enc('snare')],
      ['/src/kit/readme.txt', enc('no')],
    ]);
    const b = webBackend(files);
    const got = await b.importFiles('/song', ['/src/kick.wav', '/src/kit', '/song/stems/pad.wav']);
    expect(got.map((i) => [i.name, i.reused])).toEqual([
      ['kick (2).wav', false],
      // A folder's files in name order: readme.txt, then snare.ogg.
      [null, false],
      ['snare.ogg', true],
      ['stems/pad.wav', true],
    ]);
    expect(new TextDecoder().decode(await b.readFile('/song/kick (2).wav'))).toBe('new kick');
    expect(new TextDecoder().decode(await b.readFile('/song/kick.wav'))).toBe('old kick');
  });

  it("lays waveform levels out as the desktop's mipmap and draws a test WAV from its samples", async () => {
    const w = wav(44100);
    const dv = new DataView(w.buffer);
    // One loud frame, half a second in (left channel).
    dv.setInt16(44 + 22050 * 4, 20000, true);
    const b = webBackend(new Map([['/s/click.wav', w]]));
    const [l] = await b.audio.load(['/s/click.wav']);
    // A second at the browser's 48 kHz: 750 buckets of 64, halving to 1.
    const r = await b.audio.peakRange(l!.id!, 0, 370, 10);
    expect([r.base, r.frames, r.length, r.levels, r.from]).toEqual([64, 48000, 750, 11, 370]);
    const hi = Array.from({ length: 10 }, (_, i) => r.data[2 * i + 1]);
    expect(hi.filter((v) => v === 20000)).toHaveLength(1);
    expect(hi[5]).toBe(20000); // bucket 375 holds 0.5 s
    expect((await b.audio.peakRange(l!.id!, 10, 0, 5)).data).toHaveLength(2);
    expect((await b.audio.peakRange(l!.id!, 0, 900, 5)).data).toHaveLength(0);
  });

  it("gives the demo stem's beats as onsets, and silence in its quiet bar", async () => {
    const b = webBackend(new Map());
    const [l] = await b.audio.load(['/demo/stem_pad.wav']);
    const a = await b.audio.analysis(l!.id!);
    expect(a.tempo[0]!.bpm).toBe(150);
    expect(a.onsets.slice(0, 3).map(([t, s]) => [+t.toFixed(6), +s.toFixed(6)])).toEqual([
      [0, 1],
      [0.2, 0.375],
      [0.4, 1],
    ]);
    // Measure 9 (12.8-14.4 s) is silent: once the last hit has faded, flat.
    const bucket = 64 / 48000;
    const r = await b.audio.peakRange(l!.id!, 0, Math.ceil(13.2 / bucket), 800);
    expect(Math.max(...r.data)).toBe(0);
    expect(
      (await b.audio.analysis((await b.audio.load(['/demo/kick.wav']))[0]!.id!)).onsets,
    ).toEqual([]);
  });

  it('renames without replacing another file, case changes allowed', async () => {
    const b = webBackend(
      new Map([
        ['/s/a.wav', enc('a')],
        ['/s/b.wav', enc('b')],
      ]),
    );
    await expect(b.renameFile('/s/a.wav', '/s/B.wav')).rejects.toThrow(/exists/);
    await b.renameFile('/s/a.wav', '/s/drums/A.wav');
    await b.renameFile('/s/drums/A.wav', '/s/drums/a.wav');
    expect((await b.list('/s/drums')).map((e) => e.name)).toEqual(['a.wav']);
  });

  it('reads a WAV’s real length, and loads it with that length', async () => {
    expect(wavSeconds(wav(22050))).toBeCloseTo(0.5, 6);
    expect(wavSeconds(enc('OggS nope'))).toBeUndefined();
    const b = webBackend(new Map([['/s/tone.wav', wav(44100 * 3)]]));
    const [l] = await b.audio.load(['/s/tone.wav']);
    expect(l!.seconds).toBeCloseTo(3, 6);
    const t = await b.audio.thumbs([l!.id!, 7], 16);
    expect(t.length).toBe(2 * 16 * 2);
    expect(Math.max(...t)).toBeGreaterThan(1000);
  });
});

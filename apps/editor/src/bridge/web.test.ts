import { describe, expect, it } from 'vitest';
import type { PadEvent } from './types';
import { wavSeconds, webBackend } from './web';
import { padKeys } from './web-pad';

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
  it('writes an imported song all at once, an .ssf becoming a WAV of the same PCM', async () => {
    const ssf = new Uint8Array(18 + 6);
    const dv = new DataView(ssf.buffer);
    dv.setUint16(0, 1, true);
    dv.setUint32(2, 22050, true);
    dv.setUint32(6, 44100, true);
    dv.setUint16(10, 2, true);
    dv.setUint16(12, 16, true);
    dv.setUint32(14, 6, true);
    ssf.set([1, 2, 3, 4, 5, 6], 18);
    const files = new Map<string, Uint8Array>([
      ['/game/sound/a/kick.ssf', ssf],
      ['/game/sound/a/bad.ssf', enc('xx')],
      ['/taken/x', enc('x')],
    ]);
    const b = webBackend(files);
    const seen: number[][] = [];
    const r = await b.importRun(
      '/songs/new',
      {
        files: [{ path: 'streetmix1p-new.bmson', text: '{}' }],
        copies: [
          { from: '/game/sound/a/kick.ssf', to: 'kick.wav', convert: 'pcm' },
          { from: '/game/sound/a/bad.ssf', to: 'bad.wav', convert: 'pcm' },
          { from: '/game/sound/a/gone.ssf', to: 'gone.wav', convert: 'pcm' },
        ],
      },
      (d, t) => seen.push([d, t]),
    );
    expect(r).toMatchObject({
      copied: 1,
      failed: [
        ['bad.wav', expect.any(String)],
        ['gone.wav', expect.any(String)],
      ],
    });
    expect(seen.at(-1)).toEqual([4, 4]);
    const w = await b.readFile('/songs/new/kick.wav');
    expect(new TextDecoder().decode(w.subarray(0, 4))).toBe('RIFF');
    expect([...w.subarray(44)]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(await b.readText('/songs/new/streetmix1p-new.bmson')).toBe('{}');
    await expect(b.importRun('/taken', { files: [], copies: [] })).rejects.toThrow(/not empty/);
  });

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

describe("the browser backend's exports (the host's rules, in memory)", () => {
  /** A 16-bit .ssf: a game keysound. */
  const ssf = (channels: number, rate: number, samples: number[]) => {
    const b = new Uint8Array(18 + samples.length * 2);
    const dv = new DataView(b.buffer);
    dv.setUint16(0, channels, true);
    dv.setUint32(2, rate, true);
    dv.setUint32(6, rate * channels * 2, true);
    dv.setUint16(10, channels * 2, true);
    dv.setUint16(12, 16, true);
    dv.setUint32(14, samples.length * 2, true);
    samples.forEach((s, i) => dv.setInt16(18 + i * 2, s, true));
    return b;
  };
  const game = () =>
    new Map<string, Uint8Array>([
      ['/game/sound/Alpha/StreetMix1p-alpha.ez', enc('old chart')],
      ['/game/sound/Alpha/kick.ssf', ssf(1, 22050, [1, 2, 3, 4])],
      ['/game/system/StreetMix/song.bin', enc('old table')],
    ]);

  it('finds a game keysound brought in and sent back, and says how each is made', async () => {
    const files = game();
    // The .ssf, imported: the same samples as a WAV.
    const b = webBackend(files);
    await b.importRun('/proj', {
      files: [],
      copies: [{ from: '/game/sound/Alpha/kick.ssf', to: 'kick.wav', convert: 'pcm' }],
    });
    await b.writeBytes('/proj/stem.wav', wav(1000), false);
    const r = await b.export.probe([
      {
        src: '/proj/kick.wav',
        start_frame: 0,
        end_frame: null,
        candidates: ['/game/sound/Alpha/kick.ssf'],
      },
      { src: '/proj/stem.wav', start_frame: 10, end_frame: 20, candidates: [] },
      { src: '/proj/gone.wav', start_frame: 0, end_frame: null, candidates: [] },
    ]);
    expect(r[0]).toMatchObject({ how: 'rewrap', equal: 0 });
    expect(r[0]!.fnv).toMatch(/^[0-9a-f]{16}$/);
    expect(r[1]).toMatchObject({ how: 'cut', equal: null });
    expect(r[2]!.error).toMatch(/no such file/);
  });

  it('writes into the game with a backup, under the names on disk, and restores it', async () => {
    const b = webBackend(game());
    const text = async (p: string) => new TextDecoder().decode(await b.readFile(p));
    const gone = async (p: string) =>
      b.readFile(p).then(
        () => false,
        () => true,
      );
    await b.writeBytes('/proj/stem.wav', wav(1000), false);
    const r = await b.export.toGame('/game', {
      stamp: '20260923-alpha',
      label: 'Alpha',
      files: [
        { path: 'sound/alpha/streetmix1p-alpha.ez', bytes: enc('new chart'), expect: 'any' },
        { path: 'sound/alpha/streetmix1p-alpha-shd.ez', bytes: enc('new tier'), expect: 'absent' },
      ],
      sounds: [
        {
          src: '/proj/stem.wav',
          start_frame: 0,
          end_frame: 100,
          path: 'sound/alpha/stem_0_2.ssf',
          format: 'ssf',
          expect: 'absent',
        },
      ],
    });
    expect(r.replaced).toEqual(['sound/Alpha/StreetMix1p-alpha.ez']);
    expect(r.created).toEqual(['sound/Alpha/streetmix1p-alpha-shd.ez', 'sound/Alpha/stem_0_2.ssf']);
    expect(await text('/game/sound/Alpha/StreetMix1p-alpha.ez')).toBe('new chart');
    expect(await gone('/game/sound/alpha/streetmix1p-alpha.ez')).toBe(true);
    expect((await b.readFile('/game/sound/Alpha/stem_0_2.ssf')).length).toBe(18 + 100 * 4);
    expect((await b.export.backups('/game')).map((x) => [x.stamp, x.state, x.files])).toEqual([
      ['20260923-alpha', 'applied', 3],
    ]);
    const back = await b.export.restore('/game', '20260923-alpha');
    expect(back).toMatchObject({ restored: ['sound/Alpha/StreetMix1p-alpha.ez'], conflicts: [] });
    expect(await text('/game/sound/Alpha/StreetMix1p-alpha.ez')).toBe('old chart');
    expect(await gone('/game/sound/Alpha/streetmix1p-alpha-shd.ez')).toBe(true);
    expect(await gone('/game/sound/Alpha/stem_0_2.ssf')).toBe(true);
    expect((await b.list('/game/sound/Alpha')).map((e) => e.name)).toEqual([
      'kick.ssf',
      'StreetMix1p-alpha.ez',
    ]);
    // Twice: nothing left to do.
    expect((await b.export.restore('/game', '20260923-alpha')).skipped).toHaveLength(3);
  });

  it('refuses a stale plan, a reused file that changed, and paths outside', async () => {
    const b = webBackend(game());
    const one = (path: string, expect?: string) => ({
      stamp: 's',
      files: [{ path, bytes: enc('x'), ...(expect ? { expect } : {}) }],
    });
    await expect(b.export.toGame('/game', one('sound/Alpha/kick.ssf', 'absent'))).rejects.toThrow(
      /plan it again/,
    );
    await expect(
      b.export.toGame('/game', one('sound/Alpha/kick.ssf', '0000000000000000')),
    ).rejects.toThrow(/plan it again/);
    await expect(
      b.export.toGame('/game', {
        ...one('sound/Alpha/n.ssf'),
        keep: [{ path: 'sound/Alpha/kick.ssf', fnv: '0000000000000000' }],
      }),
    ).rejects.toThrow(/changed or gone/);
    await expect(b.export.toGame('/game', one('../x'))).rejects.toThrow(/inside/);
    await expect(b.export.toGame('/game', one('.ez2bms-backup/x'))).rejects.toThrow(/inside/);
    expect(await b.export.backups('/game')).toEqual([]);
    // A changed file is left alone by restore, unless forced.
    await b.export.toGame('/game', one('sound/Alpha/StreetMix1p-alpha.ez'));
    await b.writeBytes('/game/sound/Alpha/StreetMix1p-alpha.ez', enc('by hand'), false);
    expect((await b.export.restore('/game', 's')).conflicts).toEqual([
      'sound/Alpha/StreetMix1p-alpha.ez',
    ]);
    expect((await b.export.restore('/game', 's', true)).restored).toHaveLength(1);
  });

  it('writes a new folder, and never over one that has files', async () => {
    const b = webBackend(game());
    const r = await b.export.toFolder('/out', {
      files: [{ path: 'sound/alpha/a.ez', bytes: enc('a') }],
    });
    expect(r).toEqual({ dir: '/out', files: 1 });
    expect(new TextDecoder().decode(await b.readFile('/out/sound/alpha/a.ez'))).toBe('a');
    await expect(b.export.toFolder('/out', { files: [] })).rejects.toThrow(/not empty/);
  });
});

describe('the browser build pads', () => {
  const flush = () => new Promise<void>((r) => setTimeout(r, 0));

  it('number boards by make as EZ2PORT does', () => {
    expect(
      padKeys([
        { vid: 0x0810, pid: 0xe501 },
        { vid: 0x045e, pid: 0x028e },
        { vid: 0x0810, pid: 0xe501 },
      ]),
    ).toEqual(['0810:e501', '045e:028e', '0810:e501#1']);
  });

  it('send events only while held, with the times given', async () => {
    const b = webBackend(new Map());
    const pad = b.devPad!;
    const got: PadEvent[] = [];
    b.input.stream((evs) => got.push(...evs));
    const a = pad.plug();
    const a2 = pad.plug({ name: 'Second' });
    expect([a, a2]).toEqual(['0810:e501', '0810:e501#1']);
    pad.button(a, 0, true, 1000);
    await flush();
    // Closed: nothing flows, nothing is listed.
    expect(got).toEqual([]);
    expect((await b.input.info()).devices).toEqual([]);

    await b.input.hold(true);
    pad.button(a2, 3, true, 5_000_000);
    pad.axis(a, 1, -20000, 6_000_000);
    await flush();
    expect(got).toEqual([
      {
        kind: 'devices',
        devices: [
          expect.objectContaining({ key: a }),
          expect.objectContaining({ key: a2, name: 'Second' }),
        ],
      },
      { kind: 'button', device: a2, index: 3, down: true, hostNs: 5_000_000 },
      { kind: 'axis', device: a, index: 1, value: -20000, hostNs: 6_000_000 },
    ]);
    expect(() => pad.button('dead:beef', 0, true)).toThrow('no pad');

    // Unplugging renumbers; releasing the pads says so.
    got.length = 0;
    pad.unplug(a);
    await b.input.hold(false);
    await flush();
    expect(got).toEqual([
      { kind: 'devices', devices: [expect.objectContaining({ key: '0810:e501', name: 'Second' })] },
      { kind: 'devices', devices: [] },
    ]);
    expect(pad.active).toBe(false);
  });

  it('list keys.ini where EZ2PORT would look, the data folder first', async () => {
    const b = webBackend(
      new Map([
        ['/game/sound/a/x.ssf', enc('x')],
        ['/game/system/x.gds', enc('x')],
        ['/game/ez2port/keys.ini', enc('[Keys]\n')],
      ]),
    );
    const files = await b.input.configFiles('/game/ez2play.exe', '/game');
    expect(files).toEqual([
      { kind: 'keys', path: '/game/ez2port/keys.ini', exists: true, source: 'data' },
      { kind: 'settings', path: '/game/ez2port/settings.ini', exists: false, source: 'data' },
      { kind: 'keys', path: '/config/ez2port/keys.ini', exists: false, source: 'user' },
      { kind: 'settings', path: '/config/ez2port/settings.ini', exists: false, source: 'user' },
    ]);
    expect((await b.input.configFiles('/tools/ez2play', null)).map((c) => c.source)).toEqual([
      'user',
      'user',
    ]);
  });
});

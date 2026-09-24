// Movie headers, built here by hand in each container's documented layout
// (ISO/IEC 14496-12, the Matroska/EBML spec, the ASF spec, RIFF AVI): what
// the probe reads from them, and what EZ2PORT's Windows build would make of it.

import { describe, expect, it } from 'vitest';
import { portCannotPlay, probeMovie, type MovieInfo } from '../src/media/movie';

const enc = new TextEncoder();
function cat(...parts: (Uint8Array | number[])[]): Uint8Array {
  const arrs = parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) out.set(a, (o += a.length) - a.length);
  return out;
}
const be = (n: number, bytes: number) =>
  [...Array(bytes).keys()].map((i) => Math.floor(n / 256 ** (bytes - 1 - i)) % 256);
const le = (n: number, bytes: number) => be(n, bytes).reverse();
const zeros = (n: number) => new Uint8Array(n);

/** A file read the way the host serves it, counting what was asked for. */
function file(bytes: Uint8Array) {
  const f = {
    read: 0,
    probe: () =>
      probeMovie(async (o, n) => {
        f.read += n;
        return bytes.slice(o, o + n);
      }, bytes.length),
  };
  return f;
}

// ---- ISO BMFF
const box = (type: string, ...body: (Uint8Array | number[])[]) => {
  const b = cat(...body);
  return cat(be(b.length + 8, 4), enc.encode(type), b);
};
const full = (v = 0) => [v, 0, 0, 0];
function mp4(opts: {
  brand?: string;
  entry: Uint8Array;
  w?: number;
  h?: number;
  timescale?: number;
  duration?: number;
  v1?: boolean;
  mdatBefore?: number;
}): Uint8Array {
  const { w = 640, h = 480, timescale = 1000, duration = 30000, v1 = false } = opts;
  const mvhd = box(
    'mvhd',
    full(),
    zeros(8),
    be(600, 4),
    be((duration / timescale) * 600, 4),
    zeros(80),
  );
  const tkhd = box(
    'tkhd',
    full(),
    zeros(20),
    zeros(8),
    zeros(8),
    zeros(36),
    be(w * 65536, 4),
    be(h * 65536, 4),
  );
  const mdhd = v1
    ? box('mdhd', full(1), zeros(16), be(timescale, 4), be(duration, 8), zeros(4))
    : box('mdhd', full(), zeros(8), be(timescale, 4), be(duration, 4), zeros(4));
  const hdlr = box('hdlr', full(), zeros(4), enc.encode('vide'), zeros(12), [0]);
  const stsd = box('stsd', full(), be(1, 4), opts.entry);
  const trak = box(
    'trak',
    tkhd,
    box('mdia', mdhd, hdlr, box('minf', box('vmhd', full(), zeros(8)), box('stbl', stsd))),
  );
  const sound = box(
    'trak',
    box('mdia', box('hdlr', full(), zeros(4), enc.encode('soun'), zeros(13))),
  );
  return cat(
    box('ftyp', enc.encode(opts.brand ?? 'isom'), zeros(4), enc.encode('isommp41')),
    opts.mdatBefore ? box('mdat', zeros(opts.mdatBefore)) : [],
    box('moov', mvhd, sound, trak),
  );
}
const visual = (tag: string, w: number, h: number, ...kids: Uint8Array[]) =>
  box(tag, zeros(6), be(1, 2), zeros(16), be(w, 2), be(h, 2), zeros(50), ...kids);
const esds = (oti: number) =>
  box(
    'esds',
    full(),
    [0x03, 0x80, 0x80, 0x80, 20],
    be(1, 2),
    [0],
    [0x04, 0x80, 0x80, 0x80, 13],
    [oti],
    zeros(12),
  );

// ---- EBML
const ebml = (id: number, ...body: (Uint8Array | number[])[]) => {
  const b = cat(...body);
  const idBytes = be(id, id > 0xffffff ? 4 : id > 0xffff ? 3 : id > 0xff ? 2 : 1);
  return cat(idBytes, [0x01], be(b.length, 7), b);
};
const unknownSize = (id: number, ...body: Uint8Array[]) =>
  cat(be(id, 4), [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff], ...body);
const f64 = (v: number) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, v);
  return b;
};
const header = (doc: string) => ebml(0x1a45dfa3, ebml(0x4282, enc.encode(doc)));
const info = (ms?: number) =>
  ebml(0x1549a966, ebml(0x2ad7b1, be(1_000_000, 3)), ms === undefined ? [] : ebml(0x4489, f64(ms)));
const track = (codec: string, w: number, h: number, priv?: Uint8Array) =>
  ebml(
    0x1654ae6b,
    ebml(0xae, ebml(0x83, [2]), ebml(0x86, enc.encode('A_OPUS'))),
    ebml(
      0xae,
      ebml(0x83, [1]),
      ebml(0x86, enc.encode(codec)),
      priv ? ebml(0x63a2, priv) : [],
      ebml(0xe0, ebml(0xb0, be(w, 2)), ebml(0xba, be(h, 2))),
    ),
  );
const bitmapInfo = (fourcc: string, w: number, h: number) =>
  cat(le(40, 4), le(w, 4), le(h, 4), le(1, 2), le(24, 2), enc.encode(fourcc), zeros(20));

// ---- ASF
function guid(s: string): number[] {
  const [a, b, c, d, e] = s.split('-');
  const hex = (x: string) => x.match(/../g)!.map((y) => parseInt(y, 16));
  return [...hex(a!).reverse(), ...hex(b!).reverse(), ...hex(c!).reverse(), ...hex(d! + e!)];
}
const asfObject = (g: string, ...body: (Uint8Array | number[])[]) => {
  const b = cat(...body);
  return cat(guid(g), le(b.length + 24, 8), b);
};

const probe = async (bytes: Uint8Array) => file(bytes).probe();
const is = (m: MovieInfo, want: Partial<MovieInfo>) => expect(m).toMatchObject(want);

describe('movie headers', () => {
  it('MP4: H.264, its size and length, found past the media data without reading it', async () => {
    const bytes = mp4({
      entry: visual('avc1', 640, 480, box('avcC', zeros(8))),
      mdatBefore: 300_000,
    });
    const f = file(bytes);
    is(await f.probe(), {
      container: 'mp4',
      codec: 'h264',
      width: 640,
      height: 480,
      durationMs: 30000,
    });
    expect(f.read).toBeLessThan(70_000);
  });

  it('QuickTime: MPEG-4 part 2 by its esds, a version-1 media header', async () => {
    const m = await probe(
      mp4({
        brand: 'qt  ',
        entry: visual('mp4v', 320, 240, esds(0x20)),
        v1: true,
        timescale: 90000,
        duration: 900000,
      }),
    );
    is(m, { container: 'mov', codec: 'mpeg4', width: 320, height: 240, durationMs: 10000 });
    expect(portCannotPlay(m)).toBeUndefined();
    // An mp4v entry that is really MPEG-1 video: no decoder in the port's build.
    const m1 = await probe(mp4({ entry: visual('mp4v', 352, 240, esds(0x6a)) }));
    expect(m1.codec).toBe('mpeg1video');
    expect(portCannotPlay(m1)).toMatch(/no mpeg1video decoder/);
  });

  it('MP4: HEVC and AV1 open in the container but have no decoder', async () => {
    for (const [tag, codec] of [
      ['hvc1', 'hevc'],
      ['av01', 'av1'],
    ] as const) {
      const m = await probe(mp4({ entry: visual(tag, 1920, 1080) }));
      is(m, { codec, width: 1920, height: 1080 });
      expect(portCannotPlay(m)).toMatch(new RegExp(`no ${codec} decoder`));
    }
  });

  it('WebM: VP9, the Info duration, the Tracks past a cluster skipped unread', async () => {
    const cluster = ebml(0x1f43b675, zeros(200_000));
    const bytes = cat(
      header('webm'),
      ebml(0x18538067, info(12500), cluster, track('V_VP9', 1280, 720)),
    );
    const f = file(bytes);
    is(await f.probe(), {
      container: 'webm',
      codec: 'vp9',
      width: 1280,
      height: 720,
      durationMs: 12500,
    });
    expect(f.read).toBeLessThan(70_000);
  });

  it('Matroska: a live recording has no length; a VFW track is named by its fourcc', async () => {
    const live = cat(header('webm'), unknownSize(0x18538067, info(), track('V_VP8', 640, 480)));
    is(await probe(live), { container: 'webm', codec: 'vp8', durationMs: null });
    const vfw = cat(
      header('matroska'),
      ebml(
        0x18538067,
        info(4000),
        track('V_MS/VFW/FOURCC', 320, 240, bitmapInfo('WMV3', 320, 240)),
      ),
    );
    is(await probe(vfw), {
      container: 'mkv',
      codec: 'wmv3',
      width: 320,
      height: 240,
      durationMs: 4000,
    });
  });

  it('ASF: the WMV codec, its size, the play duration less the preroll', async () => {
    const fileProps = asfObject(
      '8cabdca1-a947-11cf-8ee4-00c00c205365',
      zeros(16),
      le(0, 8),
      zeros(8),
      le(0, 8),
      le(75_000_000, 8), // 7.5 s in 100 ns
      le(0, 8),
      le(3000, 8), // preroll, ms
      zeros(16),
    );
    const stream = asfObject(
      'b7dc0791-a9b7-11cf-8ee6-00c00c205365',
      guid('bc19efc0-5b4d-11cf-a8fd-00805f5c442b'),
      zeros(16),
      zeros(8),
      le(51, 4),
      le(0, 4),
      le(1, 2),
      zeros(4),
      le(256, 4),
      le(256, 4),
      [2],
      le(40, 2),
      bitmapInfo('WMV2', 256, 256),
    );
    const head = asfObject(
      '75b22630-668e-11cf-a6d9-00aa0062ce6c',
      le(2, 4),
      [1, 2],
      fileProps,
      stream,
    );
    const m = await probe(cat(head, zeros(100)));
    is(m, { container: 'asf', codec: 'wmv2', width: 256, height: 256, durationMs: 4500 });
    expect(portCannotPlay(m)).toBeUndefined();
  });

  it('AVI is recognised, and refused: the port has no AVI reader', async () => {
    const chunk = (id: string, ...body: (Uint8Array | number[])[]) => {
      const b = cat(...body);
      return cat(enc.encode(id), le(b.length, 4), b, b.length & 1 ? [0] : []);
    };
    const avih = chunk(
      'avih',
      le(40_000, 4),
      zeros(12),
      le(250, 4),
      zeros(12),
      le(640, 4),
      le(480, 4),
      zeros(16),
    );
    const strl = chunk(
      'LIST',
      enc.encode('strl'),
      chunk('strh', enc.encode('vids'), enc.encode('XVID'), zeros(48)),
      chunk('strf', bitmapInfo('XVID', 640, 480)),
    );
    const hdrl = chunk('LIST', enc.encode('hdrl'), avih, strl);
    const riff = cat(enc.encode('RIFF'), le(4 + hdrl.length, 4), enc.encode('AVI '), hdrl);
    const m = await probe(riff);
    is(m, { container: 'avi', codec: 'mpeg4', width: 640, height: 480, durationMs: 10000 });
    expect(portCannotPlay(m)).toMatch(/no AVI reader: re-wrap it/);
  });

  it('MPEG streams, Ogg Theora and anything else are named, and refused', async () => {
    const ps = await probe(cat([0, 0, 1, 0xba], zeros(100)));
    expect(ps.container).toBe('mpeg-ps');
    expect(portCannotPlay(ps)).toMatch(/cannot read MPEG program stream/);
    const theora = cat(
      enc.encode('OggS'),
      zeros(22),
      [1, 42],
      [0x80],
      enc.encode('theora'),
      [3, 2, 1],
      be(40, 2),
      be(30, 2),
      be(640, 3),
      be(480, 3),
      zeros(40),
    );
    const t = await probe(theora);
    is(t, { container: 'ogg', codec: 'theora', width: 640, height: 480 });
    expect(portCannotPlay(t)).toMatch(/no theora decoder/);
    const junk = await probe(enc.encode('not a movie at all, just some text'));
    expect(junk.container).toBe('unknown');
    expect(portCannotPlay(junk)).toMatch(/not a movie/);
  });

  it('never throws on a cut-off file', async () => {
    const whole = mp4({ entry: visual('avc1', 640, 480) });
    for (let n = 12; n < whole.length; n += 7) {
      const m = await probe(whole.slice(0, n));
      expect(['mp4', 'mov', 'unknown']).toContain(m.container);
    }
    const webm = cat(header('webm'), ebml(0x18538067, info(1000), track('V_VP8', 64, 48)));
    for (let n = 12; n < webm.length; n += 5) await probe(webm.slice(0, n));
  });
});

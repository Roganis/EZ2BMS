// Song art for the demo song, drawn in code: a 4:3 jacket and a 2:1 banner
// as 24-bit BMP files (the simplest form every webview and the host decode).
// Made up, like the demo's sounds - there to be cropped and published.

/** A 24-bit BMP of `w` x `h`, `px(x, y)` giving each pixel's RGB (top-down). */
export function bmp24(
  w: number,
  h: number,
  px: (x: number, y: number) => [number, number, number],
): Uint8Array {
  const row = (w * 3 + 3) & ~3;
  const out = new Uint8Array(54 + row * h);
  const v = new DataView(out.buffer);
  out.set([0x42, 0x4d]);
  v.setUint32(2, out.length, true);
  v.setUint32(10, 54, true);
  v.setUint32(14, 40, true);
  v.setInt32(18, w, true);
  v.setInt32(22, h, true); // positive: rows stored bottom-up
  v.setUint16(26, 1, true);
  v.setUint16(28, 24, true);
  v.setUint32(34, row * h, true);
  for (let y = 0; y < h; y++) {
    const o = 54 + (h - 1 - y) * row;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = px(x, y);
      out[o + x * 3] = b;
      out[o + x * 3 + 1] = g;
      out[o + x * 3 + 2] = r;
    }
  }
  return out;
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** Neon rings round an off-centre point over a violet sky: something to centre on the disc. */
export function demoJacket(w = 480, h = 360): Uint8Array {
  const cx = w * 0.58;
  const cy = h * 0.46;
  return bmp24(w, h, (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    const ring = Math.max(0, 1 - Math.abs(((d / 22) % 1) - 0.5) * 6) * Math.exp(-d / 180);
    const sky = y / h;
    const stripe = (x + y) % 40 < 3 ? 0.35 : 0;
    const core = Math.exp(-((d / 26) ** 2));
    return [
      clamp(30 + 70 * sky + 255 * ring * 0.35 + 255 * core + 60 * stripe),
      clamp(8 + 30 * (1 - sky) + 225 * ring + 200 * core),
      clamp(60 + 110 * (1 - sky) + 255 * ring + 230 * core + 90 * stripe),
    ];
  });
}

/** A 2:1 horizon grid, made for the eyecatch as it is. */
export function demoBanner(w = 800, h = 400): Uint8Array {
  const horizon = h * 0.55;
  return bmp24(w, h, (x, y) => {
    if (y < horizon) {
      const t = y / horizon;
      const sun = Math.hypot(x - w / 2, y - horizon) < h * 0.28 && (y | 0) % 14 > 3 ? 1 : 0;
      return [clamp(40 + 200 * t + 200 * sun), clamp(10 + 40 * t + 120 * sun), clamp(90 - 40 * t)];
    }
    const z = (y - horizon) / (h - horizon);
    const gx = Math.abs((((x - w / 2) / (z * w + 1)) * 8) % 1) < 0.06;
    const gy = Math.abs(((1 / (z + 0.05)) * 2) % 1) < 0.08;
    const line = gx || gy ? 1 : 0;
    return [clamp(10 + 245 * line * z), clamp(4 + 60 * line), clamp(30 + 225 * line * z)];
  });
}

/**
 * A movie's headers and nothing else: an MP4 whose moov says H.264,
 * `w` x `h`, `seconds` long (ISO/IEC 14496-12's boxes, written out here).
 * No frames - the BGA page reads what EZ2PORT's ffmpeg would see from the
 * headers, and the browser build has no decoder to show one anyway.
 */
export function demoMovie(w = 640, h = 480, seconds = 40, tag = 'avc1'): Uint8Array {
  const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const u16 = (n: number) => [(n >>> 8) & 255, n & 255];
  const z = (n: number) => new Array<number>(n).fill(0);
  const text = (s: string) => [...s].map((c) => c.charCodeAt(0));
  const box = (type: string, ...body: number[][]): number[] => {
    const b = body.flat();
    return [...u32(b.length + 8), ...text(type), ...b];
  };
  const full = [0, 0, 0, 0];
  const entry = box(tag, z(6), u16(1), z(16), u16(w), u16(h), z(50), box('avcC', z(8)));
  const moov = box(
    'moov',
    box('mvhd', full, z(8), u32(1000), u32(seconds * 1000), z(80)),
    box(
      'trak',
      box('tkhd', full, z(20), z(16), z(36), u32(w * 65536), u32(h * 65536)),
      box(
        'mdia',
        box('mdhd', full, z(8), u32(1000), u32(seconds * 1000), z(4)),
        box('hdlr', full, z(4), text('vide'), z(12), [0]),
        box('minf', box('stbl', box('stsd', full, u32(1), entry))),
      ),
    ),
  );
  return Uint8Array.from([...box('ftyp', text('isom'), z(4), text('isomavc1')), ...moov]);
}

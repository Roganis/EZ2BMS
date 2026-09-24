// The disc and eyecatch EZ2BMS cuts (crates/ez2bms-media, run through its
// `art` example) against EZ2PORT's own importer (ez2_bmson_import with the
// oracle's test image hook): the same image must give the same .abm bytes.
// Skipped when either binary is not built; CI builds both.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { encodeAbm } from '../src/ez2data/abm';
import { eyecatchExtent, type ArtCrop } from '../src/song/art';
import { serializeBmson } from '../src/io/bmson/serialize';
import { newChart } from '../src/model/defaults';
import { ORACLE, oracle } from './oracle';
import { withTmpDir } from './tmp';

const root = resolve(import.meta.dirname, '../../..');
const exe = process.platform === 'win32' ? 'art.exe' : 'art';
const ART = [
  process.env.EZ2BMS_ART,
  resolve(root, 'target/release/examples', exe),
  resolve(root, 'target/debug/examples', exe),
].find((p): p is string => !!p && existsSync(p));

/** The tests' raw image file, which both binaries read. */
function rgbaFile(w: number, h: number, px: Uint8Array): Uint8Array {
  const b = new Uint8Array(12 + px.length);
  b.set([0x52, 0x47, 0x42, 0x41]);
  new DataView(b.buffer).setUint32(4, w, true);
  new DataView(b.buffer).setUint32(8, h, true);
  b.set(px, 12);
  return b;
}

function ours(input: string, job: object): Uint8Array {
  return new Uint8Array(
    execFileSync(ART!, [], { input: JSON.stringify({ input, ...job }), maxBuffer: 64 << 20 }),
  );
}

/** Byte equality, with the first difference in the message (toEqual is slow on megabytes). */
function same(a: Uint8Array, b: Uint8Array, what: string) {
  if (Buffer.from(a).equals(Buffer.from(b))) return;
  let i = 0;
  while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
  expect.fail(`${what}: ${a.length} vs ${b.length} bytes, first difference at ${i}`);
}

// Up to 1300x700: the disc (256) and the eyecatch (1024x512) are both cut up and down.
const image = fc
  .tuple(fc.integer({ min: 1, max: 1300 }), fc.integer({ min: 1, max: 700 }), fc.integer())
  .map(([w, h, seed]) => {
    const px = new Uint8Array(w * h * 4);
    let s = seed >>> 0 || 1;
    for (let i = 0; i < px.length; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      // Opaque; some pure black so the key lift is exercised.
      px[i] = i % 4 === 3 ? 255 : s >>> 29 === 0 ? 0 : s >>> 24;
    }
    return { w, h, px };
  });

describe.skipIf(!ART || !ORACLE)("song art against EZ2PORT's importer", () => {
  it('cuts the same disc and eyecatch, byte for byte', () => {
    fc.assert(
      fc.property(image, image, (disc, wide) =>
        withTmpDir((dir) => {
          const src = join(dir, 'src');
          mkdirSync(src);
          writeFileSync(join(src, 'jacket.rgba'), rgbaFile(disc.w, disc.h, disc.px));
          writeFileSync(join(src, 'title.rgba'), rgbaFile(wide.w, wide.h, wide.px));
          const data = newChart({ mode: '5k', tier: 'NM', level: 3, title: 'Art' });
          // The importer's order: the disc from eyecatch_image, the eyecatch from title_image.
          data.info.eyecatchImage = 'jacket.rgba';
          data.info.titleImage = 'title.rgba';
          writeFileSync(join(src, 'chart.bmson'), serializeBmson(data));
          const game = join(dir, 'game');
          mkdirSync(join(game, 'system', 'StreetMix'), { recursive: true });
          writeFileSync(
            join(game, 'system', 'StreetMix', 'StreetMix.gds'),
            readFileSync(join(import.meta.dirname, 'fixtures', 'synthetic', 'StreetMix.gds')),
          );
          const songs = join(dir, 'songs');
          mkdirSync(songs);
          const imp = oracle<{ rc: number; key: string; log: string[] }>([
            'bmson-import',
            src,
            game,
            songs,
            'art',
            '--rgba',
          ]);
          const pkg = join(songs, imp.key);
          const theirs = (f: string) => new Uint8Array(readFileSync(join(pkg, f)));
          const discRgb = ours(join(src, 'jacket.rgba'), { kind: 'disc' });
          const eyeRgb = ours(join(src, 'title.rgba'), {
            kind: 'eyecatch',
            mode: 'stretch',
          });
          same(encodeAbm(discRgb, 256, 256), theirs('disc.abm'), 'disc.abm');
          same(encodeAbm(eyeRgb, 1024, 512), theirs('eyecatch.abm'), 'eyecatch.abm');
        }),
      ),
      { numRuns: 20 },
    );
  }, 120_000);
});

describe.skipIf(!ART)('the visible eyecatch', () => {
  it("covers the source eyecatchExtent says (the cropper's outline)", () => {
    fc.assert(
      fc.property(
        image,
        fc.integer({ min: -50, max: 400 }),
        fc.integer({ min: -50, max: 300 }),
        fc.integer({ min: 1, max: 900 }),
        (img, x, y, w) =>
          withTmpDir((dir) => {
            const crop: ArtCrop = { x, y, w, h: Math.max(1, Math.round((w * 3) / 4)) };
            // The extent cut out here (black past the edge) and squeezed whole
            // must be the visible cut of the original.
            const ext = eyecatchExtent(crop);
            const cut = new Uint8Array(ext.w * ext.h * 4);
            for (let yy = 0; yy < ext.h; yy++)
              for (let xx = 0; xx < ext.w; xx++) {
                const [sx, sy] = [ext.x + xx, ext.y + yy];
                const o = (yy * ext.w + xx) * 4;
                cut[o + 3] = 255;
                if (sx < 0 || sy < 0 || sx >= img.w || sy >= img.h) continue;
                cut.set(img.px.subarray((sy * img.w + sx) * 4, (sy * img.w + sx) * 4 + 3), o);
              }
            writeFileSync(join(dir, 'src.rgba'), rgbaFile(img.w, img.h, img.px));
            writeFileSync(join(dir, 'cut.rgba'), rgbaFile(ext.w, ext.h, cut));
            same(
              ours(join(dir, 'src.rgba'), { kind: 'eyecatch', mode: 'visible', crop }),
              ours(join(dir, 'cut.rgba'), { kind: 'eyecatch', mode: 'stretch' }),
              'visible eyecatch',
            );
          }),
      ),
      { numRuns: 15 },
    );
  }, 120_000);
});

describe.skipIf(!ART)('reading real image files', () => {
  it('decodes a BMP the way it is laid out, bottom row last', () => {
    // A 2x2 24-bit BMP, written by hand: red, green / blue, white (top-down).
    const row = (a: number[], b: number[]) => [...a, ...b, 0, 0];
    const pixels = [...row([255, 0, 0], [255, 255, 255]), ...row([0, 0, 255], [0, 255, 0])];
    const bmp = new Uint8Array(54 + pixels.length);
    const v = new DataView(bmp.buffer);
    bmp.set([0x42, 0x4d]);
    v.setUint32(2, bmp.length, true);
    v.setUint32(10, 54, true);
    v.setUint32(14, 40, true);
    v.setInt32(18, 2, true);
    v.setInt32(22, 2, true);
    v.setUint16(26, 1, true);
    v.setUint16(28, 24, true);
    bmp.set(pixels, 54);
    withTmpDir((dir) => {
      writeFileSync(join(dir, 'a.bmp'), bmp);
      // The whole 2x2 image as the eyecatch: its top-left quarter is the first pixel.
      const rgb = ours(join(dir, 'a.bmp'), { kind: 'eyecatch', mode: 'stretch' });
      expect([...rgb.subarray(0, 3)]).toEqual([255, 0, 0]);
      const bottomRight = (511 * 1024 + 1023) * 3;
      expect([...rgb.subarray(bottomRight, bottomRight + 3)]).toEqual([255, 255, 255]);
    });
  });
});

// Title plates EZ2BMS renders (crates/ez2bms-media text.rs, through its
// `plate` example) against EZ2PORT's own renderer (ez2_ttf_render_box and
// ez2_textspec_render through the oracle), from the same fonts: the pixels
// must be identical. Skipped when either binary is not built; the CJK cases
// also when fonts/NotoSansCJK-Bold.ttc has not been fetched. CI does all.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PLATE_TINTS, titlePlate, type CjkForms } from '../src/publish/plate';
import { ORACLE, oracle } from './oracle';
import { withTmpDir } from './tmp';

const root = resolve(import.meta.dirname, '../../..');
const FONTS = join(root, 'fonts');
const ROBOTO = join(FONTS, 'Roboto-Bold.ttf');
const NOTO = join(FONTS, 'NotoSansCJK-Bold.ttc');
const HAVE_CJK = existsSync(NOTO);
const exe = process.platform === 'win32' ? 'plate.exe' : 'plate';
const PLATE = [
  process.env.EZ2BMS_PLATE,
  resolve(root, 'target/release/examples', exe),
  resolve(root, 'target/debug/examples', exe),
].find((p): p is string => !!p && existsSync(p));

const ours = (job: object): Uint8Array =>
  new Uint8Array(execFileSync(PLATE!, [], { input: JSON.stringify(job), maxBuffer: 64 << 20 }));

/** Byte equality, with where they part in the message (toEqual is slow on big arrays). */
function same(a: Uint8Array, b: Uint8Array, what: string) {
  if (Buffer.from(a).equals(Buffer.from(b))) return;
  let i = 0;
  while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
  expect.fail(`${what}: ${a.length} vs ${b.length} bytes, first difference at byte ${i}`);
}

const ALIGN = ['right', 'center', 'left'] as const;

// Titles as they come: capitals, lower case, digits, punctuation, accented
// letters (composite glyphs in Roboto), the odd symbol Roboto lacks.
const latin = fc
  .array(
    fc.oneof(
      { weight: 6, arbitrary: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ') },
      { weight: 3, arbitrary: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz') },
      { weight: 1, arbitrary: fc.constantFrom(..."!?&-+.,:'()[]~*#@/") },
      { weight: 1, arbitrary: fc.constantFrom(...'ÉÈÜÖÅÇÑéèüöåçñßøÆ') },
      { weight: 1, arbitrary: fc.constantFrom('★', '♪', '\u{e000}', 'ｱ') },
    ),
    { minLength: 1, maxLength: 40 },
  )
  .map((cs) => cs.join(''));

const hangul = fc
  .array(
    fc.oneof(
      {
        weight: 4,
        arbitrary: fc.integer({ min: 0xac00, max: 0xd7a3 }).map((c) => String.fromCodePoint(c)),
      },
      { weight: 1, arbitrary: fc.constantFrom(' ', 'A', 'Z', '1', '-', '歌', 'の') },
    ),
    { minLength: 1, maxLength: 16 },
  )
  .map((cs) => cs.join(''));

const lineShape = fc.record({
  w: fc.integer({ min: 32, max: 320 }),
  h: fc.integer({ min: 12, max: 64 }),
  x: fc.integer({ min: -20, max: 340 }),
  baseline: fc.integer({ min: 0, max: 70 }),
  // Halves only: the C side reads the number back through atof/sscanf.
  cap: fc.integer({ min: 8, max: 48 }).map((n) => n / 2),
  align: fc.constantFrom(...ALIGN),
  maxWidth: fc.oneof(fc.constant(0), fc.integer({ min: 10, max: 300 })),
});

describe.skipIf(!ORACLE || !PLATE)("title plates against EZ2PORT's renderer", () => {
  type Shape = {
    w: number;
    h: number;
    x: number;
    baseline: number;
    cap: number;
    align: (typeof ALIGN)[number];
    maxWidth: number;
  };
  function line(font: string, index: number, text: string, s: Shape) {
    return withTmpDir((dir, write) => {
      const out = join(dir, 'out.rgb');
      const r = oracle<{ ok: number }>([
        'ttf',
        index ? `${font}#${index}` : font,
        write('text.txt', text),
        String(s.w),
        String(s.h),
        String(s.x),
        String(s.baseline),
        String(s.cap),
        String(ALIGN.indexOf(s.align)),
        String(s.maxWidth),
        out,
      ]);
      expect(r.ok).toBe(1);
      same(
        ours({ font, index, line: { text, ...s } }),
        new Uint8Array(readFileSync(out)),
        `"${text}" ${JSON.stringify(s)}`,
      );
    });
  }

  it('sets a line exactly as ez2_ttf_render_box does, in Roboto Bold', () => {
    fc.assert(
      fc.property(latin, lineShape, (text, s) => line(ROBOTO, 0, text, s)),
      { numRuns: 150 },
    );
  }, 120_000);

  it.skipIf(!HAVE_CJK)(
    'and in Noto Sans CJK Bold, Korean forms',
    () => {
      fc.assert(
        fc.property(hangul, lineShape, (text, s) => line(NOTO, 1, text, s)),
        { numRuns: 60 },
      );
    },
    120_000,
  );

  // A whole plate, through the manifest path the port draws its song titles
  // with (TEXT.md s3, s7): colours, halos, oblique runs, two lines, scale.
  const colour = fc.integer({ min: 0, max: 0xffffff }).map((n) => n.toString(16).padStart(6, '0'));
  const run = (texts: fc.Arbitrary<string>, faces: string[]) =>
    fc.record({
      text: texts,
      x: fc.integer({ min: 120, max: 256 }),
      baseline: fc.integer({ min: 8, max: 31 }),
      cap: fc.integer({ min: 10, max: 24 }).map((n) => n / 2),
      face: fc.constantFrom(...faces),
      ink: colour,
      glow: fc.option(colour, { nil: undefined }),
      align: fc.constantFrom(...ALIGN),
      maxWidth: fc.oneof(fc.constant(0), fc.integer({ min: 60, max: 240 })),
      oblique: fc.boolean(),
    });
  const safe = (t: fc.Arbitrary<string>) => t.map((s) => s.replace(/["|;]/g, ' '));

  function plate(lines: fc.Arbitrary<unknown>[], cjk: boolean, forms: CjkForms = 'kr') {
    return fc.property(fc.tuple(...lines), fc.integer({ min: 1, max: 3 }), (ls, scale) =>
      withTmpDir((dir, write) => {
        const runs = ls as {
          text: string;
          x: number;
          baseline: number;
          cap: number;
          face: string;
          ink: string;
          glow?: string;
          align: string;
          maxWidth: number;
          oblique: boolean;
        }[];
        write(
          'manifest.ini',
          [
            '[fonts]',
            `bold = ${ROBOTO}`,
            `light = ${ROBOTO}`,
            ...(HAVE_CJK ? [`cjk = ${NOTO}`, `cjkbold = ${NOTO}`] : []),
            '[system/songname/test.abm]',
            'size = 256,32',
            ...runs.map(
              (r) =>
                `line = "${r.text}" | ${r.x},${r.baseline},${r.cap} | ${r.face}${r.oblique ? '+oblique' : ''} | ${r.ink}${r.glow ? '/' + r.glow : ''} | ${r.align} | ${r.maxWidth}`,
            ),
            '',
          ].join('\n'),
        );
        // The forms of the shared ideographs, as a strings file says them.
        write('strings.ini', cjk ? `@cjk = ${forms}\n` : '');
        const out = join(dir, 'out.rgba');
        const r = oracle<{ rendered: number; w: number; h: number }>([
          'textspec',
          dir,
          'system/songname/test.bmp',
          String(scale),
          out,
        ]);
        expect(r.rendered).toBe(1);
        const spec = {
          w: 256,
          h: 32,
          ...(cjk ? { cjk: forms } : {}),
          lines: runs.map((l) => ({ ...l, ...(l.glow ? {} : { glow: undefined }) })),
        };
        same(
          ours({ fonts: FONTS, plate: spec, scale }),
          new Uint8Array(readFileSync(out)),
          JSON.stringify({ spec, scale }),
        );
      }),
    );
  }

  it('renders a whole plate as ez2_textspec_render does', () => {
    const r = run(safe(latin), ['bold']);
    fc.assert(plate([r], false), { numRuns: 40 });
    fc.assert(plate([r, r], false), { numRuns: 30 });
  }, 120_000);

  it.skipIf(!HAVE_CJK)(
    'with Korean lines set in the CJK face',
    () => {
      const r = run(safe(fc.oneof(hangul, latin)), ['bold', 'cjkbold']);
      fc.assert(plate([r, r], true), { numRuns: 40 });
    },
    120_000,
  );

  it("draws titlePlate's layouts - the shipped plates' (TEXT.md s7) - identically", () => {
    for (const spec of [
      titlePlate('NEON PARADE'),
      titlePlate('Neon Parade', '- Extended Mix -', PLATE_TINTS[3]),
      titlePlate('A TITLE FAR TOO LONG FOR THE ROOM THE PLATE HAS', '', PLATE_TINTS[1]),
      ...(HAVE_CJK ? [titlePlate('네온 퍼레이드', 'ネオン')] : []),
    ])
      fc.assert(
        plate(
          spec.lines.map((l) => fc.constant({ oblique: false, ...l })),
          !!spec.cjk && spec.lines.some((l) => [...l.text].some((c) => c.codePointAt(0)! > 0x7f)),
          spec.cjk,
        ),
        { numRuns: 1 },
      );
  });
});

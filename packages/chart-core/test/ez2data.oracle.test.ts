import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeAbm, encodeAbm, fnv1a64Hex } from '../src/ez2data/abm';
import { ez2Decrypt, ez2Encrypt } from '../src/ez2data/crypt';
import { parseGds } from '../src/ez2data/gds';
import { dsLevel, dsPan } from '../src/ez2data/mixparam';
import { parsePvi } from '../src/ez2data/pvi';
import { writeEzff, nameField } from '../src/io/ez/ezff';
import { parseChartName } from '../src/modes/filenames';
import { allModes, laneTracks } from '../src/modes/registry';
import { ORACLE, oracle } from './oracle';
import { withTmpDir } from './tmp';

const fixture = (p: string) => resolve(import.meta.dirname, 'fixtures', p);
const bytes = fc.uint8Array;

/** Build a synthetic .abm of any depth by hand: a BMP with the XOR-masked header. */
function synthAbm(opts: {
  version: number;
  w: number;
  h: number;
  bpp: 8 | 16 | 24 | 32;
  pixels: Uint8Array;
  palette?: Uint8Array;
  topDown?: boolean;
}): Uint8Array {
  const XOR = [
    [0x56fe, 0x0831, 0x1019, 0x1120],
    [0x45ae, 0x9af1, 0x1d1b, 0x67be],
    [0x85be, 0x96ec, 0xfdeb, 0x67ae],
    [0x95ab, 0x45bb, 0xae12, 0x78ef],
    [0x23ff, 0xbdc9, 0x1f01, 0xa97f],
    [0x109a, 0xcfa1, 0x51ae, 0xb18f],
  ][opts.version - 1]!;
  const pal = opts.palette ?? new Uint8Array();
  const off = 0x36 + pal.length;
  const out = new Uint8Array(off + opts.pixels.length);
  const dv = new DataView(out.buffer);
  out[0] = 0x41;
  out[1] = 0x57;
  dv.setUint32(0x0a, (off ^ XOR[0]!) >>> 0, true);
  dv.setUint32(0x0e, 40, true);
  dv.setUint32(0x12, (opts.w ^ XOR[1]!) >>> 0, true);
  dv.setUint32(0x16, ((opts.topDown ? -opts.h : opts.h) ^ XOR[2]!) >>> 0, true);
  dv.setUint32(0x1c, (opts.bpp ^ XOR[3]!) >>> 0, true);
  out.set(pal, 0x36);
  out.set(opts.pixels, off);
  return out;
}

describe.skipIf(!ORACLE)('EZ2 data parsers against EZ2PORT (oracle)', () => {
  it('.gds: same slots and lanes', () => {
    const text = readFileSync(fixture('synthetic/StreetMix.gds'), 'latin1');
    const ours = parseGds(text);
    const theirs = oracle<{
      slot_count: number;
      slots: { declared: number; lanes: { key: number; key2: number; track: number }[] }[];
    }>(['gds', fixture('synthetic/StreetMix.gds')]);
    expect(ours.slotCount).toBe(theirs.slot_count);
    expect(ours.slots.map((s) => ({ declared: s.declared, lanes: s.lanes }))).toEqual(theirs.slots);
  });

  it('.pvi: same tracks, target bars and note art', () => {
    const text = readFileSync(fixture('synthetic/STYLE_StreetMix0_0.pvi'), 'latin1');
    const ours = parsePvi(text);
    const theirs = oracle<{
      track_count: number;
      tracks: Record<string, unknown>[];
      target: {
        enable: number;
        bars: { x: number; y: number; w: number; h: number; tex: string }[];
      };
      unknown_sections: number;
    }>(['pvi', fixture('synthetic/STYLE_StreetMix0_0.pvi')]);
    expect(ours.trackCount).toBe(theirs.track_count);
    expect(ours.unknownSections).toBe(theirs.unknown_sections);
    expect(ours.target.bars).toEqual(theirs.target.bars);
    ours.tracks.forEach((t, i) => {
      const o = theirs.tracks[i]!;
      const c = (x: { r: number; g: number; b: number; a: number }) => [x.r, x.g, x.b, x.a];
      expect({
        present: t.present ? 1 : 0,
        enable: t.enable,
        x: t.x,
        y: t.y,
        w: t.w,
        h: t.h,
        bk1: c(t.bk1),
        bk2: c(t.bk2),
        left_line_w: t.leftLineW,
        right_line_w: t.rightLineW,
        left_line: c(t.leftLine),
        right_line: c(t.rightLine),
        press_x: t.pressX,
        press_y: t.pressY,
        press_tex: t.pressTex,
        bar_tex: t.barTex,
        bar_max_h: t.barMaxH,
        bar_grow: t.barGrow,
        bar_shrink: t.barShrink,
        note_tex: t.noteTex,
      }).toEqual(o);
    });
  });

  it('.abm: decodes every depth and header variant like the engine', () => {
    const arb = fc
      .record({
        version: fc.integer({ min: 1, max: 6 }),
        w: fc.integer({ min: 1, max: 9 }),
        h: fc.integer({ min: 1, max: 7 }),
        bpp: fc.constantFrom<8 | 16 | 24 | 32>(8, 16, 24, 32),
        topDown: fc.boolean(),
        seed: bytes({ minLength: 4096, maxLength: 4096 }),
      })
      .map((o) => {
        const row = Math.floor((o.w * o.bpp + 31) / 32) * 4;
        const pixels = o.seed.slice(0, row * o.h);
        const palette = o.bpp === 8 ? o.seed.slice(2048, 2048 + 256 * 4) : undefined;
        return synthAbm({ ...o, pixels, ...(palette ? { palette } : {}) });
      });
    fc.assert(
      fc.property(arb, (abm) =>
        withTmpDir((_d, write) => {
          const path = write('x.abm', abm);
          const o = oracle<{
            width: number;
            height: number;
            bpp: number;
            version: number;
            rgba_fnv1a64: string;
          }>(['abm', path]);
          const ours = decodeAbm(abm);
          expect([ours.width, ours.height, ours.bpp, ours.version]).toEqual([
            o.width,
            o.height,
            o.bpp,
            o.version,
          ]);
          expect(fnv1a64Hex(ours.rgba)).toBe(o.rgba_fnv1a64);
        }),
      ),
      { numRuns: 60 },
    );
  });

  it('.abm: our encoder writes what the engine encoder writes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 13 }),
        fc.integer({ min: 1, max: 9 }),
        bytes({ minLength: 13 * 9 * 3, maxLength: 13 * 9 * 3 }),
        (w, h, seed) =>
          withTmpDir((_d, write) => {
            const rgb = seed.slice(0, w * h * 3);
            const rgbPath = write('in.rgb', rgb);
            const out = resolve(rgbPath, '..', 'o.abm');
            oracle(['abm-write', rgbPath, String(w), String(h), out]);
            const theirs = new Uint8Array(readFileSync(out));
            expect(encodeAbm(rgb, w, h)).toEqual(theirs);
            const back = decodeAbm(theirs);
            for (let i = 0; i < w * h; i++) {
              expect([back.rgba[i * 4], back.rgba[i * 4 + 1], back.rgba[i * 4 + 2]]).toEqual([
                rgb[i * 3],
                rgb[i * 3 + 1],
                rgb[i * 3 + 2],
              ]);
            }
          }),
      ),
      { numRuns: 25 },
    );
  });

  it('cipher: identical bytes to ez2_encrypt/ez2_decrypt for any table', () => {
    fc.assert(
      fc.property(
        bytes({ minLength: 512, maxLength: 512 }),
        bytes({ maxLength: 700 }),
        (table, data) =>
          withTmpDir((dir, write) => {
            const t = write('t.bin', table);
            const p = write('p.bin', data);
            oracle(['crypt', 'enc', t, p, `${dir}/c.bin`]);
            const theirs = new Uint8Array(readFileSync(`${dir}/c.bin`));
            const ours = ez2Encrypt(data, table);
            expect(ours).toEqual(theirs);
            expect(ez2Decrypt(ours, table)).toEqual(data);
          }),
      ),
      { numRuns: 40 },
    );
  });

  it('velocity/pan: the original integer arithmetic', () => {
    const lines: string[] = [];
    const want: number[] = [];
    for (const m of [0, 64, 127]) {
      for (const a of [0, 100, 127]) {
        for (const b of [1, 127]) {
          for (let v = 0; v <= 127; v += 7) {
            lines.push(`level ${m} ${a} ${b} ${v}`);
            want.push(dsLevel(m, a, b, v));
          }
        }
      }
    }
    for (let pp = 0; pp <= 127; pp += 9) {
      for (let p = 0; p <= 127; p += 5) {
        lines.push(`pan ${pp} ${p}`);
        want.push(dsPan(pp, p));
      }
    }
    expect(oracle<number[]>(['mixparam'], lines.join('\n') + '\n')).toEqual(want);
  });

  it('chart names: the same mode, song and tier as ez2_chart_id_parse', () => {
    const names = [
      'streetmix1p-foo.ez',
      'StreetMix1p-foo-hd.ez',
      '7streetmix1p-kamui-shd.ez',
      '5RadioMix1p-10asterios2-hf.ez',
      'clubmix2p-babydance-ex.ez',
      'd/sub/spacemix1p-a-b-hd.ez',
      'catch1p-x.ez',
    ];
    for (const n of names) {
      const o = oracle<{ ok: boolean; players: number; song: string; stem: string; tier: number }>([
        'chart-id',
        n,
      ]);
      const ours = parseChartName(n);
      expect(ours?.players).toBe(o.players);
      expect(ours?.song).toBe(o.song);
      expect(ours?.stem).toBe(o.stem);
      const tierIndex = ours?.tier ? ['NM', 'HD', 'SHD', 'EX'].indexOf(ours.tier) : 4;
      expect(tierIndex).toBe(o.tier);
    }
  });

  it("mode lane sets match the engine's built-in table (ez2/mode.c)", () => {
    withTmpDir((_d, write) => {
      const tracks = Array.from({ length: 64 }, () => ({
        name: nameField(''),
        ticks: 0,
        records: [],
      }));
      const ez = write(
        'c.ez',
        writeEzff({
          version: 8,
          name: nameField(''),
          name2: new Uint8Array(),
          ticksPerMeasure: 192,
          bpm: 120,
          bpm2: 120,
          totalTicks: 48,
          tracks,
        }),
      );
      for (const m of allModes()) {
        const o = oracle<{ lanes: number[] }>(['judge-sim', ez, '', m.portName, '0', '0', '1']);
        expect(
          [...laneTracks(m)].sort((a, b) => a - b),
          m.portName,
        ).toEqual([...o.lanes].sort((a, b) => a - b));
      }
    });
  });
});

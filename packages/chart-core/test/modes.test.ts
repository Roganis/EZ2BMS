import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KEYTABLE_SIZE, ez2Decrypt, ez2Encrypt, looksPlaintext } from '../src/ez2data/crypt';
import { parseGds } from '../src/ez2data/gds';
import { decodeCp949 } from '../src/ez2data/initext';
import { KeyTableError, keyTableFromExe, peVaToOffset } from '../src/ez2data/keytable';
import { judgeLineY, parsePvi } from '../src/ez2data/pvi';
import {
  chartBaseName,
  deriveSongKey,
  isValidSongKey,
  parseChartName,
} from '../src/modes/filenames';
import { columnsFor } from '../src/modes/layout';
import { allModes, columnsFromGds, diffWithGds, modeDef } from '../src/modes/registry';

const fixture = (p: string) => join(import.meta.dirname, 'fixtures', p);

describe('mode registry', () => {
  it('every mode has distinct lanes and distinct tracks', () => {
    for (const m of allModes()) {
      const xs = m.columns.map((c) => c.x);
      const tracks = m.columns.map((c) => c.track);
      expect(new Set(xs).size, m.id).toBe(xs.length);
      expect(new Set(tracks).size, m.id).toBe(tracks.length);
      expect(
        tracks.every((t) => t !== 0 && t !== 21),
        m.id,
      ).toBe(true); // control, lights
    }
  });

  it('puts 2P keys on different tracks in 10K and 14K (the Club gotcha)', () => {
    const t = (id: '10k' | '14k', x: number) => modeDef(id).columns.find((c) => c.x === x)!.track;
    expect([21, 22, 23, 24, 25].map((x) => t('10k', x))).toEqual([12, 13, 14, 15, 16]);
    expect([21, 22, 23, 24, 25].map((x) => t('14k', x))).toEqual([14, 15, 16, 17, 18]);
    expect([31, 32, 33, 34].map((x) => t('14k', x))).toEqual([8, 9, 12, 13]);
  });

  it('labels keys by their number in the mode', () => {
    expect(
      modeDef('10k')
        .columns.map((c) => c.short)
        .join(' '),
    ).toBe('TT 1 2 3 4 5 PD 6 7 8 9 10 TT');
    expect(
      modeDef('14k')
        .columns.map((c) => c.short)
        .join(' '),
    ).toBe('TT 1 2 3 4 5 6 7 8 9 10 11 12 13 14 TT');
    expect(
      modeDef('7k')
        .columns.map((c) => c.short)
        .join(' '),
    ).toBe('TT 1 2 3 4 5 PD 6 7');
  });

  it('mirrors P2', () => {
    const m = modeDef('5k');
    expect(columnsFor(m, 'P2').map((c) => c.x)).toEqual([10, 15, 14, 13, 12, 11, 1]);
    expect(columnsFor(m, 'P1')).toBe(m.columns);
  });

  it('reads lane order and tracks from a .gds', () => {
    const gds = parseGds(readFileSync(fixture('synthetic/StreetMix.gds'), 'latin1'));
    expect(columnsFromGds('5k', gds).columns.map((c) => [c.x, c.track])).toEqual(
      modeDef('5k').columns.map((c) => [c.x, c.track]),
    );
    expect(diffWithGds('5k', gds)).toEqual([]);
    expect(diffWithGds('7k', gds)).toHaveLength(1);
  });
});

describe('.pvi reading', () => {
  it('reads tracks, blocks, quoted lists, comments and the judge line', () => {
    const p = parsePvi(decodeCp949(readFileSync(fixture('synthetic/STYLE_StreetMix0_0.pvi'))));
    expect(p.trackCount).toBe(7);
    expect(p.tracks[0]).toMatchObject({ x: 40, w: 34, h: 375, leftLineW: 1, rightLineW: 2 });
    expect(p.tracks[0]!.rightLine).toEqual({ r: 90, g: 90, b: 90, a: 255 });
    expect(p.tracks[0]!.noteTex).toEqual(['note\\scratch_', 'note2\\scratch_']);
    expect(p.tracks[1]!.noteTex).toEqual(['note\\white_']);
    expect(p.target.bars).toHaveLength(2);
    expect(judgeLineY(p)).toBe(366); // 363 + 6/2, the port's 5K judge line
    expect(p.judgment.fail).toBe('fail.str');
    expect(p.judgment.miss).toBe('miss.str');
    expect(p.unknownSections).toBe(1);
  });

  it('opens a block only when its brace is on the key line, as the engine does', () => {
    const p = parsePvi('[General]\n[Track1]\nLeftBoader =\n{\nLineWidth = 3\n}\n');
    expect(p.tracks[0]!.leftLineW).toBe(0);
  });

  it('refuses text without [General]', () => {
    expect(() => parsePvi('[Track1]\nEnable=1\n')).toThrow(/General/);
  });
});

describe('file names and song keys', () => {
  it('builds and parses chart names', () => {
    expect(chartBaseName('7k', 'mysong', 'SHD')).toBe('7streetmix1p-mysong-shd');
    expect(chartBaseName('5k', 'mysong', 'NM')).toBe('streetmix1p-mysong');
    expect(parseChartName('x/7streetmix1p-mysong-shd.ez')).toMatchObject({
      mode: '7k',
      song: 'mysong-shd',
      stem: 'mysong',
      tier: 'SHD',
    });
    expect(parseChartName('radiomix1p-abc-r1.ez')?.tier).toBeUndefined();
  });

  it('derives keys like the port and validates them', () => {
    expect(deriveSongKey('Dr.Yonda [Funk Rock] RED HOT')).toBe('dryondafunkrock');
    expect(isValidSongKey('redhot')).toBe(true);
    expect(isValidSongKey('red-hot')).toBe(false);
    expect(isValidSongKey('a'.repeat(16))).toBe(false);
  });
});

/** A minimal PE32 with one section holding a 2048-byte region at a chosen VA. */
function synthPe(regionFill: (i: number) => number): { exe: Uint8Array; va: number } {
  const pe = 0x80;
  const secOff = pe + 24 + 224;
  const raw = 0x400;
  const exe = new Uint8Array(raw + 0x1000);
  const dv = new DataView(exe.buffer);
  exe[0] = 0x4d;
  exe[1] = 0x5a;
  dv.setUint32(0x3c, pe, true);
  exe.set([0x50, 0x45, 0, 0], pe);
  dv.setUint16(pe + 6, 1, true); // one section
  dv.setUint16(pe + 20, 224, true); // optional header size
  dv.setUint16(pe + 24, 0x10b, true); // PE32
  dv.setUint32(pe + 24 + 28, 0x400000, true); // image base
  dv.setUint32(secOff + 12, 0x1000, true); // virtual address
  dv.setUint32(secOff + 16, 0x1000, true); // raw size
  dv.setUint32(secOff + 20, raw, true); // raw pointer
  for (let i = 0; i < 2048; i++) exe[raw + 0x100 + i] = regionFill(i);
  return { exe, va: 0x400000 + 0x1000 + 0x100 };
}

describe('key tables and the cipher', () => {
  it('maps a VA through the section table and refuses a wrong table', () => {
    const { exe, va } = synthPe((i) => (i % 4 === 0 ? (i / 4) & 0xff : 0xee));
    expect(peVaToOffset(exe, va, 2048)).toBe(0x500);
    // Our synthetic region is not the game's table, so the digest check refuses it.
    expect(() => keyTableFromExe(exe, 'ez')).toThrow(KeyTableError);
    expect(() => peVaToOffset(new Uint8Array(64), va, 1)).toThrow(/MZ/);
  });

  it('round-trips and recognises plaintext', () => {
    const table = Uint8Array.from({ length: KEYTABLE_SIZE }, (_, i) => (i * 131) & 0xff);
    const text = new TextEncoder().encode('1 1 kick.wav\r\n2 1 snare.wav\r\n');
    const enc = ez2Encrypt(text, table);
    expect(looksPlaintext('ezi', text)).toBe(true);
    expect(ez2Decrypt(enc, table)).toEqual(text);
    expect(looksPlaintext('ez', new TextEncoder().encode('EZFF'))).toBe(true);
  });
});

// Local-only: point EZ2_ROOT at a game data folder (and EZ2_EXE at the unpacked
// executable) to check the bundled tables and the key extraction against a real
// install. Nothing is read in CI and nothing is ever copied into the repository.
const ROOT = process.env.EZ2_ROOT;
const EXE = process.env.EZ2_EXE;
describe.skipIf(!ROOT)('against a real game install (EZ2_ROOT)', () => {
  it('bundled lane tables agree with every mode .gds', () => {
    const sys = join(ROOT!, 'system');
    const dirs = readdirSync(sys);
    for (const m of allModes().filter(
      (m) => m.portPlayable && m.id !== '5k-only' && m.id !== 'scratch',
    )) {
      const dir = dirs.find((d) => d.toLowerCase() === m.portName.toLowerCase());
      if (!dir) continue;
      const file = readdirSync(join(sys, dir)).find((f) => f.toLowerCase().endsWith('.gds'));
      if (!file) continue;
      const gds = parseGds(decodeCp949(readFileSync(join(sys, dir, file))));
      expect(diffWithGds(m.id, gds), m.portName).toEqual([]);
    }
  });
  it.skipIf(!EXE || !existsSync(EXE ?? ''))(
    'extracts all three key tables from the executable',
    () => {
      const exe = new Uint8Array(readFileSync(EXE!));
      for (const k of ['ez', 'ezi', 'ini'] as const)
        expect(keyTableFromExe(exe, k)).toHaveLength(512);
    },
  );
});

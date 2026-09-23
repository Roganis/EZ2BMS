// The keysound index (.ezi) and a chart's settings (.ini) as EZ2PORT reads
// them (ez2/ezi.c, ez2/songini.c): random files through both readers must
// agree on every value, the port's quirks included. Legacy note names are
// EZ2BMS's deviation and are tested on their own.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ez2Decrypt, looksPlaintext } from '../src/ez2data/crypt';
import { atof, strtolInt } from '../src/ez2data/initext';
import { keyTableFromExe } from '../src/ez2data/keytable';
import { deltasOfIni, parseSongIni, songIniFrom } from '../src/engine/songini';
import { EZ_NOTE, readEzff } from '../src/io/ez/ezff';
import { EziError, eziResolve, eziTable, legacyNoteIndex, parseEzi } from '../src/io/ez/ezi';
import { ORACLE, oracle } from './oracle';
import { withTmpDir } from './tmp';

const enc = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0) & 0xff));

describe('.ezi', () => {
  it('reads notes, modes, second names and comments as the port does', () => {
    const e = parseEzi(
      enc('; comment\r\n1 1 kick.wav\r\n2 2 a.wav b.wav\r\n3 7 c.wav\r\n1 1 kick2.wav\r\n9'),
    );
    // The trailing '9' has no mode: the parse ends there.
    expect(e.entries.map((x) => [x.note, x.mode, x.name, x.name2])).toEqual([
      [1, 1, 'kick.wav', undefined],
      [2, 2, 'a.wav', 'b.wav'],
      [3, 7, 'c.wav', undefined],
      [1, 1, 'kick2.wav', undefined],
    ]);
    expect(eziTable(e).get(1)!.name).toBe('kick2.wav');
  });

  it('skips a comment by two tokens, not by line, as the original does', () => {
    // ';' and 'a' are the skipped pair; 'long' then reads as note 0 with
    // mode 0 ('comment') and takes '1' as its file, and the line after is
    // out of step: '1' 'kick.wav' is a note with no file, which ends it.
    const e = parseEzi(enc('; a long comment\n1 1 kick.wav\n'));
    expect(e.entries.map((x) => [x.note, x.mode, x.name])).toEqual([[0, 0, '1']]);
  });

  it('refuses a note outside the table, and an empty file', () => {
    expect(() => parseEzi(enc('70000 1 a.wav'))).toThrow(EziError);
    expect(() => parseEzi(enc('-1 1 a.wav'))).toThrow(EziError);
    expect(() => parseEzi(enc('; nothing\n'))).toThrow(/no keysounds/);
  });

  it('reads legacy note names as MIDI keys only when asked', () => {
    expect(legacyNoteIndex('C0')).toBe(0);
    expect(legacyNoteIndex('C#0')).toBe(1);
    expect(legacyNoteIndex('B0')).toBe(11);
    expect(legacyNoteIndex('a#2')).toBe(34);
    expect(legacyNoteIndex('H1')).toBeUndefined();
    const text = enc('C0 1 a.wav\nC#0 1 b.wav\nD1 1 c.wav\n');
    // The port: every name is atol()'d to 0, the last line wins.
    expect(eziTable(parseEzi(text)).size).toBe(1);
    const legacy = parseEzi(text, { legacyNames: true });
    expect(legacy.legacy).toBe(3);
    expect(legacy.entries.map((x) => [x.note, x.noteName])).toEqual([
      [0, 'C0'],
      [1, 'C#0'],
      [14, 'D1'],
    ]);
  });

  it('points a name at the .ssf on disk, relative paths included', () => {
    expect(eziResolve('kick.wav')).toBe('kick.ssf');
    expect(eziResolve('KICK.WAV')).toBe('KICK.ssf');
    expect(eziResolve('..\\..\\sound\\stay\\p_MR.wav')).toBe('..\\..\\sound\\stay\\p_MR.ssf');
    expect(eziResolve('a.ogg')).toBe('a.ssf');
    expect(eziResolve('noext')).toBe('noext');
    expect(eziResolve('a.flac')).toBe('a.flac');
  });

  it('decodes names as CP949', () => {
    // 가.wav in CP949.
    const e = parseEzi(new Uint8Array([0x31, 0x20, 0x31, 0x20, 0xb0, 0xa1, ...enc('.wav')]));
    expect(e.entries[0]!.name).toBe('가.wav');
  });
});

describe('.ini', () => {
  it('reads sections and keys in any case, quotes stripped, COOL mirrored into KOOL', () => {
    const ini = parseSongIni(
      enc(
        '[general]\r\nLEVEL = 12\r\n"MeasureScale"="1.5"\r\n[JudgmentDelta]\r\nkool=9\r\nCool=27\r\n' +
          'Good=53\r\nMiss=73\r\n[GaugeUpDownRate]\r\nCool=0.25\r\nGood=0.1\r\nMiss=-2\r\nFail=-5\r\n',
      ),
    );
    expect(ini).toMatchObject({ level: 12, kool: 9, cool: 27, good: 53, miss: 73 });
    expect(ini.measureScale).toBe(Math.fround(1.5));
    expect(ini.gaugeKool).toBe(Math.fround(0.25));
    expect([ini.hadGeneral, ini.hadJudgment, ini.hadGauge]).toEqual([true, true, true]);
  });

  it('keeps the defaults for what is missing', () => {
    const ini = parseSongIni(enc('[General]\nLevel=3\n'));
    expect(ini).toMatchObject({ level: 3, kool: 6, cool: 24, good: 36, miss: 72 });
    expect(ini.hadJudgment).toBe(false);
    expect(parseSongIni(new Uint8Array()).level).toBe(99);
  });

  it('gives back the deltas a publish writes', () => {
    const j = { KOOL: 9, COOL: 27, GOOD: 53, MISS: 73 };
    const l = { COOL: 0.2, GOOD: 0.1, MISS: -1.8, FAIL: -4.8 };
    const d = deltasOfIni(songIniFrom(7, j, l));
    expect(d.judgement).toEqual(j);
    expect(songIniFrom(7, d.judgement, d.life)).toEqual(songIniFrom(7, j, l));
  });

  it('reads numbers as the C library does', () => {
    expect(strtolInt('  -12x')).toBe(-12);
    expect(strtolInt('4294967296')).toBe(0); // (int) of a long
    expect(strtolInt('99999999999999999999')).toBe(-1); // LONG_MAX, then (int)
    expect(atof('1.5e1x')).toBe(15);
    expect(atof('.5')).toBe(0.5);
    expect(atof('0x1.8p1')).toBe(3);
    expect(atof('-inf')).toBe(-Infinity);
    expect(atof('abc')).toBe(0);
  });
});

// ---- parity with the port's own readers -------------------------------------------

const word = fc.stringMatching(/^[A-Za-z0-9_.\-\\]{1,12}$/);
const ws = fc.constantFrom(' ', '  ', '\t', '\r\n', '\n', ' \v ', '\f');
const eziLine = fc.oneof(
  {
    weight: 6,
    arbitrary: fc.tuple(
      fc.integer({ min: 0, max: 3000 }),
      fc.constantFrom(1, 1, 2, 0, 7),
      word,
      word,
    ),
  },
  { weight: 1, arbitrary: fc.tuple(fc.constantFrom(-1, 65536, 70000), fc.constant(1), word, word) },
  {
    weight: 1,
    arbitrary: fc.tuple(
      fc.constantFrom(';', ';;', ';x', 'C#0', '+5', '0012'),
      fc.constant(1),
      word,
      word,
    ),
  },
);
const eziText = fc
  .tuple(fc.array(fc.tuple(eziLine, ws, ws, ws), { minLength: 0, maxLength: 14 }), fc.boolean())
  .map(([lines, cut]) => {
    let s = lines
      .map(([[n, m, a, b], w1, w2, w3]) => `${n}${w1}${m}${w2}${a}${m === 2 ? ` ${b}` : ''}${w3}`)
      .join('');
    if (cut && s.length > 3) s = s.slice(0, s.length - 3);
    return s;
  });

const iniSection = fc.constantFrom(
  '[General]',
  '[general]',
  '[ JudgmentDelta ]',
  '[GaugeUpDownRate]',
  '[GAUGEUPDOWNRATE]',
  '[Other]',
  '[General',
  '',
);
const iniKey = fc.constantFrom(
  'Level',
  'level',
  'MeasureScale',
  '"Kool"',
  'Cool',
  'GOOD',
  'Miss',
  'Fail',
  'x',
);
const iniVal = fc.oneof(
  fc.integer({ min: -200, max: 200 }).map(String),
  fc.double({ min: -10, max: 10, noNaN: true }).map((d) => d.toPrecision(5)),
  fc.constantFrom('"12"', ' 7 ', '1e2', '+3', '0x10', '0x1.8p2', '.5', 'abc', '', '4294967296'),
);
const iniText = fc
  .array(
    fc.oneof(
      iniSection,
      fc.tuple(iniKey, iniVal).map(([k, v]) => `${k}=${v}`),
      fc.constantFrom('; comment', '   ', 'no equals', `Level=${'9'.repeat(3)}${' '.repeat(520)}x`),
    ),
    { maxLength: 16 },
  )
  .chain((lines) => fc.constantFrom('\n', '\r\n').map((eol) => lines.join(eol)));

describe.skipIf(!ORACLE)('.ezi and .ini against EZ2PORT (oracle)', () => {
  it('reads every .ezi as ez2_ezi_parse does', () => {
    withTmpDir((dir, write) => {
      fc.assert(
        fc.property(eziText, (text) => {
          const path = write('a.ezi', enc(text));
          let theirs:
            { entries: { note: number; mode: number; name: string; name2?: string }[] } | 'error';
          try {
            theirs = oracle(['ezi', path]);
          } catch {
            theirs = 'error';
          }
          let ours: typeof theirs;
          try {
            ours = {
              entries: parseEzi(enc(text)).entries.map((e) => ({
                note: e.note,
                mode: e.mode,
                name: e.name,
                ...(e.name2 !== undefined ? { name2: e.name2 } : {}),
              })),
            };
          } catch {
            ours = 'error';
          }
          expect(ours).toEqual(theirs);
        }),
        { numRuns: 150, seed: 5021 },
      );
    });
  });

  it('reads every chart .ini as ez2_song_ini_parse does', () => {
    withTmpDir((dir, write) => {
      fc.assert(
        fc.property(iniText, (text) => {
          const path = write('a.ini', enc(text));
          const t = oracle<{ raw: Record<string, number> }>(['songini', path]).raw;
          const o = parseSongIni(enc(text));
          const f = Math.fround;
          expect({
            level: o.level,
            measure_scale: o.measureScale,
            kool: o.kool,
            cool: o.cool,
            good: o.good,
            miss: o.miss,
            gauge_kool: o.gaugeKool,
            gauge_cool: o.gaugeCool,
            gauge_good: o.gaugeGood,
            gauge_miss: o.gaugeMiss,
            gauge_fail: o.gaugeFail,
            had_general: +o.hadGeneral,
            had_judgment: +o.hadJudgment,
            had_gauge: +o.hadGauge,
          }).toEqual({
            ...t,
            measure_scale: f(t.measure_scale!),
            gauge_kool: f(t.gauge_kool!),
            gauge_cool: f(t.gauge_cool!),
            gauge_good: f(t.gauge_good!),
            gauge_miss: f(t.gauge_miss!),
            gauge_fail: f(t.gauge_fail!),
          });
        }),
        { numRuns: 150, seed: 5022 },
      );
    });
  });
});

// ---- a real install (EZ2_ROOT + EZ2_EXE; skipped without them) -----------------------

const ROOT = process.env.EZ2_ROOT;
const EXE = process.env.EZ2_EXE;

describe.skipIf(!ROOT || !EXE || !existsSync(join(ROOT ?? '', 'sound')) || !existsSync(EXE ?? ''))(
  'a real install (EZ2_ROOT, EZ2_EXE)',
  () => {
    it("every chart's keysounds are listed, and legacy note names are what makes that so", () => {
      const exe = new Uint8Array(readFileSync(EXE!));
      const tables = { ez: keyTableFromExe(exe, 'ez'), ezi: keyTableFromExe(exe, 'ezi') };
      const plain = (kind: 'ez' | 'ezi', b: Uint8Array) =>
        looksPlaintext(kind, b) ? b : ez2Decrypt(b, tables[kind]);
      const sound = join(ROOT!, 'sound');
      let charts = 0;
      let keys = 0;
      let unlisted = 0;
      let legacyFiles = 0;
      for (const song of readdirSync(sound)) {
        const dir = join(sound, song);
        if (!statSync(dir).isDirectory()) continue;
        const files = readdirSync(dir);
        for (const f of files.filter((n) => /\.ez$/i.test(n))) {
          const eziName = files.find(
            (n) => n.toLowerCase() === `${f.slice(0, -3)}.ezi`.toLowerCase(),
          );
          if (!eziName) continue;
          const chart = readEzff(plain('ez', new Uint8Array(readFileSync(join(dir, f)))));
          const eziBytes = plain('ezi', new Uint8Array(readFileSync(join(dir, eziName))));
          const ours = eziTable(parseEzi(eziBytes, { legacyNames: true }));
          const port = eziTable(parseEzi(eziBytes));
          const used = new Set<number>();
          for (const t of chart.tracks)
            for (const r of t.records) if (r.type === EZ_NOTE) used.add(r.key!);
          charts++;
          keys += used.size;
          const missOurs = [...used].filter((k) => !ours.has(k)).length;
          const missPort = [...used].filter((k) => !port.has(k)).length;
          unlisted += missOurs;
          if (ours.size !== port.size) {
            legacyFiles++;
            // Reading the names as notes must find more of the chart's keysounds, never fewer.
            expect(missOurs, `${song}/${eziName}`).toBeLessThanOrEqual(missPort);
          }
        }
      }
      console.log(
        `${charts} charts, ${keys} keysounds used, ${unlisted} not listed; ${legacyFiles} .ezi with legacy note names`,
      );
      expect(charts).toBeGreaterThan(0);
      // The port's own docs put dangling references at about 0.1 %.
      expect(unlisted / Math.max(1, keys)).toBeLessThan(0.01);
    });
  },
);

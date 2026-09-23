// BMS import (io/bms): the encoding, the commands and their control flow, and
// the chart - its timing checked against the BMS memo's own arithmetic, since
// EZ2PORT reads no BMS to compare with. Fixtures are written here.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  convertBms,
  EZ2_BME_MAP,
  guessMode,
  keysInOrderMap,
  measureRational,
} from '../src/io/bms/convert';
import { decodeAs, decodeBms } from '../src/io/bms/decode';
import { bmsIdNumber, parseBms } from '../src/io/bms/parse';
import { importBmsSong } from '../src/io/bms/song';
import { serializeBmson } from '../src/io/bmson/serialize';
import { parseBmson } from '../src/io/bmson/parse';
import type { ChartData } from '../src/model/types';

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );
// テスト曲 in Shift-JIS; 테스트 in EUC-KR (checked below by decoding them).
const SJIS = [0x83, 0x65, 0x83, 0x58, 0x83, 0x67, 0x8b, 0xc8];
const EUCKR = [0xc5, 0xd7, 0xbd, 0xba, 0xc6, 0xae];

describe('encoding', () => {
  it('knows the fixture bytes', () => {
    expect(decodeAs(new Uint8Array(SJIS), 'shift_jis')).toBe('テスト曲');
    expect(decodeAs(new Uint8Array(EUCKR), 'euc-kr')).toBe('테스트');
  });

  it('reads Shift-JIS, EUC-KR, UTF-8 and a BOM', () => {
    const jp = decodeBms(
      bytes('#TITLE ', SJIS, '\r\n#WAV01 ', SJIS, '.wav\r\n#ARTIST ', SJIS, '\r\n'),
    );
    expect(jp.encoding).toBe('shift_jis');
    expect(jp.text).toContain('#TITLE テスト曲');
    const kr = decodeBms(
      bytes('#TITLE ', EUCKR, '\r\n#WAV01 ', EUCKR, '.wav\r\n#GENRE ', EUCKR, '\r\n'),
    );
    expect(kr.encoding).toBe('euc-kr');
    expect(kr.text).toContain('#TITLE 테스트');
    expect(kr.sure).toBe(true);
    const utf = decodeBms(new TextEncoder().encode('#TITLE 테스트 テスト\n'));
    expect([utf.encoding, utf.sure]).toEqual(['utf-8', true]);
    const bom = decodeBms(bytes([0xef, 0xbb, 0xbf], '#TITLE A\n'));
    expect(bom.text).toBe('#TITLE A\n');
    expect(decodeBms(bytes('#TITLE plain\n')).encoding).toBe('utf-8');
  });
});

describe('commands and control flow', () => {
  it('reads headers, definitions and objects, merging a channel written twice', () => {
    const d = parseBms(
      '#TITLE Song\n#BPM 150\n#WAV01 kick.wav\n#wav0a snare.wav\n#BPM01 175.5\n#EXBPM02 90\n#STOP01 96\n' +
        '#LNOBJ ZZ\n#LNTYPE 1\n#00111:01000000\n#00111:00000A00\n#00101:01\n#00101:0A\n#00102:0.75\nnot a command\n',
    );
    expect(d.headers.get('TITLE')).toBe('Song');
    expect(d.headers.get('BPM')).toBe('150');
    expect([...d.wav]).toEqual([
      ['01', 'kick.wav'],
      ['0A', 'snare.wav'],
    ]);
    expect([...d.bpm]).toEqual([
      ['01', 175.5],
      ['02', 90],
    ]);
    expect(d.stop.get('01')).toBe(96);
    expect(d.lnobj.has('ZZ')).toBe(true);
    expect(d.measureLength.get(1)).toBe('0.75');
    // The two 11 lines merged; each BGM line kept.
    expect(d.lines.filter((l) => l.channel === '11').map((l) => l.slots)).toEqual([
      ['01', '00', '0A', '00'],
    ]);
    expect(d.lines.filter((l) => l.channel === '01')).toHaveLength(2);
  });

  it('follows nested #RANDOM / #IF / #ELSEIF / #ELSE, with the values chosen', () => {
    const text = [
      '#RANDOM 3',
      '#IF 1',
      '#00111:01',
      '#ELSEIF 2',
      '#00112:01',
      '#RANDOM 2',
      '#IF 2',
      '#00114:01',
      '#ENDIF',
      '#ENDRANDOM',
      '#ELSE',
      '#00113:01',
      '#ENDIF',
      '#ENDRANDOM',
      '#SETRANDOM 2',
      '#IF 2',
      '#00115:01',
      '#ENDIF',
    ].join('\n');
    const lanes = (pick: number[]) =>
      parseBms(text, { pick: (_, i) => pick[i] ?? 1 })
        .lines.map((l) => l.channel)
        .sort();
    expect(lanes([1])).toEqual(['11', '15']);
    expect(lanes([2, 2])).toEqual(['12', '14', '15']);
    expect(lanes([2, 1])).toEqual(['12', '15']);
    expect(lanes([3])).toEqual(['13', '15']);
    const d = parseBms(text, { pick: () => 2 });
    expect(d.randoms.map((r) => [r.line, r.max, r.value, r.fixed])).toEqual([
      [1, 3, 2, false],
      [6, 2, 2, false],
      [15, 2, 2, true],
    ]);
    // A random inside a branch not taken is never rolled.
    expect(parseBms(text, { pick: () => 1 }).randoms.map((r) => r.line)).toEqual([1, 15]);
  });

  it('closes an #IF left open, and falls through #SWITCH cases until #SKIP', () => {
    const d = parseBms('#RANDOM 2\n#IF 1\n#00111:01\n#IF 2\n#00112:01\n#ENDIF\n#ENDRANDOM\n', {
      pick: () => 2,
    });
    expect(d.lines.map((l) => l.channel)).toEqual(['12']);
    expect(d.warnings[0]!.message).toMatch(/closed for it/);
    const sw =
      '#SWITCH 3\n#CASE 1\n#00111:01\n#CASE 2\n#00112:01\n#SKIP\n#CASE 3\n#00113:01\n#DEF\n#00114:01\n#ENDSW\n';
    const run = (v: number) =>
      parseBms(sw, { pick: () => v })
        .lines.map((l) => l.channel)
        .sort();
    expect(run(1)).toEqual(['11', '12']);
    expect(run(2)).toEqual(['12']);
    expect(run(3)).toEqual(['13', '14']);
  });

  it('reads ids in base 36, or 62 when the file says so', () => {
    expect(bmsIdNumber('0Z')).toBe(35);
    expect(bmsIdNumber('10')).toBe(36);
    expect(bmsIdNumber('0a', 62)).toBe(36);
    const d = parseBms('#00111:0a0A\n#WAV0a low.wav\n#WAV0A high.wav\n#BASE 62\n');
    expect(d.base).toBe(62);
    expect(d.lines[0]!.slots).toEqual(['0a', '0A']);
    expect(d.wav.size).toBe(2);
    expect(parseBms('#00111:0a0A\n').lines[0]!.slots).toEqual(['0A', '0A']);
  });
});

describe('the chart', () => {
  const base =
    '#TITLE T\n#ARTIST A\n#PLAYLEVEL 7\n#BPM 120\n#WAV01 kick.wav\n#WAV02 snare.wav\n#WAV03 bgm.ogg\n';

  it('places notes on EZ2 lanes at exact positions, with tempo, stops and measure lengths', () => {
    const c = convertBms(
      parseBms(
        base +
          '#BPM01 150\n#STOP01 48\n#00001:03\n#00011:01010101\n#00016:0002\n#00017:02\n' +
          '#00102:0.75\n#00108:0001\n#00115:000001\n#00203:B4\n#00209:01\n#00221:01\n',
      ),
    );
    const d = c.data;
    expect(c.mode).toBe('10k'); // a 2P key
    expect(d.info).toMatchObject({
      title: 'T',
      artist: 'A',
      level: 7,
      initBpm: 120,
      resolution: 240,
    });
    const at = (x: number) => d.notes.filter((n) => n.x === x).map((n) => n.y);
    expect(at(11)).toEqual([0, 240, 480, 720]);
    expect(at(1)).toEqual([480]); // 16: turntable
    expect(at(10)).toEqual([0]); // 17: pedal
    // Measure 1 is 3 beats long: its 2/3 point is beat 4 + 2.
    expect(at(15)).toEqual([240 * 6]);
    // Measure 2 starts at beat 7.
    expect(at(21)).toEqual([240 * 7]);
    expect(d.bpmEvents).toEqual([
      { y: 240 * 5.5, bpm: 150 },
      { y: 240 * 7, bpm: 180 },
    ]);
    // 48/192 of a measure = one beat.
    expect(d.stopEvents).toEqual([{ y: 240 * 7, duration: 240 }]);
    expect(d.notes.filter((n) => n.x === 0).map((n) => n.y)).toEqual([0]);
    const names = (x: number) =>
      d.notes.filter((n) => n.x === x).map((n) => d.channels.find((ch) => ch.id === n.ch)!.name);
    expect(names(0)).toEqual(['bgm.ogg']);
    expect(d.channels.map((ch) => ch.name)).toEqual(['kick.wav', 'snare.wav', 'bgm.ogg']);
    // It is plain bmson.
    const text = serializeBmson(d);
    expect(serializeBmson(parseBmson(text).chart)).toBe(text);
  });

  it('makes long notes of 5x pairs, 5x runs (LNTYPE 2) and #LNOBJ', () => {
    const one = convertBms(parseBms(base + '#00051:01000100\n#00052:0101\n')).data;
    expect(one.notes.filter((n) => n.x === 11).map((n) => [n.y, n.l])).toEqual([[0, 480]]);
    expect(one.notes.filter((n) => n.x === 12).map((n) => [n.y, n.l])).toEqual([[0, 480]]);
    // Runs: slots 1-2 of measure 0 (to beat 2), then the last slot of measure 0 into measure 1.
    const two = convertBms(parseBms(base + '#LNTYPE 2\n#00051:01010001\n#00151:0100\n')).data;
    expect(two.notes.filter((n) => n.x === 11).map((n) => [n.y, n.l])).toEqual([
      [0, 480],
      [720, 240 + 480],
    ]);
    const obj = convertBms(parseBms(base + '#LNOBJ ZZ\n#00011:0100ZZ00\n')).data;
    expect(obj.notes.filter((n) => n.x === 11).map((n) => [n.y, n.l])).toEqual([[0, 480]]);
  });

  it('leaves out hidden notes and mines, and says what it did', () => {
    const c = convertBms(parseBms(base + '#00031:01\n#000D1:01\n#00099:01\n#SCROLL01 2\n'));
    expect(c.data.notes).toEqual([]);
    const rules = c.notes.map((n) => n.rule);
    expect(rules).toEqual(expect.arrayContaining(['bms-hidden', 'bms-mines', 'bms-read']));
    const kept = convertBms(parseBms(base + '#00031:01\n'), { hiddenAsBackground: true });
    expect(kept.data.notes.map((n) => [n.x, n.y])).toEqual([[0, 0]]);
  });

  it('maps a 14-key file in key order when asked (SpaceMix)', () => {
    const text = base + '#00011:01\n#00018:01\n#00019:01\n#00021:01\n#00028:01\n';
    const ez2 = convertBms(parseBms(text), { mode: '14k' }).data;
    expect(ez2.notes.map((n) => n.x).sort((a, b) => a - b)).toEqual([11, 21, 31, 32, 33]);
    const keys = convertBms(parseBms(text), { mode: '14k', map: keysInOrderMap('14k') }).data;
    // 1P keys 1, 6, 7 then 2P keys 1 and 6: SpaceMix keys 1, 6, 7, 8 and 13.
    expect(keys.notes.map((n) => n.x).sort((a, b) => a - b)).toEqual([11, 24, 31, 32, 33]);
  });

  it('chooses the smallest mode that has every lane', () => {
    expect(guessMode(new Set([11, 12, 1]))).toBe('5k');
    expect(guessMode(new Set([11, 31]))).toBe('7k');
    expect(guessMode(new Set([11, 21, 2]))).toBe('10k');
    expect(guessMode(new Set([11, 31, 21]))).toBe('14k');
    expect(Object.keys(EZ2_BME_MAP.lanes)).toHaveLength(18);
  });

  it('guesses the tier and clamps the level', () => {
    const t = (h: string, file = 'a.bme') => convertBms(parseBms(base + h), { file }).tier;
    expect(t('#DIFFICULTY 3\n')).toBe('HD');
    expect(t('#DIFFICULTY 5\n')).toBe('EX');
    expect(t('', 'song_another.bme')).toBe('SHD');
    expect(t('#SUBTITLE [HYPER]\n')).toBe('HD');
    expect(t('')).toBe('NM');
    const c = convertBms(parseBms('#PLAYLEVEL 99\n#BPM 120\n'));
    expect(c.data.info.level).toBe(20);
    expect(c.notes.some((n) => n.rule === 'bms-level')).toBe(true);
  });

  it('finds the resolution that places every note exactly', () => {
    const slots = (n: number) => '01' + '00'.repeat(n - 2) + '01';
    expect(convertBms(parseBms(base + `#00011:${slots(64)}\n`)).data.info.resolution).toBe(240);
    expect(convertBms(parseBms(base + `#00011:${slots(384)}\n`)).data.info.resolution).toBe(480);
    const c = convertBms(parseBms(base + '#00002:0.333\n#00011:000001\n'));
    // 0.333 is read as 1/3 of a measure (4/3 beats): its last third starts at 8/9 of a beat.
    expect(measureRational(0.333)).toEqual({ n: 1, d: 3 });
    expect(c.data.info.resolution).toBe(720);
    expect(c.data.notes[0]!.y).toBe(640);
  });

  it('resolves sounds to the folder and says which are missing', () => {
    const files = ['Kick.ogg', 'sub/Snare.wav'];
    const resolve = (n: string) => {
      const want = n
        .replace(/\\/g, '/')
        .replace(/\.[^.]+$/, '')
        .toLowerCase();
      return files.find((f) => f.replace(/\.[^.]+$/, '').toLowerCase() === want);
    };
    const c = convertBms(
      parseBms(
        '#BPM 120\n#WAV01 kick.wav\n#WAV02 sub\\snare.wav\n#WAV03 gone.wav\n#00011:010203\n#00012:04\n',
      ),
      {
        resolve,
      },
    );
    expect(c.data.channels.map((ch) => ch.name)).toEqual([
      'Kick.ogg',
      'sub/Snare.wav',
      'gone.wav',
      'wav 04.wav',
    ]);
    expect(c.sounds).toEqual(['Kick.ogg', 'sub/Snare.wav']);
    expect(c.notes.filter((n) => n.rule === 'bms-sound').map((n) => n.message)).toEqual([
      expect.stringContaining('04'),
      expect.stringContaining('gone.wav'),
    ]);
  });
});

// ---- timing against the BMS memo's own arithmetic ---------------------------------

/** Seconds at a chart position, from its own events (pulses, BPMs, STOP pulses). */
function secondsAt(d: ChartData, y: number): number {
  const res = d.info.resolution!;
  let t = 0;
  let at = 0;
  let bpm = d.info.initBpm!;
  const events = [
    ...d.bpmEvents.map((e) => ({ y: e.y, bpm: e.bpm, stop: 0 })),
    ...d.stopEvents.map((e) => ({ y: e.y, bpm: 0, stop: e.duration })),
  ].sort((a, b) => a.y - b.y || (a.stop ? 1 : 0) - (b.stop ? 1 : 0));
  for (const e of events) {
    if (e.y > y || (e.stop && e.y === y)) break;
    t += ((e.y - at) / res) * (60 / bpm);
    at = e.y;
    if (e.bpm) bpm = e.bpm;
    if (e.stop) t += (e.stop / res) * (60 / bpm);
  }
  return t + ((y - at) / res) * (60 / bpm);
}

const LENGTHS = ['1', '0.75', '1.5', '0.5', '1.25', '0.140625', '2'];

describe('timing', () => {
  it('puts every note when the BMS memo says it plays (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom(...LENGTHS), fc.constantFrom(1, 2, 3, 4, 6, 8, 12, 16)), {
          minLength: 1,
          maxLength: 6,
        }),
        fc.array(
          fc.tuple(
            fc.integer({ min: 0, max: 5 }),
            fc.integer({ min: 0, max: 15 }),
            fc.constantFrom('03', '08', '09', '11'),
          ),
          {
            minLength: 1,
            maxLength: 20,
          },
        ),
        (measures, objs) => {
          const lines = ['#BPM 140', '#WAV01 a.wav', '#BPM01 175.5', '#STOP01 24', '#BPM02 88'];
          measures.forEach(
            ([len], m) => len !== '1' && lines.push(`#${String(m).padStart(3, '0')}02:${len}`),
          );
          // One line per (measure, channel), with 16 slots; a slot's id by channel.
          const grid = new Map<string, string[]>();
          const expected: { beat: number; ch: string }[] = [];
          const lens = measures.map(([l]) => Number(l));
          const start = (m: number) => lens.slice(0, m).reduce((a, b) => a + b * 4, 0);
          for (const [m0, slot, ch] of objs) {
            const m = m0 % measures.length;
            const key = `${m}:${ch}`;
            const g = grid.get(key) ?? Array<string>(16).fill('00');
            if (g[slot] !== '00') continue;
            g[slot] = ch === '03' ? 'B4' : ch === '08' ? (slot % 2 ? '01' : '02') : '01';
            grid.set(key, g);
            if (ch === '11') expected.push({ beat: start(m) + (lens[m]! * 4 * slot) / 16, ch });
          }
          for (const [key, g] of grid) {
            const [m, ch] = key.split(':');
            lines.push(`#${m!.padStart(3, '0')}${ch}:${g.join('')}`);
          }
          const d = convertBms(parseBms(lines.join('\n'))).data;
          // The memo's arithmetic, in floating point: walk the events in beats.
          const events: { beat: number; bpm?: number; stop?: number }[] = [];
          for (const [key, g] of grid) {
            const [ms, ch] = key.split(':');
            const m = Number(ms);
            g.forEach((id, s) => {
              if (id === '00') return;
              const beat = start(m) + (lens[m]! * 4 * s) / 16;
              if (ch === '03') events.push({ beat, bpm: 0xb4 });
              if (ch === '08') events.push({ beat, bpm: id === '01' ? 175.5 : 88 });
              if (ch === '09') events.push({ beat, stop: 24 / 48 });
            });
          }
          // A later line wins a tempo at one spot (beatoraja, LR2); a stop comes after it.
          events.sort((a, b) => a.beat - b.beat || (a.stop ? 1 : 0) - (b.stop ? 1 : 0));
          const memo = (beat: number) => {
            let t = 0;
            let at = 0;
            let bpm = 140;
            for (const e of events) {
              if (e.beat > beat || (e.stop && e.beat === beat)) break;
              t += (e.beat - at) * (60 / bpm);
              at = e.beat;
              if (e.bpm) bpm = e.bpm;
              if (e.stop) t += e.stop * (60 / bpm);
            }
            return t + (beat - at) * (60 / bpm);
          };
          const lane = d.notes.filter((n) => n.x === 11).map((n) => n.y);
          expect(lane.sort((a, b) => a - b)).toEqual(
            expected.map((e) => e.beat * d.info.resolution!).sort((a, b) => a - b),
          );
          for (const e of expected)
            expect(secondsAt(d, e.beat * d.info.resolution!)).toBeCloseTo(memo(e.beat), 9);
        },
      ),
      { numRuns: 150, seed: 5061 },
    );
  });
});

describe('performance', () => {
  it('reads and converts a 50 000-note file quickly', () => {
    const lines = [
      '#BPM 150',
      ...Array.from(
        { length: 100 },
        (_, i) => `#WAV${i.toString(36).padStart(2, '0').toUpperCase()} s${i}.wav`,
      ),
    ];
    for (let m = 0; m < 800; m++)
      for (const ch of ['11', '12', '13', '14', '15', '01'])
        lines.push(
          `#${String(m).padStart(3, '0')}${ch}:${Array.from({ length: 12 }, (_, i) => (((m * 7 + i) % 99) + 1).toString(36).padStart(2, '0').toUpperCase()).join('')}`,
        );
    const text = lines.join('\n');
    const t0 = performance.now();
    const c = convertBms(parseBms(text));
    const ms = performance.now() - t0;
    expect(c.data.notes.length).toBe(800 * 6 * 12);
    expect(ms).toBeLessThan(1500);
  });
});

describe('a folder of BMS files', () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  const common =
    '#ARTIST A\n#BPM 150\n#WAV01 kick.wav\n#WAV02 sub\\snare.wav\n#STAGEFILE stage.png\n#PREVIEW pre.wav\n';
  const files = [
    {
      name: 'song_n.bme',
      bytes: enc(
        `#TITLE Neon Song [NORMAL]\n#DIFFICULTY 2\n#PLAYLEVEL 3\n${common}#00011:01\n#00012:02\n`,
      ),
    },
    {
      name: 'song_h.bme',
      bytes: enc(
        `#TITLE Neon Song [HYPER]\n#DIFFICULTY 3\n#PLAYLEVEL 8\n${common}#00011:0101\n#00018:02\n`,
      ),
    },
    {
      name: 'song_h2.bme',
      bytes: enc(
        `#TITLE Neon Song [HYPER]\n#DIFFICULTY 3\n#PLAYLEVEL 9\n${common}#00011:01\n#00019:01\n`,
      ),
    },
  ];
  const listing = [
    'song_n.bme',
    'song_h.bme',
    'song_h2.bme',
    'Kick.ogg',
    'sub/Snare.wav',
    'stage.png',
    'pre.wav',
    'unused.wav',
  ];

  it('makes one song: a chart per file, the files they use, the key from the title', () => {
    const imp = importBmsSong({ files, listing, folder: 'Neon Song' });
    expect(imp.key).toBe('neonsong');
    expect(imp.charts.map((c) => [c.file, c.from, c.mode, c.tier, c.data.info.level])).toEqual([
      ['7streetmix1p-neonsong-hd.bmson', 'song_h.bme', '7k', 'HD', 8],
      ['streetmix1p-neonsong.bmson', 'song_n.bme', '5k', 'NM', 3],
    ]);
    // The second HYPER takes a tier another file already has: left out, and said.
    expect(imp.files.find((f) => f.file === 'song_h2.bme')).toMatchObject({
      skipped: true,
      clash: 'song_h.bme',
    });
    expect(imp.notes.map((n) => n.rule)).toEqual(['import-skipped']);
    expect(imp.uses).toEqual(['Kick.ogg', 'pre.wav', 'stage.png', 'sub/Snare.wav']);
    expect(imp.song).toMatchObject({
      key: 'neonsong',
      category: 48,
      eyecatch: { src: 'stage.png', mode: 'visible' },
      preview: { file: 'pre.wav' },
      source: { from: 'bms', path: 'Neon Song' },
    });
  });

  it('takes the choices given per file', () => {
    const imp = importBmsSong({
      files,
      listing,
      choices: {
        'song_h2.bme': { tier: 'SHD' },
        'song_n.bme': { skip: true },
        'song_h.bme': { mode: '14k', map: 'keys' },
      },
    });
    expect(imp.charts.map((c) => [c.from, c.mode, c.tier])).toEqual([
      ['song_h.bme', '14k', 'HD'],
      ['song_h2.bme', '7k', 'SHD'],
    ]);
    expect(imp.files.find((f) => f.file === 'song_n.bme')!.skipped).toBe(true);
    expect(imp.files.find((f) => f.file === 'song_h.bme')!.map).toBe('keys');
  });
});

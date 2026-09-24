// BMS export (io/bms/write.ts, export.ts): what is written reads back, with
// EZ2BMS's own BMS reader (M5), as the chart it came from - every note in its
// lane at its beat with its length and its sound, at its time. EZ2PORT reads
// no BMS, so this round trip is the check (docs/ez2port-compat.md).

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { convertBms, EZ2_BME_MAP, inverseMap, keysInOrderMap } from '../src/io/bms/convert';
import { decodeBms } from '../src/io/bms/decode';
import { exportBmsSong, type BmsSongChart } from '../src/io/bms/export';
import { parseBms } from '../src/io/bms/parse';
import { BmsWriteError } from '../src/io/bms/write';
import { newChart } from '../src/model/defaults';
import type { ChartData, NoteRec, Tier } from '../src/model/types';
import type { ModeId } from '../src/modes/ids';
import { modeDef } from '../src/modes/registry';
import { ChartClock, chartSounds } from '../src/publish/chart-plan';
import { KeysoundRegistry } from '../src/publish/keysounds';

/** Seconds at a pulse, by the BMS memo's arithmetic (STOP after the notes at its spot). */
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

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** A position in beats, exactly, as a reduced fraction. */
const beats = (y: number, res: number) => `${y / gcd(y, res)}/${res / gcd(y, res)}`;

function exported(c: BmsSongChart, map: 'ez2' | 'keys' = 'ez2') {
  const out = exportBmsSong([c], { map, resolve: (n) => n });
  const bytes = out.files[0]!.bytes;
  const decoded = decodeBms(bytes);
  const back = convertBms(parseBms(decoded.text), {
    mode: c.mode,
    map: map === 'keys' ? keysInOrderMap(c.mode) : EZ2_BME_MAP,
    resolve: (n) => n,
  });
  return { out, decoded, back };
}

/** Every note as it must come back: lane (or background), beat, length, sound, time. */
function summary(
  d: ChartData,
  x: (n: NoteRec) => number,
  sound: (n: NoteRec) => string,
  len: (n: NoteRec) => number,
) {
  const res = d.info.resolution!;
  return d.notes
    .map(
      (n) =>
        `${x(n)} ${beats(n.y, res)} ${len(n) ? beats(len(n), res) : 0} ${sound(n)} ${Math.round(secondsAt(d, n.y) * 1e6)}`,
    )
    .sort();
}

const MODES: ModeId[] = ['5k', '7k', '10k', '14k'];

/** A random EZ2BMS chart: lanes and background, holds (some meeting), slices of a stem, tempo, stops. */
const chartArb = fc
  .record({
    mode: fc.constantFrom(...MODES),
    res: fc.constantFrom(240, 480, 960),
    bpm: fc.constantFrom(150, 174.5, 88.25, 200),
    tempo: fc.array(
      fc.tuple(fc.integer({ min: 0, max: 16 * 4 }), fc.constantFrom(90, 180, 174.5, 300.125, 60)),
      { maxLength: 5 },
    ),
    stops: fc.array(
      fc.tuple(fc.integer({ min: 1, max: 16 * 4 }), fc.integer({ min: 1, max: 96 })),
      {
        maxLength: 3,
      },
    ),
    notes: fc.array(
      fc.tuple(
        fc.integer({ min: 0, max: 20 }), // column index (past the columns: background)
        fc.integer({ min: 0, max: 16 * 48 - 1 }), // position in 1/48 beats...
        fc.constantFrom(1, 2, 3, 4, 6, 8, 12, 16, 48), // ...on this grid
        fc.integer({ min: 0, max: 3 }), // hold length in 1/4 beats (0: a tap)
        fc.integer({ min: 1, max: 5 }), // sound
      ),
      { minLength: 1, maxLength: 60 },
    ),
    slices: fc.array(fc.integer({ min: 1, max: 16 * 4 - 1 }), { maxLength: 6 }),
    meet: fc.boolean(),
  })
  .map(({ mode, res, bpm, tempo, stops, notes, slices, meet }) => {
    const d = newChart({ mode, tier: 'HD', bpm, title: 'Round Trip' });
    d.info.resolution = res;
    const cols = modeDef(mode).columns;
    d.channels = [1, 2, 3, 4, 5].map((i) => ({ id: i, name: `k${i}.wav` }));
    d.channels.push({ id: 6, name: 'stem.wav' });
    d.bpmEvents = tempo.map(([q, b]) => ({ y: (q * res) / 4, bpm: b }));
    d.stopEvents = stops.map(([q, k]) => ({ y: (q * res) / 4, duration: (k * res) / 48 }));
    let id = 1;
    const busy = new Map<number, [number, number][]>(); // lane -> [start, end]
    for (const [ci, p, grid, hold, snd] of notes) {
      const y = Math.floor(p / grid) * grid * (res / 48);
      const col = cols[ci];
      const x = col ? col.x : 0;
      let l = hold * (res / 4);
      if (x) {
        const spans = busy.get(x) ?? [];
        // EZ2's lane rules: one note a spot, none starting inside a hold.
        if (spans.some(([a, b]) => y >= a && y <= b)) continue;
        if (l && spans.some(([a]) => a > y && a <= y + l)) l = 0;
        spans.push([y, y + l]);
        busy.set(x, spans);
      } else l = 0;
      d.notes.push({ id: id++, ch: snd, x, y, l, c: false });
    }
    // Two holds meeting on the first lane, sometimes.
    const x0 = cols[0]!.x;
    if (meet && !busy.has(x0)) {
      const y0 = 60 * res;
      d.notes.push({ id: id++, ch: 1, x: x0, y: y0, l: res, c: false });
      d.notes.push({ id: id++, ch: 2, x: x0, y: y0 + res, l: res, c: false });
    }
    // A stem cut into slices on the background.
    d.notes.push({ id: id++, ch: 6, x: 0, y: 0, l: 0, c: false });
    for (const q of new Set(slices))
      d.notes.push({ id: id++, ch: 6, x: 0, y: (q * res) / 4, l: 0, c: true });
    return { file: 'streetmix1p-song-hd.bmson', data: d, mode, tier: 'HD' as Tier };
  });

describe('BMS export read back', () => {
  it('gives every note back in its lane, at its beat and time, with its length and sound (property)', () => {
    fc.assert(
      fc.property(chartArb, fc.constantFrom('ez2' as const, 'keys' as const), (c, map) => {
        const { out, back } = exported(c, map);
        const written = out.charts[0]!.written;
        const lanes = inverseMap(map === 'keys' ? keysInOrderMap(c.mode) : EZ2_BME_MAP, c.mode);
        // The sound each note plays: the file the export named for it.
        const soundOf = new Map<number, string>();
        // chartSounds numbers a song's keysounds; export.ts names them in that order.
        const reg = new KeysoundRegistry();
        for (const s of chartSounds(c.data, new ChartClock(c.data), reg).sounds)
          soundOf.set(s.n.id, out.soundFiles[s.ks]!);
        const short = new Set(written.shortened);
        const next = (n: NoteRec) =>
          c.data.notes.filter((m) => m.x === n.x && m.y > n.y).sort((a, b) => a.y - b.y)[0]!;
        const want = summary(
          c.data,
          (n) => (lanes.has(n.x) ? n.x : 0),
          (n) => soundOf.get(n.id)!,
          (n) => (!lanes.has(n.x) ? 0 : short.has(n.id) ? next(n).y - 1 - n.y : n.l),
        );
        const name = new Map(back.data.channels.map((ch) => [ch.id, ch.name]));
        const got = summary(
          back.data,
          (n) => n.x,
          (n) => name.get(n.ch)!,
          (n) => n.l,
        );
        expect(got).toEqual(want);
        expect(back.tier).toBe('HD');
        expect(back.data.info.title).toBe('Round Trip');
      }),
      { numRuns: 150, seed: 6071 },
    );
  });
});

describe('BMS export', () => {
  const chart = (
    notes: Partial<NoteRec>[],
    mode: ModeId = '5k',
    tier: Tier = 'NM',
  ): BmsSongChart => {
    const d = newChart({ mode, tier, bpm: 150, title: 'T' });
    d.channels = [
      { id: 1, name: 'kick.wav' },
      { id: 2, name: 'Stems/pad.ogg' },
      { id: 3, name: 'game.ssf' },
    ];
    d.notes = notes.map((n, i) => ({ id: i + 1, ch: 1, x: 11, y: 0, l: 0, c: false, ...n }));
    return { file: 'streetmix1p-t.bmson', data: d, mode, tier };
  };
  const text = (c: BmsSongChart, o: Partial<Parameters<typeof exportBmsSong>[1]> = {}) =>
    exportBmsSong([c], { map: 'ez2', resolve: (n) => n, ...o }).charts[0]!.written.text;

  it('writes whole tempi on 03, the rest on 08, and STOPs in 1/192 measures', () => {
    const c = chart([{ y: 0 }]);
    c.data.bpmEvents = [
      { y: 240, bpm: 180 },
      { y: 480, bpm: 174.5 },
      { y: 720, bpm: 174.5 },
      { y: 0, bpm: 160 },
    ];
    c.data.stopEvents = [
      { y: 960, duration: 240 },
      { y: 1200, duration: 7 },
    ];
    const out = exportBmsSong([c], { map: 'ez2', resolve: (n) => n });
    const t = out.charts[0]!.written.text;
    expect(t).toContain('#BPM 160\r\n');
    expect(t).toContain('#00003:00B40000\r\n');
    expect(t).toContain('#BPM01 174.5\r\n');
    expect(t).toContain('#00008:00000101\r\n');
    expect(t).toContain('#STOP01 48\r\n');
    expect(t).toContain('#STOP02 1.4\r\n');
    expect(out.notes.map((n) => n.rule)).toContain('bms-stop');
  });

  it('names sounds: WAV/OGG copied, EZ2 keysounds and slices made as WAV, all distinct', () => {
    const c = chart([
      { ch: 1, y: 0 },
      { ch: 2, x: 0, y: 0 },
      { ch: 2, x: 0, y: 480, c: true },
      { ch: 3, x: 0, y: 0 },
    ]);
    c.data.channels.push({ id: 4, name: 'KICK.wav' });
    c.data.notes.push({ id: 9, ch: 4, x: 0, y: 960, l: 0, c: false });
    const out = exportBmsSong([c], { map: 'ez2', resolve: (n) => n, preview: 'Stems/pad.ogg' });
    expect(out.copies).toEqual([
      { from: 'kick.wav', path: 'kick.wav' },
      { from: 'KICK.wav', path: 'KICK~2.wav' },
      { from: 'Stems/pad.ogg', path: 'pad.ogg' },
    ]);
    expect(out.sounds.map((s) => [s.src, s.path, s.start_frame, s.end_frame === null])).toEqual([
      ['Stems/pad.ogg', 'Stems_pad_0_800.wav', 0, false],
      ['Stems/pad.ogg', 'Stems_pad_800_end.wav', 35280, true],
      ['game.ssf', 'game.wav', 0, true],
    ]);
    expect(out.files.map((f) => f.path)).toEqual(['streetmix1p-t.bms']);
    expect(out.charts[0]!.written.text).toContain('#PREVIEW pad.ogg');
  });

  it('chooses the encoding the text needs, and says what a forced one cannot write', () => {
    const c = chart([{ y: 0 }]);
    // Plain ASCII: Shift-JIS, which is ASCII there (and reads back as UTF-8 would).
    expect(exported(c).out.encoding).toBe('shift_jis');
    expect(exported(c).back.data.info.title).toBe('T');
    c.data.info.title = 'テスト曲';
    expect(exported(c).back.data.info.title).toBe('テスト曲');
    expect(exported(c).out.encoding).toBe('shift_jis');
    c.data.info.title = '테스트';
    expect(exported(c).out.encoding).toBe('euc-kr');
    expect(exported(c).back.data.info.title).toBe('테스트');
    // Kana and Hangul together: KS X 1001 has both, so CP949.
    c.data.info.title = 'テスト 테스트';
    expect(exported(c).out.encoding).toBe('euc-kr');
    expect(exported(c).back.data.info.title).toBe('テスト 테스트');
    // Something neither has: UTF-8, with a BOM.
    c.data.info.title = 'テスト 테스트 \u{1F3B5}';
    const u = exported(c);
    expect(u.out.encoding).toBe('utf-8');
    expect([...u.out.files[0]!.bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(u.back.data.info.title).toBe('テスト 테스트 \u{1F3B5}');
    const forced = exportBmsSong([c], { map: 'ez2', resolve: (n) => n, encoding: 'shift_jis' });
    expect(forced.charts[0]!.written.unmappable).toEqual(['테', '스', '트', '\u{1F3B5}']);
    expect(forced.notes.map((n) => n.rule)).toContain('bms-encoding');
  });

  it("writes back a BMS's own headers, and the tier and player", () => {
    const c = chart([{ y: 0 }], '10k', 'EX');
    Object.assign(c.data.info.extra, { x_bms_rank: '3', x_bms_total: '321', x_bms_lnmode: '1' });
    const t = text(c);
    for (const line of [
      '#PLAYER 3',
      '#RANK 3',
      '#TOTAL 321',
      '#DIFFICULTY 5',
      '#LNMODE 1',
      '#LNTYPE 1',
    ])
      expect(t).toContain(`${line}\r\n`);
    const judged = chart([{ y: 0 }]);
    judged.data.info.judgeRank = 75;
    expect(text(judged)).toContain('#DEFEXRANK 75\r\n');
    expect(text(chart([{ y: 0 }]))).toContain('#RANK 2\r\n');
  });

  it('is a .bme where it uses 7-key channels, a .bms where it does not', () => {
    expect(
      exportBmsSong([chart([{ x: 11 }])], { map: 'ez2', resolve: (n) => n }).files[0]!.path,
    ).toBe('streetmix1p-t.bms');
    expect(
      exportBmsSong([chart([{ x: 31 }], '7k')], { map: 'ez2', resolve: (n) => n }).files[0]!.path,
    ).toBe('streetmix1p-t.bme');
  });

  it('goes to base 62 past 1295 sounds, and refuses what no BMS can hold', () => {
    const c = chart([]);
    c.data.channels = Array.from({ length: 1300 }, (_, i) => ({ id: i + 1, name: `s${i}.wav` }));
    c.data.notes = c.data.channels.map((ch, i) => ({
      id: i + 1,
      ch: ch.id,
      x: 0,
      y: i * 60,
      l: 0,
      c: false,
    }));
    const { back, out } = exported(c);
    expect(out.charts[0]!.written.base).toBe(62);
    expect(out.charts[0]!.written.text).toContain('#BASE 62\r\n');
    expect(back.data.channels).toHaveLength(1300);
    expect(() => exportBmsSong([c], { map: 'ez2', resolve: (n) => n, base: 36 })).toThrow(
      BmsWriteError,
    );
    const long = chart([{ y: 1000 * 960 }]);
    expect(() => exportBmsSong([long], { map: 'ez2', resolve: (n) => n })).toThrow(/000-999/);
  });

  it('says what BMS has no place for: velocity and pan, meeting holds, missing sounds', () => {
    const c = chart([
      { y: 0, vel: 100 },
      { x: 12, y: 0, l: 240 },
      { x: 12, y: 240, l: 240 },
    ]);
    c.data.channels.push({ id: 4, name: 'gone.wav' });
    c.data.notes.push({ id: 9, ch: 4, x: 0, y: 0, l: 0, c: false });
    const out = exportBmsSong([c], {
      map: 'ez2',
      resolve: (n) => (n === 'gone.wav' ? undefined : n),
    });
    expect(out.notes.map((n) => n.rule)).toEqual(
      expect.arrayContaining(['bms-missing-sound', 'bms-velpan', 'bms-holds']),
    );
    expect(out.charts[0]!.written.shortened).toEqual([2]);
    expect(out.charts[0]!.written.text).toContain('#WAV02 gone.wav\r\n');
  });
});

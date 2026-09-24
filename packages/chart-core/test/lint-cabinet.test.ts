// The cabinet export's own checks (lint/cabinet.ts): one case per rule, on
// small songs built here.

import { describe, expect, it } from 'vitest';
import { synthGds } from '../src/dev/synthgame';
import { parseGds, type Gds } from '../src/ez2data/gds';
import type { SongEntry } from '../src/ez2data/songdb';
import { CABINET_FILE_MAX, lintCabinet, trackCuts } from '../src/lint/cabinet';
import { newChart } from '../src/model/defaults';
import type { ChartData, NoteRec, Tier } from '../src/model/types';
import type { ModeId } from '../src/modes/ids';
import {
  planCabinet,
  type CabinetChart,
  type CabinetOutput,
  type CabinetTarget,
  type SoundNaming,
} from '../src/publish/cabinet';

const R = 240;
const BEAT = 17640; // frames in a beat at 150 BPM
const gds: Partial<Record<ModeId, Gds>> = { '5k': parseGds(synthGds('5k')) };

const entry = (levels: number[]): SongEntry => ({
  key: 'song',
  name: '',
  kind: 0,
  steps: [0, 1, 2, 3].map((t) => ({ level: levels[t] ?? 0, a: 0, b: 150 })) as SongEntry['steps'],
});

function target(levels = [3, 5]): CabinetTarget {
  return { dir: 'Song', key: 'song', entries: { '5k': entry(levels) } };
}

function chart(notes: Partial<NoteRec>[], tier: Tier = 'NM', mode: ModeId = '5k'): CabinetChart {
  const data: ChartData = newChart({ mode, tier, bpm: 150, level: 3 });
  data.channels = [
    { id: 1, name: 'long.wav' },
    { id: 2, name: 'short.wav' },
    { id: 3, name: 'unknown.wav' },
  ];
  data.notes = notes.map((n, i) => ({ id: i + 1, ch: 1, x: 0, y: 0, l: 0, c: false, ...n }));
  return { file: `${mode}-${tier}.bmson`, data, mode, tier };
}

const samples = (src: string) =>
  src === 'long.wav'
    ? { frames: BEAT * 4 }
    : src === 'short.wav'
      ? { frames: BEAT / 4 }
      : undefined;

const plan = (charts: CabinetChart[], t = target(), files = ['streetmix1p-song.ez'], g = gds) =>
  planCabinet({ target: t, files, gds: g, charts });

const rules = (fs: { rule: string; severity: string }[]) =>
  fs.map((x) => `${x.severity} ${x.rule}`);

describe('cabinet lint', () => {
  it("refuses a file larger than the original's buffer", () => {
    const p = plan([chart([{ x: 11 }])]);
    const out = (size: number): CabinetOutput => ({
      files: [
        {
          path: p.charts[0]!.paths.ez,
          bytes: new Uint8Array(size),
          plain: new Uint8Array(),
          kind: 'ez',
          replaces: true,
        },
      ],
      sounds: [],
      reused: [],
      ini: [],
      songdbChanged: {},
    });
    expect(rules(lintCabinet(p, { out: out(CABINET_FILE_MAX) }))).not.toContain(
      'error cabinet-size',
    );
    const big = lintCabinet(p, { out: out(CABINET_FILE_MAX + 1) });
    expect(rules(big)).toContain('error cabinet-size');
    expect(big.find((f) => f.rule === 'cabinet-size')!.message).toMatch(/128 KB/);
  });

  it('counts keysounds after slicing against 2047', () => {
    // One stem, cut into slices a tick apart: every slice is a keysound slot of its own.
    const sliced = (n: number) =>
      chart(Array.from({ length: n }, (_, i) => ({ ch: 1, y: i * 5, c: i > 0 })));
    expect(rules(lintCabinet(plan([sliced(2047)])))).not.toContain('error cabinet-slots');
    expect(rules(lintCabinet(plan([sliced(2048)])))).toContain('error cabinet-slots');
  });

  it('checks the level against the table', () => {
    const c = chart([{ x: 11 }]);
    c.data.info.level = 21;
    expect(rules(lintCabinet(plan([c])))).toContain('error cabinet-level');
  });

  it("finds the sounds one voice per track cuts - the new ones, the game's own, the lanes'", () => {
    // Background: the game's two long sounds on track 9, the second cutting
    // the first (as the game has it); a keyed long sound cut by the lane's next.
    const c = chart(
      [
        { ch: 1, y: 0, extra: { x_track: 9 } },
        { ch: 1, y: R, extra: { x_track: 9 } },
        { ch: 1, x: 11, y: 0 },
        { ch: 2, x: 11, y: R },
        { ch: 3, y: 8 * R, extra: { x_track: 8 } }, // unknown length: not checked, and said
        { ch: 3, y: 9 * R, extra: { x_track: 8 } },
      ],
      'NM',
    );
    c.data.extra.x_ez = { name: '', bpm: 150, bpm2: 150, total_ticks: 0, tracks: 12 };
    const p = plan([c]);
    const f = lintCabinet(p, { samples });
    expect(rules(f)).toEqual(
      expect.arrayContaining(['info cabinet-voice-backing', 'info cabinet-voice-lane']),
    );
    expect(rules(f)).not.toContain('warning cabinet-voice-backing');
    expect(f.find((x) => x.rule === 'cabinet-voice-lane')).toMatchObject({ at: 0, notes: [3] });
    const { cuts, unknown } = trackCuts(p.charts[0]!.plan, p.registry, samples);
    expect(cuts.map((x) => [x.track, x.tick, Math.round(x.cutMs)])).toEqual([
      [3, 0, 1200],
      [9, 0, 1200],
    ]);
    expect(unknown).toBe(1);

    // Twelve tracks, then up to 64: seventy endless long sounds at once must choke.
    const busy = chart(Array.from({ length: 70 }, (_, i) => ({ ch: 1, y: i })));
    busy.data.extra.x_ez = { name: '', bpm: 150, bpm2: 150, total_ticks: 0, tracks: 12 };
    const bf = lintCabinet(plan([busy]), { samples });
    const warn = bf.find((x) => x.rule === 'cabinet-voice-backing' && x.severity === 'warning')!;
    expect(warn.message).toMatch(/^\d+ background sounds cut short on the cabinet/);
  });

  it('says what changes in the game: a new tier, a hidden song, a 2P file left, no .gds', () => {
    const hd = chart([{ x: 11 }], 'HD');
    const f = lintCabinet(plan([hd], target([0, 0]), ['streetmix2p-song-hd.ez'], {}));
    expect(rules(f)).toEqual(
      expect.arrayContaining([
        'info cabinet-tier-new',
        'warning cabinet-song-hidden',
        'warning cabinet-2p',
        'warning cabinet-gds',
      ]),
    );
    expect(f.find((x) => x.rule === 'cabinet-tier-new')!.message).toMatch(/level 3/);
    // With NM exported at a level, the song stays listed.
    const nm = chart([{ x: 11 }], 'NM');
    expect(rules(lintCabinet(plan([nm, hd], target([0, 0]))))).not.toContain(
      'warning cabinet-song-hidden',
    );
  });

  it('warns when kept records fall between ticks, and when a mode has no place for the song', () => {
    const c = chart([{ x: 11 }]);
    // A resolution set by hand: 3 pulses at 480 is 0.3 of a tick.
    c.data.extra.x_ez_records = [
      { track: 5, y: 0, type: 2, value: 1 },
      { track: 5, y: 3, type: 5 },
    ];
    c.data.info.resolution = 480;
    const ten = chart([{ x: 11 }], 'NM', '10k');
    const f = lintCabinet(plan([c, ten]));
    expect(rules(f)).toEqual(
      expect.arrayContaining([
        'warning cabinet-records-res',
        'error cabinet-table',
        'info cabinet-kept',
      ]),
    );
    expect(f.find((x) => x.rule === 'cabinet-table')!.chart).toBe('10k-NM.bmson');
    // Moved with a rescale, they sit on ticks at any resolution.
    c.data.extra.x_ez_records = [{ track: 5, y: 10, type: 2, value: 1 }];
    expect(rules(lintCabinet(plan([c])))).not.toContain('warning cabinet-records-res');
  });

  it('says which keysounds have no file, and how many are converted', () => {
    const p = plan([chart([{ x: 11 }, { ch: 2, x: 12 }])]);
    const names = new Map<number, SoundNaming>([
      [0, { name: 'long', write: false, missing: true }],
      [1, { name: 'short', write: true }],
    ]);
    const f = lintCabinet(p, { names, converted: 1 });
    expect(f.find((x) => x.rule === 'cabinet-missing-sound')!.message).toMatch(
      /^1 keysound has no file \(long\.wav\)/,
    );
    expect(f.find((x) => x.rule === 'cabinet-convert')!.message).toMatch(/^1 keysound converted/);
  });
});

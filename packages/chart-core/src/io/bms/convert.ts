// A parsed BMS -> an EZ2BMS chart.
//
// Timing is exact where BMS is: a slot's position is a fraction of its
// measure, and a measure's length (`#mmm02`) is read as the rational it
// stands for (continued fractions: 0.75 is 3/4, 0.333 is 1/3), so every
// position is a rational number of beats. The resolution is the least one
// (a multiple of 240, at most 9600) that makes them all whole; a file that
// would need more is placed at 240 pulses a beat and the worst rounding is
// said. (BmsTWO does the same, with the same floor.)
//
// - BPM: `#BPM` is the start; channel 03 (a hex integer) and 08 (`#BPMxx`/
//   `#EXBPMxx`) change it. One at the very start becomes the start tempo.
// - STOP: channel 09, `#STOPxx` in 1/192 of a 4/4 measure - res * v / 48
//   pulses. (EZ2 has no stops: publishing turns them into gaps.)
// - Notes: 01 is background; 1x/2x are lanes by the channel map (lanes the
//   map does not place go to the background, and are said); 3x/4x (hidden
//   notes, heard only when hit) are left out unless asked for; 5x/6x are
//   long notes by #LNTYPE 1 (pairs) or 2 (runs of slots); `#LNOBJ` ends the
//   note before it on its channel; D/E (mines) are left out.
// - BGA: channel 04 events, with `#BMPxx` headers; a movie becomes the song's
//   BGA (M3), images are kept but EZ2PORT plays none.
//
// EZ2PORT reads no BMS, so there is no oracle here; the reason is written in
// docs/ez2port-compat.md, and the tests check the timing against the BMS
// memo's own arithmetic.

import type { OpenNote, Severity } from '../../lint/lint';
import { newChart } from '../../model/defaults';
import type { BgaData, ChartData, NoteRec, SoundChannel, Tier } from '../../model/types';
import { modeDef } from '../../modes/registry';
import type { ModeId } from '../../modes/ids';
import { bmsIdNumber, type BmsDoc } from './parse';

// ---- channel maps ---------------------------------------------------------------

export type BmsMapId = 'ez2' | 'keys' | 'custom';

export interface BmsChannelMap {
  id: BmsMapId;
  label: string;
  /** BMS channel (11-19, 21-29) -> bmson x; missing = background. */
  lanes: Record<string, number>;
}

/** EZ2's own BME channels (modes/lanes.ts `bme`): what EZ2 conversions and BmsTWO's EZ2 docs use. */
export const EZ2_BME_MAP: BmsChannelMap = {
  id: 'ez2',
  label: 'EZ2 BME',
  lanes: {
    '11': 11,
    '12': 12,
    '13': 13,
    '14': 14,
    '15': 15,
    '16': 1,
    '17': 10,
    '18': 31,
    '19': 32,
    '21': 21,
    '22': 22,
    '23': 23,
    '24': 24,
    '25': 25,
    '26': 2,
    '27': 20,
    '28': 33,
    '29': 34,
  },
};

/** The BMS key order (1P 11-15, 18, 19; 2P 21-25, 28, 29) onto a mode's keys in play order. */
const KEY_ORDER = [
  '11',
  '12',
  '13',
  '14',
  '15',
  '18',
  '19',
  '21',
  '22',
  '23',
  '24',
  '25',
  '28',
  '29',
];

/**
 * IIDX/beat style: the keys in their BMS order onto the mode's key lanes left
 * to right, the turntables onto the turntables. Differs from EZ2 BME only
 * where EZ2 orders keys differently - SpaceMix's 2P side.
 */
export function keysInOrderMap(mode: ModeId): BmsChannelMap {
  const cols = modeDef(mode).columns.filter(
    (c) => c.kind === 'white' || c.kind === 'blue' || c.kind === 'effector',
  );
  const lanes: Record<string, number> = { '16': 1, '26': 2 };
  // One player's 5- or 7-key file onto 1P, two players' onto both.
  cols.forEach((c, i) => {
    const ch = KEY_ORDER[i];
    if (ch) lanes[ch] = c.x;
  });
  return { id: 'keys', label: 'Keys in order', lanes };
}

// ---- rationals ------------------------------------------------------------------

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

/** n/d, reduced, d > 0. */
class Q {
  constructor(
    readonly n: number,
    readonly d: number,
  ) {}
  static of(n: number, d = 1): Q {
    const g = gcd(n, d) || 1;
    return d < 0 ? new Q(-n / g, -d / g) : new Q(n / g, d / g);
  }
  add(o: Q): Q {
    return Q.of(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  mul(o: Q): Q {
    return Q.of(this.n * o.n, this.d * o.d);
  }
  get value(): number {
    return this.n / this.d;
  }
}

/**
 * The rational a measure length stands for: the first continued-fraction
 * convergent within 1/2000 of a measure (0.333 -> 1/3; 0.140625 -> 9/64).
 */
export function measureRational(x: number): { n: number; d: number } {
  let [h0, h1, k0, k1] = [0, 1, 1, 0];
  let v = x;
  for (let i = 0; i < 20; i++) {
    const a = Math.floor(v);
    [h0, h1] = [h1, a * h1 + h0];
    [k0, k1] = [k1, a * k1 + k0];
    if (Math.abs(h1 / k1 - x) < 1 / 2000 || v - a < 1e-12) break;
    v = 1 / (v - a);
  }
  return { n: h1, d: k1 };
}

// ---- conversion -----------------------------------------------------------------

export interface BmsConvertOptions {
  mode?: ModeId;
  tier?: Tier;
  map?: BmsChannelMap;
  /** Hidden notes (3x/4x) as background sounds, not left out. */
  hiddenAsBackground?: boolean;
  /** The file name, for tier keywords. */
  file?: string;
  /** A #WAV name -> the file as it is in the folder (any case, another extension), or undefined. */
  resolve?: (name: string) => string | undefined;
}

export interface ConvertedBms {
  data: ChartData;
  mode: ModeId;
  tier: Tier;
  notes: OpenNote[];
  /** Files the chart plays or shows, as the folder has them: sounds, BGA files, the stage image, the preview. */
  sounds: string[];
  bga: string[];
  stagefile?: string;
  preview?: string;
  /** Which lanes the notes use under the map (to choose a mode by). */
  lanesUsed: number[];
}

const MAX_RES = 9600;
const MOVIE = /\.(mp4|m4v|mov|webm|mkv|wmv|asf|avi|mpg|mpeg)$/i;

interface Obj {
  q: Q; // beats from the start
  ch: string;
  id: string;
  /** For LNTYPE 2: the slot's end. */
  end: Q;
}

export function convertBms(doc: BmsDoc, opts: BmsConvertOptions = {}): ConvertedBms {
  const notes: OpenNote[] = [];
  const say = (rule: string, severity: Severity, message: string) =>
    notes.push({ rule, severity, message });
  for (const w of doc.warnings) say('bms-read', 'warning', `Line ${w.line}: ${w.message}`);

  // Measure starts, in beats.
  const lastMeasure = Math.max(0, ...doc.lines.map((l) => l.measure), ...doc.measureLength.keys());
  /** Each measure's length in beats. */
  const beats: Q[] = [];
  for (let m = 0; m <= lastMeasure + 1; m++) {
    const s = doc.measureLength.get(m);
    const v = s === undefined ? 1 : Number.parseFloat(s);
    if (!(v > 0))
      say(
        'bms-read',
        'warning',
        `Measure ${m}'s length "${s}" is not a positive number: taken as 1`,
      );
    const r = v > 0 ? measureRational(v) : { n: 1, d: 1 };
    beats.push(Q.of(4 * r.n, r.d));
  }
  const starts: Q[] = [Q.of(0)];
  for (let m = 0; m <= lastMeasure + 1; m++) starts.push(starts[m]!.add(beats[m]!));

  // Every object, at its beat.
  const objs: Obj[] = [];
  for (const l of doc.lines) {
    const n = l.slots.length;
    const len = beats[l.measure]!;
    l.slots.forEach((id, i) => {
      if (id === '00') return;
      const q = starts[l.measure]!.add(len.mul(Q.of(i, n)));
      objs.push({ q, ch: l.channel, id, end: starts[l.measure]!.add(len.mul(Q.of(i + 1, n))) });
    });
  }

  // The resolution that makes every position whole.
  let res = 240;
  let exact = true;
  for (const o of objs) {
    const need = lcm(res, o.q.d);
    if (need > MAX_RES || !Number.isSafeInteger(need)) {
      exact = false;
      break;
    }
    res = need;
  }
  if (!exact) res = 240;
  let worst = 0;
  const yOf = (q: Q) => {
    const y = q.value * res;
    const r = Math.round(y);
    worst = Math.max(worst, Math.abs(r - y));
    return r;
  };

  // Map, mode, tier.
  const map = opts.map ?? EZ2_BME_MAP;
  const lanesUsed = new Set<number>();
  for (const o of objs) {
    const p = playable(o.ch);
    if (!p) continue;
    const x = map.lanes[p];
    if (x) lanesUsed.add(x);
  }
  const mode = opts.mode ?? guessMode(lanesUsed);
  const modeLanes = new Set(modeDef(mode).columns.map((c) => c.x));
  const tier = opts.tier ?? guessTier(doc, opts.file ?? '');

  const h = (k: string) => doc.headers.get(k);
  const data: ChartData = newChart({
    mode,
    tier,
    title: h('TITLE') ?? '',
    artist: h('ARTIST') ?? '',
    genre: h('GENRE') ?? '',
    bpm: 130,
  });
  const info = data.info;
  info.subtitle = h('SUBTITLE') ?? '';
  if (h('SUBARTIST')) info.subartists = [h('SUBARTIST')!];
  info.resolution = res;
  const lv = Number.parseInt(h('PLAYLEVEL') ?? '', 10);
  if (Number.isFinite(lv) && lv >= 1 && lv <= 20) info.level = lv;
  else {
    info.level = Math.min(20, Math.max(1, Number.isFinite(lv) ? lv : 1));
    say(
      'bms-level',
      'warning',
      `#PLAYLEVEL ${h('PLAYLEVEL') ?? '(none)'} is not 1-20, which EZ2PORT's song list needs: set to ${info.level}`,
    );
  }
  for (const k of ['RANK', 'DEFEXRANK', 'TOTAL', 'PLAYER', 'DIFFICULTY', 'LNMODE'])
    if (h(k) !== undefined) info.extra[`x_bms_${k.toLowerCase()}`] = h(k);

  // Tempo.
  const start = Number.parseFloat(h('BPM') ?? '');
  let initBpm = start > 0 ? start : 130;
  if (!(start > 0))
    say('bms-read', 'warning', `No usable #BPM: the start tempo is taken as ${initBpm}`);
  const tempo = new Map<number, number>();
  const stops = new Map<number, number>();
  let badRefs = 0;
  for (const o of objs) {
    if (o.ch === '03') {
      const v = Number.parseInt(o.id, 16);
      if (v > 0) tempo.set(yOf(o.q), v);
    } else if (o.ch === '08') {
      const v = doc.bpm.get(o.id);
      if (v !== undefined && v > 0) tempo.set(yOf(o.q), v);
      else badRefs++;
    } else if (o.ch === '09') {
      const v = doc.stop.get(o.id);
      if (v !== undefined && v > 0)
        stops.set(yOf(o.q), (stops.get(yOf(o.q)) ?? 0) + Math.round((res * v) / 48));
      else badRefs++;
    }
  }
  if (tempo.has(0)) {
    initBpm = tempo.get(0)!;
    tempo.delete(0);
  }
  info.initBpm = initBpm;
  data.bpmEvents = [...tempo].sort((a, b) => a[0] - b[0]).map(([y, bpm]) => ({ y, bpm }));
  data.stopEvents = [...stops]
    .sort((a, b) => a[0] - b[0])
    .map(([y, duration]) => ({ y, duration }));
  if (badRefs)
    say(
      'bms-read',
      'warning',
      `${badRefs} tempo or stop changes name a #BPMxx/#STOPxx the file does not define: left out`,
    );
  if (stops.size)
    say(
      'bms-stop',
      'info',
      `${stops.size} STOP${stops.size === 1 ? '' : 's'}: EZ2 has none - publishing turns each into a gap, so the scroll does not freeze`,
    );

  // Sounds.
  const channels = new Map<string, SoundChannel>();
  const sounds = new Set<string>();
  const undefinedWav = new Set<string>();
  const unfound = new Set<string>();
  const channelFor = (wid: string): SoundChannel => {
    const written = doc.wav.get(wid);
    let name: string;
    if (written === undefined) {
      undefinedWav.add(wid);
      name = `wav ${wid}.wav`;
    } else {
      const found = opts.resolve ? opts.resolve(written) : written;
      if (found === undefined) unfound.add(written);
      else sounds.add(found);
      name = (found ?? written).replace(/\\/g, '/');
    }
    let ch = channels.get(name.toLowerCase());
    if (!ch) channels.set(name.toLowerCase(), (ch = { id: 0, name }));
    return ch;
  };

  // Notes.
  const out: NoteRec[] = [];
  /** Each note's channel, numbered once all are known. */
  const soundOf = new Map<NoteRec, SoundChannel>();
  let nextId = 1;
  const add = (o: Obj, x: number, l = 0) => {
    const n: NoteRec = { id: nextId++, ch: 0, x, y: yOf(o.q), l, c: false };
    out.push(n);
    soundOf.set(n, channelFor(o.id));
    return n;
  };
  const counts = {
    hidden: 0,
    mines: 0,
    offMode: 0,
    unmapped: new Set<string>(),
    other: new Set<string>(),
  };
  const lnobj = doc.lnobj;
  /** Last lane note per channel (for #LNOBJ). */
  const lastOn = new Map<string, NoteRec>();
  const byChannel = new Map<string, Obj[]>();
  for (const o of objs) {
    const l = byChannel.get(o.ch) ?? [];
    l.push(o);
    byChannel.set(o.ch, l);
  }
  const sorted = [...objs].sort((a, b) => a.q.value - b.q.value);
  for (const o of sorted) {
    const c = o.ch;
    if (c === '01') add(o, 0);
    else if (/^[12][1-9]$/.test(c)) {
      if (lnobj.has(o.id)) {
        const prev = lastOn.get(c);
        if (prev && !prev.l) prev.l = Math.max(0, yOf(o.q) - prev.y);
        lastOn.delete(c);
        continue;
      }
      const x = laneX(c, map, modeLanes, counts);
      const n = add(o, x);
      if (x) lastOn.set(c, n);
    } else if (/^[34][1-9]$/.test(c)) {
      counts.hidden++;
      if (opts.hiddenAsBackground) add(o, 0);
    } else if (/^[DE][1-9]$/.test(c)) counts.mines++;
    else if (/^[56][1-9]$/.test(c))
      continue; // below
    else if (!['03', '04', '06', '07', '08', '09'].includes(c)) counts.other.add(c);
  }
  // Long notes on 5x/6x.
  for (const [c, list] of byChannel) {
    if (!/^[56][1-9]$/.test(c)) continue;
    const lane = `${Number(c[0]) - 4}${c[1]}`;
    const x = laneX(lane, map, modeLanes, counts);
    const objsSorted = [...list].sort((a, b) => a.q.value - b.q.value);
    if (doc.lntype === 2) {
      // A run of filled slots is one note, held to the end of its last slot.
      let run: Obj | undefined;
      let runEnd: Q | undefined;
      for (const o of objsSorted) {
        if (run && runEnd && Math.abs(o.q.value - runEnd.value) < 1e-9) {
          runEnd = o.end;
          continue;
        }
        if (run && runEnd) add(run, x, x ? yOf(runEnd) - yOf(run.q) : 0);
        run = o;
        runEnd = o.end;
      }
      if (run && runEnd) add(run, x, x ? yOf(runEnd) - yOf(run.q) : 0);
    } else {
      for (let i = 0; i < objsSorted.length; i += 2) {
        const a = objsSorted[i]!;
        const b = objsSorted[i + 1];
        add(a, x, x && b ? yOf(b.q) - yOf(a.q) : 0);
        if (!b) say('bms-read', 'warning', `A long note on channel ${c} has no end: a tap`);
      }
    }
  }
  if (doc.lntype !== 1 && doc.lntype !== 2)
    say('bms-read', 'warning', `#LNTYPE ${doc.lntype} is not one EZ2BMS reads: read as 1`);

  // Channels in the order of their #WAV ids.
  const wavIndex = (name: string) => {
    for (const [k, v] of doc.wav)
      if (
        v.replace(/\\/g, '/').toLowerCase() === name.toLowerCase() ||
        (opts.resolve?.(v) ?? v).toLowerCase() === name.toLowerCase()
      )
        return bmsIdNumber(k, doc.base);
    const m = /^wav (..)\.wav$/.exec(name);
    return m ? bmsIdNumber(m[1]!, doc.base) : 1e9;
  };
  const list = [...channels.values()].sort(
    (a, b) => wavIndex(a.name) - wavIndex(b.name) || a.name.localeCompare(b.name),
  );
  list.forEach((ch, i) => (ch.id = i + 1));
  for (const n of out) n.ch = soundOf.get(n)!.id;
  data.channels = list;
  data.notes = out.sort((a, b) => a.y - b.y || a.x - b.x || a.id - b.id);

  // BGA.
  const bgaFiles = new Set<string>();
  const bgaEvents = (ch: string) =>
    objs.filter((o) => o.ch === ch).map((o) => ({ y: yOf(o.q), id: bmsIdNumber(o.id, doc.base) }));
  const bga: BgaData = {
    header: [...doc.bmp].map(([k, v]) => {
      const found = opts.resolve ? (opts.resolve(v) ?? v) : v;
      bgaFiles.add(found);
      return { id: bmsIdNumber(k, doc.base), name: found.replace(/\\/g, '/') };
    }),
    bga: bgaEvents('04'),
    layer: bgaEvents('07'),
    poor: bgaEvents('06'),
  };
  if (bga.bga.length || bga.layer.length) {
    data.bga = bga;
    const used = new Set(bga.bga.map((e) => e.id));
    const movie = bga.header.some((x) => used.has(x.id) && MOVIE.test(x.name));
    if (!movie)
      say(
        'bms-bga',
        'info',
        'Its BGA is images, which EZ2PORT does not play (a movie it does): kept in the chart',
      );
  }

  // Said once each.
  if (!exact)
    say(
      'bms-rounding',
      'warning',
      `Its measure lengths and note spacing need a finer grid than EZ2BMS keeps: placed at 240 pulses a beat, the furthest ${worst.toFixed(2)} pulses from where the file has it`,
    );
  if (counts.hidden)
    say(
      'bms-hidden',
      'info',
      `${counts.hidden} hidden notes (3x/4x, heard only when hit): ${opts.hiddenAsBackground ? 'made background sounds' : 'left out'}`,
    );
  if (counts.mines) say('bms-mines', 'info', `${counts.mines} mines (D/E): EZ2 has none; left out`);
  if (counts.unmapped.size)
    say(
      'bms-lanes',
      'warning',
      `Channel${counts.unmapped.size === 1 ? '' : 's'} ${[...counts.unmapped].sort().join(', ')} ha${counts.unmapped.size === 1 ? 's' : 've'} no lane in the ${map.label} map: those notes are background sounds`,
    );
  if (counts.offMode)
    say(
      'bms-lanes',
      'warning',
      `${counts.offMode} notes are on lanes this mode does not have: background sounds`,
    );
  if (counts.other.size)
    say(
      'bms-read',
      'info',
      `Channel${counts.other.size === 1 ? '' : 's'} ${[...counts.other].sort().join(', ')}: not read (EZ2 has no use for ${counts.other.size === 1 ? 'it' : 'them'})`,
    );
  for (const k of ['SCROLL', 'SPEED']) {
    const any = [...doc.headers.keys()].some((x) => x.startsWith(k));
    if (any) say('bms-read', 'info', `#${k} changes: EZ2 has none; left out`);
  }
  if (undefinedWav.size)
    say(
      'bms-sound',
      'warning',
      `Notes use ${undefinedWav.size} #WAV ids the file does not define: ${[...undefinedWav].slice(0, 8).join(', ')}`,
    );
  if (unfound.size)
    say(
      'bms-sound',
      'warning',
      `${unfound.size} sound file${unfound.size === 1 ? ' is' : 's are'} not in the folder: ${[...unfound].slice(0, 6).join(', ')}${unfound.size > 6 ? '...' : ''}`,
    );
  const rnd = doc.randoms.filter((r) => r.value && !r.fixed);
  if (rnd.length)
    say(
      'bms-random',
      'info',
      `${rnd.length} random choice${rnd.length === 1 ? '' : 's'} (#RANDOM/#SWITCH): ${rnd.map((r) => `line ${r.line}: ${r.value} of ${r.max}`).join(', ')}`,
    );

  const stage = h('STAGEFILE');
  const preview = h('PREVIEW');
  return {
    data,
    mode,
    tier,
    notes,
    sounds: [...sounds],
    bga: [...bgaFiles],
    ...(stage ? { stagefile: opts.resolve ? (opts.resolve(stage) ?? stage) : stage } : {}),
    ...(preview ? { preview: opts.resolve ? (opts.resolve(preview) ?? preview) : preview } : {}),
    lanesUsed: [...lanesUsed].sort((a, b) => a - b),
  };
}

/** A 1x/2x (or the 1x/2x a 5x/6x long note stands for) channel. */
function playable(ch: string): string | undefined {
  if (/^[12][1-9]$/.test(ch)) return ch;
  if (/^[56][1-9]$/.test(ch)) return `${Number(ch[0]) - 4}${ch[1]}`;
  return undefined;
}

function laneX(
  ch: string,
  map: BmsChannelMap,
  modeLanes: Set<number>,
  counts: { offMode: number; unmapped: Set<string> },
): number {
  const x = map.lanes[ch];
  if (!x) {
    counts.unmapped.add(ch);
    return 0;
  }
  if (!modeLanes.has(x)) {
    counts.offMode++;
    return 0;
  }
  return x;
}

/** The smallest of StreetMix, 7StreetMix, ClubMix, SpaceMix that has every lane used; the fullest otherwise. */
export function guessMode(used: ReadonlySet<number>): ModeId {
  const order: ModeId[] = ['5k', '7k', '10k', '14k'];
  let best: ModeId = '5k';
  let bestHit = -1;
  for (const m of order) {
    const lanes = new Set(modeDef(m).columns.map((c) => c.x));
    const hit = [...used].filter((x) => lanes.has(x)).length;
    if (hit === used.size) return m;
    if (hit > bestHit) [best, bestHit] = [m, hit];
  }
  return best;
}

/** `#DIFFICULTY` 1-2 NM, 3 HD, 4 SHD, 5 EX; else keywords in the file name or title; else NM. */
export function guessTier(doc: BmsDoc, file: string): Tier {
  const d = Number.parseInt(doc.headers.get('DIFFICULTY') ?? '', 10);
  if (d === 3) return 'HD';
  if (d === 4) return 'SHD';
  if (d === 5) return 'EX';
  if (d === 1 || d === 2) return 'NM';
  const s =
    `${file} ${doc.headers.get('TITLE') ?? ''} ${doc.headers.get('SUBTITLE') ?? ''}`.toLowerCase();
  if (/insane|leggendaria|black|\[x\]|_x\b|\bex\b/.test(s)) return 'EX';
  if (/another|\[a\]|_a\b|\bshd\b/.test(s)) return 'SHD';
  if (/hyper|hard|\[h\]|_h\b|\bhd\b/.test(s)) return 'HD';
  return 'NM';
}

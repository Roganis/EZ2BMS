// An EZ2BMS chart written as BMS/BME, for other players (LR2, beatoraja) -
// the inverse of convert.ts, so reading the file back gives the chart again
// (bms-write.test.ts checks that on random charts: every note in its lane at
// its beat with its length and its sound, every note at its time).
//
// - Measures are EZ2's: always 4/4 (no #xxx02). Each line has as few slots
//   as place its objects exactly.
// - Tempo: #BPM is the start; a change to a whole 1-255 goes on channel 03
//   (hex), any other on 08 with a #BPMxx.
// - STOP: channel 09, #STOPxx in 1/192 of a 4/4 measure - duration * 48 /
//   resolution. A stop that is not a whole number of those is written as the
//   decimal it is (beatoraja reads it; LR2 truncates), and said.
// - Lanes by channel map: EZ2 BME (each lane's own `bme`) or keys in order.
//   Holds are #LNTYPE 1 pairs on 5x/6x. Two holds on one lane that meet (one
//   ends where the next starts) cannot both have their object there: the
//   first is written one pulse shorter, and said. Everything else - the
//   background, lanes the map has no channel for - is channel 01, one line
//   per layer of sounds at one spot.
// - Keysounds: one #WAV per sound the chart plays - a slice of a stem is a
//   file of its own (export.ts names them; the host cuts them) - in base 36,
//   or #BASE 62 past 1295.
// - Text: Shift-JIS when every header and file name fits (what LR2 reads),
//   else CP949 (EZ2 conversions, Korean titles), else UTF-8 with a BOM; or
//   the encoding asked for, with what it cannot write listed.
//
// Not in BMS, and said: velocity and pan, and the records a game chart kept
// (scroll, volume...). EZ2PORT reads no BMS, so there is no oracle; the
// reason is in docs/ez2port-compat.md.

import { encodeLegacy, fitsLegacy } from '../legacy-text';
import type { OpenNote } from '../../lint/lint';
import type { ChartData, NoteId, NoteRec, Tier } from '../../model/types';
import { modeDef } from '../../modes/registry';
import type { ModeId } from '../../modes/ids';
import { ChartClock, chartSounds, type SampleLookup } from '../../publish/chart-plan';
import type { KeysoundRegistry } from '../../publish/keysounds';
import { inverseMap, type BmsChannelMap } from './convert';
import { bmsId } from './parse';

export type BmsTextEncoding = 'shift_jis' | 'euc-kr' | 'utf-8';

export class BmsWriteError extends Error {}

export interface BmsWriteOptions {
  mode: ModeId;
  tier: Tier;
  map: BmsChannelMap;
  /** 'auto' (default): Shift-JIS if everything fits, else CP949, else UTF-8. */
  encoding?: 'auto' | BmsTextEncoding;
  /** 'auto' (default): 36, or 62 past 1295 sounds. */
  base?: 'auto' | 36 | 62;
  /** The file each keysound (registry index) is written as, relative to the BMS. */
  soundFile: (def: number) => string;
  samples?: SampleLookup;
  stagefile?: string;
  preview?: string;
  /** A movie, shown from this position. */
  bga?: { file: string; y: number };
}

export interface BmsWritten {
  text: string;
  bytes: Uint8Array;
  encoding: BmsTextEncoding;
  base: 36 | 62;
  ext: '.bms' | '.bme';
  notes: OpenNote[];
  /** Characters the encoding could not write (as '?'). */
  unmappable: string[];
  /** Holds written a pulse short, to meet the next on their lane. */
  shortened: NoteId[];
}

const TIER_DIFFICULTY: Record<Tier, number> = { NM: 2, HD: 3, SHD: 4, EX: 5 };
const DOUBLE: ReadonlySet<ModeId> = new Set(['10k', '14k', 'andromeda', 'catch']);
const EOL = '\r\n';

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();

/** The texts a BMS holds that an encoding has to write. */
function texts(chart: ChartData, files: readonly string[]): string[] {
  const i = chart.info;
  return [i.title, i.subtitle, i.artist, i.genre, ...(i.subartists ?? []), ...files].map(
    (t) => t ?? '',
  );
}

/** 'auto': the first encoding every text fits. */
export function chooseBmsEncoding(all: readonly string[]): BmsTextEncoding {
  if (all.every((t) => fitsLegacy(t, 'shift_jis'))) return 'shift_jis';
  if (all.every((t) => fitsLegacy(t, 'euc-kr'))) return 'euc-kr';
  return 'utf-8';
}

export function encodeBmsText(
  text: string,
  enc: BmsTextEncoding,
): { bytes: Uint8Array; unmappable: string[] } {
  if (enc === 'utf-8') {
    const body = new TextEncoder().encode(text);
    const out = new Uint8Array(body.length + 3);
    out.set([0xef, 0xbb, 0xbf]);
    out.set(body, 3);
    return { bytes: out, unmappable: [] };
  }
  return encodeLegacy(text, enc);
}

interface Obj {
  measure: number;
  offset: number;
  channel: string;
  id: string;
}

export function writeBms(
  chart: ChartData,
  o: BmsWriteOptions,
  registry: KeysoundRegistry,
): BmsWritten {
  const notes: OpenNote[] = [];
  const say = (rule: string, severity: OpenNote['severity'], message: string) =>
    notes.push({ rule, severity, message });
  const info = chart.info;
  const res = info.resolution && info.resolution > 0 ? info.resolution : 240;
  const M = 4 * res;
  const clock = new ChartClock(chart);
  const { sounds } = chartSounds(chart, clock, registry, o.samples);

  // Keysound ids: the sounds this chart plays, in the song's order.
  const used = [...new Set(sounds.map((s) => s.ks))].sort((a, b) => a - b);
  const base: 36 | 62 =
    o.base === 36 || o.base === 62 ? o.base : used.length > 36 * 36 - 1 ? 62 : 36;
  const maxId = base * base - 1;
  if (used.length > maxId)
    throw new BmsWriteError(
      `${used.length} keysounds: a BMS names at most ${maxId}${base === 36 ? ' (base 36; base 62 takes 3843)' : ''}`,
    );
  const idOf = new Map(used.map((ks, i) => [ks, bmsId(i + 1, base)]));

  const objs: Obj[] = [];
  const at = (y: number) => ({ measure: Math.floor(y / M), offset: y - Math.floor(y / M) * M });
  const put = (y: number, channel: string, id: string) => objs.push({ ...at(y), channel, id });

  // Lanes and the background.
  const lanes = inverseMap(o.map, o.mode);
  const modeLanes = new Set(modeDef(o.mode).columns.map((c) => c.x));
  const background: { y: number; id: string }[] = [];
  const taps = new Map<string, NoteRec>(); // `${channel}@${y}`
  const holds = new Map<string, { n: NoteRec; id: string }[]>(); // by lane channel
  let unmapped = 0;
  let dupes = 0;
  let velPan = 0;
  for (const s of sounds) {
    const n = s.n;
    const id = idOf.get(s.ks)!;
    if ((n.vel !== undefined && n.vel !== 127) || (n.pan !== undefined && n.pan !== 64)) velPan++;
    const ch = n.x !== 0 && modeLanes.has(n.x) ? lanes.get(n.x) : undefined;
    if (!ch) {
      if (n.x !== 0) unmapped++;
      background.push({ y: n.y, id });
      continue;
    }
    if (n.l > 0) {
      const list = holds.get(ch) ?? [];
      list.push({ n, id });
      holds.set(ch, list);
      continue;
    }
    const k = `${ch}@${n.y}`;
    if (taps.has(k)) {
      dupes++;
      background.push({ y: n.y, id });
    } else {
      taps.set(k, n);
      put(n.y, ch, id);
    }
  }
  const shortened: NoteId[] = [];
  for (const [ch, list] of holds) {
    list.sort((a, b) => a.n.y - b.n.y);
    const lnCh = `${ch[0] === '1' ? '5' : '6'}${ch[1]}`;
    list.forEach(({ n, id }, i) => {
      let end = n.y + n.l;
      const next = list[i + 1];
      if (next && next.n.y <= end && end - 1 > n.y) {
        end = Math.min(end, next.n.y) - 1;
        shortened.push(n.id);
      }
      put(n.y, lnCh, id);
      put(end, lnCh, id);
    });
  }
  // Background: one 01 line per layer of sounds at one spot.
  const layers = new Map<number, number>();
  for (const b of background.sort((a, c) => a.y - c.y)) {
    const k = (layers.get(b.y) ?? 0) + 1;
    layers.set(b.y, k);
    objs.push({ ...at(b.y), channel: `01#${k}`, id: b.id });
  }

  // Tempo: the last change at a spot governs (as ChartClock reads it).
  const tempo = new Map<number, number>();
  let startBpm = info.initBpm && info.initBpm > 0 ? info.initBpm : 120;
  for (const e of chart.bpmEvents)
    if (e.bpm > 0 && Number.isFinite(e.bpm) && e.y >= 0) tempo.set(e.y, e.bpm);
  if (tempo.has(0)) {
    startBpm = tempo.get(0)!;
    tempo.delete(0);
  }
  const bpmDefs = new Map<number, string>();
  for (const [y, bpm] of [...tempo].sort((a, b) => a[0] - b[0])) {
    if (Number.isInteger(bpm) && bpm >= 1 && bpm <= 255)
      put(y, '03', bpm.toString(16).toUpperCase().padStart(2, '0'));
    else {
      if (!bpmDefs.has(bpm)) bpmDefs.set(bpm, bmsId(bpmDefs.size + 1, base));
      put(y, '08', bpmDefs.get(bpm)!);
    }
  }
  // STOPs: added together at a spot, in 1/192 of a measure.
  const stops = new Map<number, number>();
  for (const e of chart.stopEvents)
    if (e.duration > 0 && e.y >= 0) stops.set(e.y, (stops.get(e.y) ?? 0) + e.duration);
  const stopDefs = new Map<number, string>();
  let fractional = 0;
  for (const [y, d] of [...stops].sort((a, b) => a[0] - b[0])) {
    const v = (d * 48) / res;
    if (!Number.isInteger(v)) fractional++;
    if (!stopDefs.has(v)) stopDefs.set(v, bmsId(stopDefs.size + 1, base));
    put(y, '09', stopDefs.get(v)!);
  }
  if (bpmDefs.size > maxId || stopDefs.size > maxId)
    throw new BmsWriteError(`more than ${maxId} different tempi or stops`);
  if (o.bga) put(Math.max(0, Math.round(o.bga.y)), '04', '01');

  const last = objs.reduce((m, x) => Math.max(m, x.measure), 0);
  if (last > 999)
    throw new BmsWriteError(`measure ${last}: a BMS has measures 000-999 (${last + 1} needed)`);

  // Headers.
  const x = (k: string) => {
    const v = info.extra[`x_bms_${k}`];
    return typeof v === 'string' || typeof v === 'number' ? oneLine(String(v)) : undefined;
  };
  const lines: string[] = ['', '*---------------------- HEADER FIELD', ''];
  const h = (k: string, v: string | number | undefined) => {
    if (v !== undefined && String(v) !== '') lines.push(`#${k} ${oneLine(String(v))}`);
  };
  if (base === 62) h('BASE', 62);
  h('PLAYER', x('player') ?? (DOUBLE.has(o.mode) ? 3 : 1));
  h('GENRE', info.genre);
  h('TITLE', info.title);
  h('SUBTITLE', info.subtitle);
  h('ARTIST', info.artist);
  if (info.subartists?.length) h('SUBARTIST', info.subartists.join(' / '));
  h('BPM', startBpm);
  h('PLAYLEVEL', Math.round(info.level ?? 1));
  const rank = x('rank');
  if (rank !== undefined) h('RANK', rank);
  else if (x('defexrank') === undefined && info.judgeRank !== undefined && info.judgeRank !== 100)
    h('DEFEXRANK', info.judgeRank);
  else if (x('defexrank') === undefined) h('RANK', 2);
  h('DEFEXRANK', x('defexrank'));
  h('TOTAL', x('total'));
  h('DIFFICULTY', x('difficulty') ?? TIER_DIFFICULTY[o.tier]);
  h('STAGEFILE', o.stagefile);
  h('PREVIEW', o.preview);
  h('LNMODE', x('lnmode'));
  h('LNTYPE', 1);
  lines.push('');
  const files: string[] = [];
  for (const ks of used) {
    const f = o.soundFile(ks);
    files.push(f);
    lines.push(`#WAV${idOf.get(ks)} ${f}`);
  }
  if (o.bga) lines.push(`#BMP01 ${o.bga.file}`);
  for (const [v, id] of bpmDefs) lines.push(`#BPM${id} ${v}`);
  for (const [v, id] of stopDefs) lines.push(`#STOP${id} ${v}`);
  lines.push('', '*---------------------- MAIN DATA FIELD', '');

  // Objects, measure by measure: each line as few slots as place its objects.
  const byLine = new Map<string, Obj[]>();
  for (const ob of objs) {
    const k = `${String(ob.measure).padStart(3, '0')}${ob.channel}`;
    (byLine.get(k) ?? byLine.set(k, []).get(k)!).push(ob);
  }
  const order = (c: string) => (c.startsWith('01#') ? `0${c.slice(3).padStart(5, '0')}` : c);
  const keys = [...byLine.keys()].sort((a, b) => {
    const ma = a.slice(0, 3);
    const mb = b.slice(0, 3);
    return ma === mb ? order(a.slice(3)).localeCompare(order(b.slice(3))) : ma.localeCompare(mb);
  });
  for (const k of keys) {
    const list = byLine.get(k)!;
    const step = list.reduce((g, ob) => gcd(g, ob.offset), M);
    const slots = new Array<string>(M / step).fill('00');
    for (const ob of list) slots[ob.offset / step] = ob.id;
    lines.push(`#${k.slice(0, 3)}${k.slice(3, 5)}:${slots.join('')}`);
  }
  lines.push('');
  const text = lines.join(EOL);

  // Text.
  const all = [...texts(chart, files), o.stagefile ?? '', o.preview ?? '', o.bga?.file ?? ''];
  const encoding =
    o.encoding && o.encoding !== 'auto' ? o.encoding : chooseBmsEncoding(all.filter(Boolean));
  const { bytes, unmappable } = encodeBmsText(text, encoding);

  // What a BMS has no place for.
  if (unmappable.length)
    say(
      'bms-encoding',
      'warning',
      `${unmappable.join(' ')} cannot be written in ${encoding === 'euc-kr' ? 'EUC-KR (CP949)' : 'Shift-JIS'}: written as ?`,
    );
  if (velPan)
    say(
      'bms-velpan',
      'info',
      `${velPan} notes have a velocity or pan: BMS has neither, so they play at full volume, centred`,
    );
  if (unmapped)
    say(
      'bms-lanes',
      'warning',
      `${unmapped} notes are on lanes the ${o.map.label} map has no channel for: written as background`,
    );
  if (dupes)
    say(
      'bms-lanes',
      'warning',
      `${dupes} notes share a lane and a spot with another: written as background`,
    );
  if (shortened.length)
    say(
      'bms-holds',
      'warning',
      `${shortened.length} long notes end where the next on their lane starts: written a pulse shorter, as BMS cannot put both there`,
    );
  if (fractional)
    say(
      'bms-stop',
      'info',
      `${fractional} STOPs are not a whole number of 1/192 measures: written as decimals (beatoraja reads them; LR2 rounds them down)`,
    );
  if (Array.isArray(chart.extra.x_ez_records) && chart.extra.x_ez_records.length)
    say(
      'bms-kept',
      'info',
      `The game chart's own records (scroll, volume...) are not written: BMS has no place for them`,
    );
  const ext = [...byLine.keys()].some((k) => /^\d{3}[1256][789]$/.test(k)) ? '.bme' : '.bms';
  return { text, bytes, encoding, base, ext, notes, unmappable, shortened };
}

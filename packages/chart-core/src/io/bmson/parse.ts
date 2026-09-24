// bmson 1.0 -> ChartData.
//
// Lenient where it can afford to be and lossless everywhere: a member EZ2BMS
// does not know is kept in the object's `extra`; a known member with the wrong
// type (a level written as "12", say) is also kept verbatim in `extra`, left
// undefined in the model, and reported, so the file round-trips and lint can
// say what is wrong with it. bmson 0.21 is read by upgrading it to 1.0 first
// (./v021.ts); only a document that is neither is refused.

import type {
  BarLine,
  BgaData,
  BgaEvent,
  BgaHeader,
  BpmEvent,
  ChartData,
  ChartInfo,
  Extra,
  NoteRec,
  SoundChannel,
  ScrollEvent,
  StopEvent,
  Tier,
} from '../../model/types';
import { decodeUtf8 } from '../text';
import { isBmson021, upgradeBmson021 } from './v021';

export class BmsonError extends Error {}

export interface ParseWarning {
  /** JSON path, e.g. `$.sound_channels[3].notes[12].y`. */
  path: string;
  message: string;
}

export interface ParseResult {
  chart: ChartData;
  warnings: ParseWarning[];
  /** The file started with a UTF-8 BOM (EZ2BMS will not write one back). */
  hadBom: boolean;
  /** The bmson version the file was written in, when it was read by upgrading it ("0.21"). */
  upgradedFrom?: string;
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

class Reader {
  warnings: ParseWarning[] = [];

  warn(path: string, message: string): void {
    this.warnings.push({ path, message });
  }

  /** Copy every member not in `known` into a new extra (undefined if none). */
  rest(o: Obj, known: ReadonlySet<string>): Extra | undefined {
    let extra: Extra | undefined;
    for (const [k, v] of Object.entries(o)) {
      if (known.has(k)) continue;
      (extra ??= {})[k] = v;
    }
    return extra;
  }

  /** Read a typed member; on a type mismatch keep it in `extra` and warn. */
  typed<T>(
    o: Obj,
    key: string,
    check: (v: unknown) => v is T,
    what: string,
    extra: Extra,
    path: string,
  ): T | undefined {
    if (!(key in o)) return undefined;
    const v = o[key];
    if (check(v)) return v;
    extra[key] = v;
    this.warn(`${path}.${key}`, `expected ${what}; kept as written`);
    return undefined;
  }
}

const str = (v: unknown): v is string => typeof v === 'string';
const strArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(str);
const TIERS: readonly Tier[] = ['NM', 'HD', 'SHD', 'EX'];
const tier = (v: unknown): v is Tier => typeof v === 'string' && (TIERS as string[]).includes(v);

// Exactly these four numeric members; anything else and the whole object is
// kept verbatim (a model field would drop the extra members on save).
function deltas<K extends string>(keys: readonly K[]) {
  return (v: unknown): v is Record<K, number> =>
    isObj(v) && Object.keys(v).length === keys.length && keys.every((k) => isNum(v[k]));
}
const isJudgement = deltas(['KOOL', 'COOL', 'GOOD', 'MISS'] as const);
const isLife = deltas(['COOL', 'GOOD', 'MISS', 'FAIL'] as const);

const INFO_KEYS = new Set([
  'title',
  'subtitle',
  'artist',
  'subartists',
  'genre',
  'mode_hint',
  'chart_name',
  'level',
  'init_bpm',
  'judge_rank',
  'total',
  'back_image',
  'eyecatch_image',
  'title_image',
  'banner_image',
  'preview_music',
  'resolution',
  'judgement_deltas',
  'life_deltas',
  'x_tier',
]);
const ROOT_KEYS = new Set([
  'version',
  'info',
  'lines',
  'bpm_events',
  'stop_events',
  'sound_channels',
  'bga',
]);
const SCROLL_KEYS = new Set(['y', 'rate']);
const CHANNEL_KEYS = new Set(['name', 'notes', 'x_color']);
const NOTE_KEYS = new Set(['x', 'y', 'l', 'c', 'up', 'x_stop', 'x_vel', 'x_pan', 'x_kind']);
const Y_KEYS = new Set(['y']);
const BPM_KEYS = new Set(['y', 'bpm']);
const STOP_KEYS = new Set(['y', 'duration']);
const BGA_KEYS = new Set(['bga_header', 'bga_events', 'layer_events', 'poor_events']);
const BGA_HEADER_KEYS = new Set(['id', 'name']);
const BGA_EVENT_KEYS = new Set(['y', 'id']);

function readInfo(r: Reader, o: unknown): ChartInfo {
  if (!isObj(o)) {
    r.warn('$.info', 'missing or not an object');
    return { extra: {} };
  }
  const extra: Extra = r.rest(o, INFO_KEYS) ?? {};
  const p = '$.info';
  const s = (k: string) => r.typed(o, k, str, 'a string', extra, p);
  const n = (k: string) => r.typed(o, k, isNum, 'a number', extra, p);
  const info: ChartInfo = { extra };
  const set = <K extends keyof ChartInfo>(k: K, v: ChartInfo[K] | undefined) => {
    if (v !== undefined) info[k] = v;
  };
  set('title', s('title'));
  set('subtitle', s('subtitle'));
  set('artist', s('artist'));
  set('subartists', r.typed(o, 'subartists', strArr, 'an array of strings', extra, p));
  set('genre', s('genre'));
  set('modeHint', s('mode_hint'));
  set('chartName', s('chart_name'));
  set('level', n('level'));
  set('initBpm', n('init_bpm'));
  set('judgeRank', n('judge_rank'));
  set('total', n('total'));
  set('backImage', s('back_image'));
  set('eyecatchImage', s('eyecatch_image'));
  set('titleImage', s('title_image'));
  set('bannerImage', s('banner_image'));
  set('previewMusic', s('preview_music'));
  set('resolution', n('resolution'));
  const jd = r.typed(
    o,
    'judgement_deltas',
    isJudgement,
    'exactly KOOL/COOL/GOOD/MISS numbers',
    extra,
    p,
  );
  if (jd) set('judgementDeltas', { KOOL: jd.KOOL, COOL: jd.COOL, GOOD: jd.GOOD, MISS: jd.MISS });
  const ld = r.typed(o, 'life_deltas', isLife, 'exactly COOL/GOOD/MISS/FAIL numbers', extra, p);
  if (ld) set('lifeDeltas', { COOL: ld.COOL, GOOD: ld.GOOD, MISS: ld.MISS, FAIL: ld.FAIL });
  set('tier', r.typed(o, 'x_tier', tier, 'NM, HD, SHD or EX', extra, p));
  return info;
}

function readTimed<T extends { y: number; extra?: Extra }>(
  r: Reader,
  arr: unknown,
  path: string,
  known: ReadonlySet<string>,
  build: (o: Obj, extra: Extra | undefined, path: string) => T | undefined,
): T[] {
  if (arr === undefined) return [];
  if (!Array.isArray(arr)) {
    r.warn(path, 'not an array; ignored');
    return [];
  }
  const out: T[] = [];
  arr.forEach((o, i) => {
    const p = `${path}[${i}]`;
    if (!isObj(o) || !isNum(o.y)) {
      r.warn(p, 'not an event with a numeric y; dropped');
      return;
    }
    const ev = build(o, r.rest(o, known), p);
    if (ev) out.push(ev);
  });
  return out;
}

export interface ParseOptions {
  /** First id to hand out; lets several charts share an id space. */
  firstNoteId?: number;
  firstChannelId?: number;
}

export function parseBmson(input: Uint8Array | string, opts: ParseOptions = {}): ParseResult {
  let text: string;
  let hadBom: boolean;
  if (typeof input === 'string') {
    hadBom = input.charCodeAt(0) === 0xfeff;
    text = hadBom ? input.slice(1) : input;
  } else {
    ({ text, hadBom } = decodeUtf8(input));
  }
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    throw new BmsonError(`not JSON: ${(e as Error).message}`);
  }
  if (!isObj(doc)) throw new BmsonError('not a JSON object');
  let upgradedFrom: string | undefined;
  if (isBmson021(doc)) {
    doc = upgradeBmson021(doc);
    upgradedFrom = '0.21';
  }
  if (!isObj(doc) || typeof doc.version !== 'string') {
    throw new BmsonError('no "version", and not bmson 0.21 either: not a bmson EZ2BMS can read');
  }

  const r = new Reader();
  const info = readInfo(r, doc.info);

  const lines =
    doc.lines === undefined
      ? null
      : readTimed<BarLine>(r, doc.lines, '$.lines', Y_KEYS, (o, extra) =>
          withExtra({ y: o.y as number }, extra),
        );

  const bpmEvents = readTimed<BpmEvent>(r, doc.bpm_events, '$.bpm_events', BPM_KEYS, (o, x, p) => {
    if (!isNum(o.bpm)) {
      r.warn(p, 'BPM event without a numeric bpm; dropped');
      return undefined;
    }
    return withExtra({ y: o.y as number, bpm: o.bpm }, x);
  });

  const stopEvents = readTimed<StopEvent>(
    r,
    doc.stop_events,
    '$.stop_events',
    STOP_KEYS,
    (o, x, p) => {
      if (!isNum(o.duration)) {
        r.warn(p, 'stop without a numeric duration; dropped');
        return undefined;
      }
      return withExtra({ y: o.y as number, duration: o.duration }, x);
    },
  );

  const rawScroll = Array.isArray(doc.x_scroll_events) ? doc.x_scroll_events : undefined;
  const scrollEvents = readTimed<ScrollEvent>(
    r,
    rawScroll,
    '$.x_scroll_events',
    SCROLL_KEYS,
    (o, x, p) => {
      if (!isNum(o.rate)) {
        r.warn(p, 'scroll change without a numeric rate; dropped');
        return undefined;
      }
      return withExtra({ y: o.y as number, rate: o.rate }, x);
    },
  ).sort((a, b) => a.y - b.y);

  const channels: SoundChannel[] = [];
  const notes: NoteRec[] = [];
  let nextNote = opts.firstNoteId ?? 1;
  let nextCh = opts.firstChannelId ?? 1;
  if (doc.sound_channels !== undefined && !Array.isArray(doc.sound_channels)) {
    r.warn('$.sound_channels', 'not an array; ignored');
  }
  const rawChannels = Array.isArray(doc.sound_channels) ? doc.sound_channels : [];
  rawChannels.forEach((c, ci) => {
    const cp = `$.sound_channels[${ci}]`;
    if (!isObj(c)) {
      r.warn(cp, 'not an object; dropped');
      return;
    }
    const extra = r.rest(c, CHANNEL_KEYS) ?? {};
    const name = r.typed(c, 'name', str, 'a string', extra, cp) ?? '';
    const color = r.typed(c, 'x_color', str, 'a string', extra, cp);
    const ch: SoundChannel = { id: nextCh++, name };
    if (color !== undefined) ch.color = color;
    if (Object.keys(extra).length) ch.extra = extra;
    channels.push(ch);
    const rawNotes = c.notes === undefined ? [] : c.notes;
    if (!Array.isArray(rawNotes)) {
      r.warn(`${cp}.notes`, 'not an array; ignored');
      return;
    }
    rawNotes.forEach((n, ni) => {
      const np = `${cp}.notes[${ni}]`;
      if (!isObj(n) || !isNum(n.x) || !isNum(n.y)) {
        r.warn(np, 'note without numeric x and y; dropped');
        return;
      }
      const nx = r.rest(n, NOTE_KEYS) ?? {};
      // l and c are required by bmson and always present in the model, so a
      // wrongly typed one cannot be kept verbatim: it falls back to the default.
      if ('l' in n && !isNum(n.l)) r.warn(`${np}.l`, 'expected a number; replaced with 0');
      if ('c' in n && typeof n.c !== 'boolean')
        r.warn(`${np}.c`, 'expected a boolean; replaced with false');
      const note: NoteRec = {
        id: nextNote++,
        ch: ch.id,
        x: n.x,
        y: n.y,
        l: isNum(n.l) ? n.l : 0,
        c: typeof n.c === 'boolean' ? n.c : false,
      };
      const up = r.typed(n, 'up', (v): v is boolean => typeof v === 'boolean', 'a boolean', nx, np);
      if (up !== undefined) note.up = up;
      const xStop = r.typed(n, 'x_stop', isNum, 'a number', nx, np);
      if (xStop !== undefined) note.xStop = xStop;
      const byte = (v: unknown): v is number =>
        Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 255;
      const vel = r.typed(n, 'x_vel', byte, 'an integer 0-255', nx, np);
      if (vel !== undefined) note.vel = vel;
      const pan = r.typed(n, 'x_pan', byte, 'an integer 0-255', nx, np);
      if (pan !== undefined) note.pan = pan;
      const kind = r.typed(n, 'x_kind', byte, 'an integer 0-255', nx, np);
      if (kind !== undefined) note.kind = kind;
      if (Object.keys(nx).length) note.extra = nx;
      notes.push(note);
    });
  });

  let bga: BgaData | null = null;
  if (doc.bga !== undefined) {
    if (!isObj(doc.bga)) {
      r.warn('$.bga', 'not an object; ignored');
    } else {
      const b = doc.bga;
      const headerArr = Array.isArray(b.bga_header) ? b.bga_header : [];
      const header: BgaHeader[] = [];
      headerArr.forEach((h, i) => {
        const hp = `$.bga.bga_header[${i}]`;
        if (!isObj(h) || !isNum(h.id) || !str(h.name)) {
          r.warn(hp, 'BGA header without numeric id and string name; dropped');
          return;
        }
        header.push(withExtra({ id: h.id, name: h.name }, r.rest(h, BGA_HEADER_KEYS)));
      });
      const ev = (key: string) =>
        readTimed<BgaEvent>(r, b[key], `$.bga.${key}`, BGA_EVENT_KEYS, (o, x, p) => {
          if (!isNum(o.id)) {
            r.warn(p, 'BGA event without a numeric id; dropped');
            return undefined;
          }
          return withExtra({ y: o.y as number, id: o.id }, x);
        });
      bga = withExtra(
        { header, bga: ev('bga_events'), layer: ev('layer_events'), poor: ev('poor_events') },
        r.rest(b, BGA_KEYS),
      );
    }
  }

  const absent = (['bpm_events', 'stop_events', 'sound_channels'] as const).filter(
    (k) => !(k in doc),
  );
  const extra = r.rest(doc, ROOT_KEYS) ?? {};
  // The model holds x_scroll_events once it has something in it; until then
  // the member stays as the file had it (an empty array, or something that
  // was not an array), so an unedited save gives the same bytes.
  if (scrollEvents.length) delete extra.x_scroll_events;
  else if (doc.x_scroll_events !== undefined && !rawScroll)
    r.warn('$.x_scroll_events', 'not a list of scroll changes; kept as it is');
  const chart: ChartData = {
    version: doc.version,
    info,
    lines,
    bpmEvents,
    stopEvents,
    scrollEvents,
    channels,
    notes,
    bga,
    extra,
  };
  if (absent.length) chart.absent = [...absent];
  return { chart, warnings: r.warnings, hadBom, ...(upgradedFrom ? { upgradedFrom } : {}) };
}

function withExtra<T extends object>(v: T, extra: Extra | undefined): T & { extra?: Extra } {
  return extra ? { ...v, extra } : v;
}

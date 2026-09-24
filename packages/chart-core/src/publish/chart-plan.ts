// Compile one chart into exactly what EZ2PORT will load: EZFF records on
// tracks, a keysound table, the chart .ini values - and the timed events the
// editor plays, so preview and publish can never disagree.
//
// The rules are EZ2PORT's importer's (ez2/bmson.c walk_channels), with the
// deviations listed in docs/ez2port-compat.md:
// - positions -> ticks with STOPs as gaps (TickConverter), holds shifted as a
//   whole; tempo from the published f32 records (EngineTempo), so slice cuts
//   fall where the engine will start each note;
// - per channel, in position order: a continuation plays the sample from
//   `t - t(last fresh hit)`, a slice runs to the channel's next note, and a
//   fresh hit not followed by a continuation plays the whole file;
// - lanes go to their mode track; everything else (background, lanes the
//   mode lacks) to a voice-aware backing track;
// - a closing tempo record keeps the stage open until the last sound ends
//   (EZ2PORT ends a stage 26 frames after its last record).
//
// `target: 'cabinet'` compiles for the original game instead (M6, publish/
// cabinet.ts): a chart imported from the game keeps what the import kept of
// it - its background tracks (`x_track`, so the one-voice-per-track cuts are
// the original's), the raw length of background notes (`x_len`), the records
// bmson has no place for (`x_ez_records`: scroll, volume, beats, marks), its
// header names in CP949, its second BPM, track count and length - so an
// unedited chart goes back as the game had it, record for record (the
// cabinet oracle test). Anything new is placed around it. EZ2PORT packages
// never read any of that; publish-golden.test.ts pins their bytes.

import type { ChartData, NoteId, NoteRec } from '../model/types';
import {
  EZ_BPM,
  EZ_NOTE,
  EZ_VOLUME,
  HOLD_BIAS,
  nameField,
  type EzffChart,
  type EzffRecord,
  type EzffVersion,
} from '../io/ez/ezff';
import { cp949Field } from '../io/legacy-text';
import { EngineTempo } from '../timing/engine-tempo';
import { EZ_SCROLL_TYPE, scrollEventsOf, scrollPlacement, wordFromF32 } from '../timing/scroll';
import { TICKS_PER_BEAT, TICKS_PER_MEASURE, TickConverter } from '../timing/ticks';
import type { Column } from '../modes/registry';
import { BackingAllocator } from './tracks';
import { KeysoundRegistry, OUT_RATE } from './keysounds';

export interface SampleInfo {
  /** Length in frames once converted to 44.1 kHz. */
  frames: number;
}

export type SampleLookup = (src: string) => SampleInfo | undefined;

export interface PlanEvent {
  tick: number;
  ms: number;
  track: number;
  /** Lane for a playable note, 0 for background. */
  x: number;
  lane: boolean;
  /** Song-wide keysound index (KeysoundRegistry). */
  keysound: number;
  vel: number;
  pan: number;
  holdTicks: number;
  kind: number;
  /** The bmson note it came from. */
  noteId: NoteId;
  /**
   * For playback: when the sample it plays from would have started (its fresh
   * hit; `ms` itself for a whole sample), and when the slice ends (the next
   * note on the channel; null plays out). The audio engine derives slice bounds
   * from these times, so a chain of slices joins without a gap at any rate.
   */
  originMs: number;
  untilMs: number | null;
}

export interface ChartPlanStats {
  notes: number;
  holds: number;
  backing: number;
  slices: number;
  /** Notes on lanes the mode does not have (published as background). */
  offMode: number;
  /** BmsTWO `up` notes dropped (EZ2 has no release re-trigger). */
  droppedUp: number;
  /** Background sounds that had to share a still-ringing track. */
  chokes: number;
  /** Largest pulse -> tick rounding, in ticks. */
  worstRounding: number;
}

/** What a cabinet compile kept of the game's chart, and where it had to differ. */
export interface CabinetPlanStats {
  /** Background notes on the track the game had them on. */
  pinned: number;
  /** Background notes whose track could not be kept (a lane track in this mode, out of range). */
  repinned: number;
  /** Pinned sounds that start while an earlier pinned sound on their track rings (the original's own cuts). */
  pinnedCuts: number;
  /** Records written back from `x_ez_records`. */
  kept: number;
  /** Scroll changes written (type 6, each on its own track with its own second word). */
  scroll: number;
  /** Tracks added past the game chart's count because every track was busy. */
  grown: number;
  /** Characters of the header names CP949 has no bytes for (written as '?'). */
  nameUnmappable: string[];
}

export interface ChartPlan {
  ezff: EzffChart;
  tempo: EngineTempo;
  /** Keysound slots of this chart: slot n (1-based) plays registry index keysoundSlots[n-1]. */
  keysoundSlots: number[];
  /** Every published note record, in time order. */
  events: PlanEvent[];
  /** When the last sound ends, ms. */
  endMs: number;
  stats: ChartPlanStats;
  /** Set for `target: 'cabinet'`. */
  cabinet?: CabinetPlanStats;
}

export interface CompileOptions {
  /** The mode's columns (from the registry, or the user's .gds). */
  columns: readonly Column[];
  /** Header name; the song key is safest (plain ASCII). */
  name: string;
  keysounds: KeysoundRegistry;
  samples?: SampleLookup;
  version?: EzffVersion;
  /** 'port' (default): an EZ2PORT package. 'cabinet': the original game's layout (see the header). */
  target?: 'port' | 'cabinet';
}

const f32 = Math.fround;
/** EZ2PORT's importer never cuts a slice shorter than 0.5 ms. */
export const MIN_SLICE_FRAMES = Math.round(0.0005 * OUT_RATE);

/** Whole 44.1 kHz frames between two song times - how slices are cut. */
export function framesBetween(fromMs: number, toMs: number): number {
  return Math.round(((toMs - fromMs) * OUT_RATE) / 1000);
}

/**
 * A chart's time as EZ2PORT will keep it: positions to ticks with STOPs as
 * gaps, the tempo from the published f32 records (the header holds the BPM at
 * tick 0, later changes are records; two at one tick, the later wins).
 */
export class ChartClock {
  readonly resolution: number;
  readonly ticks: TickConverter;
  readonly tempo: EngineTempo;
  readonly headerBpm: number;
  readonly tempoRecords: EzffRecord[];
  /** Largest pulse -> tick rounding met so far, in ticks. */
  worstRounding = 0;

  constructor(chart: ChartData) {
    const res = chart.info.resolution && chart.info.resolution > 0 ? chart.info.resolution : 240;
    this.resolution = res;
    this.ticks = new TickConverter(res, chart.stopEvents);
    let headerBpm = chart.info.initBpm && chart.info.initBpm > 0 ? chart.info.initBpm : 120;
    const bpmAt = new Map<number, number>();
    const bpmSorted = chart.bpmEvents
      .map((e, i) => ({ ...e, i }))
      .filter((e) => e.bpm > 0 && Number.isFinite(e.bpm))
      .sort((a, b) => a.y - b.y || a.i - b.i);
    for (const e of bpmSorted) {
      const tick = this.tick(e.y);
      if (tick === 0) headerBpm = e.bpm;
      else bpmAt.set(tick, e.bpm);
    }
    this.headerBpm = headerBpm;
    this.tempoRecords = [...bpmAt]
      .sort((a, b) => a[0] - b[0])
      .map(([tick, bpm]) => ({ tick, type: EZ_BPM, bpm: f32(bpm) }));
    this.tempo = new EngineTempo(
      headerBpm,
      this.tempoRecords.map((r) => ({ tick: r.tick, bpm: r.bpm! })),
    );
  }

  /** The EZ2 tick of a position. */
  tick(y: number): number {
    const r = this.ticks.tick(y);
    if (r.err > this.worstRounding) this.worstRounding = r.err;
    return r.tick;
  }

  /** Song milliseconds at a tick. */
  msAt(tick: number): number {
    return this.tempo.msAt(tick);
  }
}

/** One note of a channel, as the sound it plays. */
export interface ChannelEvent {
  n: NoteRec;
  tick: number;
  ms: number;
  /**
   * The keysound it plays, as frames of the source at 44.1 kHz: a whole
   * sample is [0, null); a slice starts `startF` into the sample and ends at
   * `endF` (null: plays out).
   */
  whole: boolean;
  startF: number;
  endF: number | null;
  /** When the sample it plays from would have started (its fresh hit; `ms` for a whole sample). */
  originMs: number;
  /** When the slice ends (the channel's next note); null plays out. */
  untilMs: number | null;
}

/** The order notes of one channel sound in, and the order the plan lists events in. */
export const byPosition = (a: NoteRec, b: NoteRec): number => a.y - b.y || a.x - b.x || a.id - b.id;

/**
 * One channel's notes as sounds (the importer's walk_channels): in position
 * order, a continuation plays the sample from `t - t(last fresh hit)`, a slice
 * runs to the channel's next note (at least MIN_SLICE_FRAMES), and a fresh
 * hit not followed by a continuation plays the whole file. A leading
 * continuation has nothing to continue and is a fresh hit.
 */
export function channelEvents(clock: ChartClock, notes: readonly NoteRec[]): ChannelEvent[] {
  const sorted = [...notes].sort(byPosition);
  const ticks = sorted.map((n) => clock.tick(n.y));
  const ms = ticks.map((t) => clock.msAt(t));
  const out: ChannelEvent[] = [];
  let anchor = -1;
  sorted.forEach((n, i) => {
    const t = ms[i]!;
    if (!(n.c && anchor >= 0)) anchor = t;
    const startF = framesBetween(anchor, t);
    const last = i + 1 >= sorted.length;
    const nextCont = !last && sorted[i + 1]!.c;
    const whole = startF === 0 && !nextCont;
    const endF =
      whole || last ? null : Math.max(framesBetween(anchor, ms[i + 1]!), startF + MIN_SLICE_FRAMES);
    out.push({
      n,
      tick: ticks[i]!,
      ms: t,
      whole,
      startF: whole ? 0 : startF,
      endF,
      originMs: whole ? t : anchor,
      untilMs:
        whole || last ? null : Math.max(ms[i + 1]!, t + (MIN_SLICE_FRAMES * 1000) / OUT_RATE),
    });
  });
  return out;
}

/** Plan order: by tick, then lane, then note - the order records are written and events fire. */
export const planOrder = (
  a: { tick: number; n: NoteRec },
  b: { tick: number; n: NoteRec },
): number => a.tick - b.tick || a.n.x - b.n.x || a.n.id - b.n.id;

/** One note as the sound it plays, placed in time: what the compiler turns into a record. */
export interface PlannedSound {
  n: NoteRec;
  tick: number;
  ms: number;
  /** Song-wide keysound index (KeysoundRegistry). */
  ks: number;
  /** How long it rings, ms (Infinity when the sample's length is unknown). */
  durMs: number;
  originMs: number;
  untilMs: number | null;
  whole: boolean;
}

/**
 * Every note as a sound, in plan order: channel by channel (so keysounds are
 * registered, and slots numbered, in the same order every time), then sorted
 * by tick, lane and note. Shared by the EZ2PORT and cabinet compiles and the
 * BMS export, which all cut the same keysounds.
 */
export function chartSounds(
  chart: ChartData,
  clock: ChartClock,
  keysounds: KeysoundRegistry,
  samples?: SampleLookup,
): { sounds: PlannedSound[]; slices: number; droppedUp: number } {
  let slices = 0;
  let droppedUp = 0;
  const sounds: PlannedSound[] = [];
  const byChannel = new Map<number, NoteRec[]>();
  for (const n of chart.notes) {
    // An `up` note is still a note; only its re-trigger at the release is
    // dropped (EZ2 has none). EZ2PORT's importer drops the whole note.
    if (n.up) droppedUp++;
    const list = byChannel.get(n.ch);
    if (list) list.push(n);
    else byChannel.set(n.ch, [n]);
  }
  for (const ch of chart.channels) {
    for (const e of channelEvents(clock, byChannel.get(ch.id) ?? [])) {
      const ks = keysounds.get(ch.name, e.startF, e.endF);
      if (!e.whole) slices++;
      const info = samples?.(ch.name);
      const durFrames = e.whole
        ? (info?.frames ?? Infinity)
        : e.endF === null
          ? Math.max(0, (info?.frames ?? Infinity) - e.startF)
          : e.endF - e.startF;
      sounds.push({
        n: e.n,
        tick: e.tick,
        ms: e.ms,
        ks,
        durMs: (durFrames * 1000) / OUT_RATE,
        originMs: e.originMs,
        untilMs: e.untilMs,
        whole: e.whole,
      });
    }
  }
  sounds.sort(planOrder);
  return { sounds, slices, droppedUp };
}

/** The game chart's header as the import kept it (`x_ez`), if this chart came from the game. */
interface GameHeader {
  name: string;
  name2: string;
  bpm: number;
  bpm2: number;
  totalTicks: number;
  /** The game chart's last record (undefined: imported before EZ2BMS kept it). */
  lastTick?: number;
  tracks: number;
}

function gameHeader(chart: ChartData): GameHeader | undefined {
  const x = chart.extra.x_ez;
  if (!x || typeof x !== 'object' || Array.isArray(x)) return undefined;
  const o = x as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    name: str(o.name),
    name2: str(o.name2),
    bpm: num(o.bpm, NaN),
    bpm2: num(o.bpm2, NaN),
    totalTicks: Math.max(0, Math.floor(num(o.total_ticks, 0))),
    ...(typeof o.last_tick === 'number' ? { lastTick: o.last_tick } : {}),
    tracks: Math.min(96, Math.max(1, Math.floor(num(o.tracks, 64)))),
  };
}

/** The records the import kept with no bmson home (`x_ez_records`), as EZFF records on their tracks. */
function keptRecords(chart: ChartData, clock: ChartClock): { track: number; rec: EzffRecord }[] {
  const list = chart.extra.x_ez_records;
  if (!Array.isArray(list)) return [];
  const out: { track: number; rec: EzffRecord }[] = [];
  const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : undefined);
  for (const k of list) {
    if (!k || typeof k !== 'object') continue;
    const o = k as Record<string, unknown>;
    const track = int(o.track);
    const type = int(o.type);
    const y = typeof o.y === 'number' && Number.isFinite(o.y) ? o.y : undefined;
    if (
      track === undefined ||
      track < 0 ||
      track >= 96 ||
      !type ||
      type < 1 ||
      type > 255 ||
      y === undefined ||
      y < 0
    )
      continue;
    const rec: EzffRecord = { tick: clock.tick(y), type };
    const value = int(o.value);
    if (value !== undefined) rec.value = value & 0xff;
    if (typeof o.bpm === 'number') rec.bpm = f32(o.bpm);
    const raw = o.raw;
    if (Array.isArray(raw) && raw.length === 2 && raw.every((w) => int(w) !== undefined))
      rec.raw = [raw[0] >>> 0, raw[1] >>> 0];
    else if (typeof o.scroll === 'number') {
      // Only the decoded multiplier: its f32 bits are the first word.
      const dv = new DataView(new ArrayBuffer(4));
      dv.setFloat32(0, o.scroll, true);
      rec.raw = [dv.getUint32(0, true), 0];
    }
    out.push({ track, rec });
  }
  return out;
}

/**
 * The chart's scroll changes as type-6 records: the multiplier's f32 in the
 * first word (what the port reads, reference/play.c), each on the track and
 * with the second word it was imported with (0 and 0 for a new one).
 */
function scrollRecords(chart: ChartData, clock: ChartClock): { track: number; rec: EzffRecord }[] {
  return chart.scrollEvents.map((e) => {
    const { track, raw1 } = scrollPlacement(e);
    return {
      track,
      rec: { tick: clock.tick(e.y), type: EZ_SCROLL_TYPE, raw: [wordFromF32(e.rate), raw1] },
    };
  });
}

export function compileChart(chart: ChartData, o: CompileOptions): ChartPlan {
  const clock = new ChartClock(chart);
  const tc = clock.ticks;
  const stats: ChartPlanStats = {
    notes: 0,
    holds: 0,
    backing: 0,
    slices: 0,
    offMode: 0,
    droppedUp: 0,
    chokes: 0,
    worstRounding: 0,
  };
  const headerBpm = clock.headerBpm;
  const tempoRecords = clock.tempoRecords;
  const tempo = clock.tempo;
  const msOf = (tick: number) => tempo.msAt(tick);

  // ---- notes -> keysounds and records
  const trackOf = new Map(o.columns.map((c) => [c.x, c.track]));
  const laneTracks = new Set(o.columns.map((c) => c.track));
  const slotOf = new Map<number, number>();
  const keysoundSlots: number[] = [];
  const slot = (ks: number) => {
    let s = slotOf.get(ks);
    if (s === undefined) {
      keysoundSlots.push(ks);
      slotOf.set(ks, (s = keysoundSlots.length));
    }
    return s;
  };

  const walked = chartSounds(chart, clock, o.keysounds, o.samples);
  const pending = walked.sounds;
  stats.slices = walked.slices;
  stats.droppedUp = walked.droppedUp;

  // ---- the cabinet: what the game's chart keeps
  const cabinet: CabinetPlanStats | undefined =
    o.target === 'cabinet'
      ? { pinned: 0, repinned: 0, pinnedCuts: 0, kept: 0, scroll: 0, grown: 0, nameUnmappable: [] }
      : undefined;
  const game = cabinet ? gameHeader(chart) : undefined;
  const kept = cabinet ? [...keptRecords(chart, clock), ...scrollRecords(chart, clock)] : [];
  const pinOf = new Map<PlannedSound, number>();
  if (cabinet) {
    for (const p of pending) {
      if (p.n.x !== 0 && trackOf.has(p.n.x)) continue;
      const t = p.n.extra?.x_track;
      if (typeof t !== 'number') continue;
      if (Number.isInteger(t) && t >= 0 && t < 96 && !laneTracks.has(t)) pinOf.set(p, t);
      else cabinet.repinned++;
    }
  }
  let trackCount = 64;
  if (game) {
    trackCount = Math.max(
      game.tracks,
      ...[...laneTracks, ...pinOf.values(), ...kept.map((k) => k.track)].map((t) => t + 1),
    );
  }
  const backing = new BackingAllocator(laneTracks, trackCount, {
    maxTracks: cabinet ? Math.max(trackCount, 64) : trackCount,
  });
  if (cabinet) backing.avoid(kept.filter((k) => k.rec.type === EZ_VOLUME).map((k) => k.track));

  const tracks: EzffRecord[][] = Array.from({ length: Math.max(trackCount, 64) }, () => []);
  tracks[0]!.push(...tempoRecords);
  for (const k of kept) tracks[k.track]!.push(k.rec);
  // A package carries every scroll change on track 0 - the port collects
  // them from any track (reference/play.c) - including those an older import
  // kept as records. The cabinet has them on their own tracks (above).
  if (!cabinet)
    for (const s of scrollEventsOf(chart))
      tracks[0]!.push({
        tick: clock.tick(s.y),
        type: EZ_SCROLL_TYPE,
        raw: [wordFromF32(s.rate), 0],
      });
  if (cabinet) {
    cabinet.scroll = chart.scrollEvents.length;
    cabinet.kept = kept.length - cabinet.scroll;
  }
  const events: PlanEvent[] = [];
  let endMs = 0;
  // Lane records first, so backing never takes a tick a lane needs (they are on
  // different tracks anyway; this only keeps the allocator's view complete).
  for (const p of pending) {
    const laneTrack = p.n.x !== 0 ? trackOf.get(p.n.x) : undefined;
    if (laneTrack === undefined) continue;
    backing.occupy(laneTrack, p.tick, p.ms + p.durMs);
  }
  // The game's own background placement, before anything is placed around it.
  if (cabinet)
    for (const [p, t] of pinOf) {
      if (backing.pin(t, p.tick, p.ms, p.ms + p.durMs)) cabinet.pinnedCuts++;
      cabinet.pinned++;
    }
  for (const p of pending) {
    const n = p.n;
    let track = n.x !== 0 ? trackOf.get(n.x) : undefined;
    const lane = track !== undefined;
    let holdTicks = 0;
    if (lane) {
      holdTicks = tc.holdTicks(n.y, n.l);
      stats.notes++;
      if (holdTicks > 0) stats.holds++;
    } else {
      if (n.x !== 0) stats.offMode++;
      stats.backing++;
      track = pinOf.get(p) ?? backing.place({ tick: p.tick, startMs: p.ms, durMs: p.durMs });
    }
    const vel = n.vel ?? 127;
    const pan = n.pan ?? 64;
    const kind = n.kind ?? 0;
    tracks[track!]!.push({
      tick: p.tick,
      type: EZ_NOTE,
      key: slot(p.ks),
      vel,
      pan,
      kind,
      length: cabinet ? rawLength(n, lane, holdTicks) : holdTicks > 0 ? holdTicks + HOLD_BIAS : 0,
    });
    events.push({
      tick: p.tick,
      ms: p.ms,
      track: track!,
      x: lane ? n.x : 0,
      lane,
      keysound: p.ks,
      vel,
      pan,
      holdTicks,
      kind,
      noteId: n.id,
      originMs: p.originMs,
      untilMs: p.untilMs,
    });
    const end = Math.max(
      p.ms + (Number.isFinite(p.durMs) ? p.durMs : 0),
      holdTicks ? msOf(p.tick + holdTicks) : 0,
    );
    endMs = Math.max(endMs, end);
  }
  stats.chokes = backing.chokes;
  stats.worstRounding = clock.worstRounding;
  if (cabinet) cabinet.grown = backing.grown;
  tracks.length = cabinet ? backing.trackCount : 64;

  // ---- close the stage after the last sound. A game chart keeps the length
  // it had (the original's end of stage is its own; only EZ2PORT's is known).
  // EZ2PORT takes the scroll records out before it finds the stage's end
  // (play.c: "THE SCROLL EVENTS COME FIRST"), so a change after the last
  // sound does not keep a package's stage open: the closing record is still
  // needed. The original queues them with everything else, so for the
  // cabinet every record counts.
  let lastTick = 0;
  let lastEnd = 0;
  for (const t of tracks)
    for (const r of t) {
      lastTick = Math.max(lastTick, r.tick);
      if (r.type !== EZ_SCROLL_TYPE) lastEnd = Math.max(lastEnd, r.tick);
    }
  const tailTick = Math.ceil(tempo.tickAtMs(endMs));
  if (!game && tailTick > (cabinet ? lastTick : lastEnd)) {
    tracks[0]!.push({ tick: tailTick, type: EZ_BPM, bpm: tempo.bpmAt(tailTick) });
    lastTick = Math.max(lastTick, tailTick);
  }

  for (const t of tracks) t.sort((a, b) => a.tick - b.tick);
  let name: Uint8Array = nameField(o.name);
  let name2: Uint8Array = new Uint8Array();
  let bpm = f32(headerBpm);
  let bpm2 = bpm;
  if (game && cabinet) {
    const n1 = cp949Field(game.name);
    const n2 = cp949Field(game.name2);
    name = n1.bytes;
    name2 = n2.bytes;
    cabinet.nameUnmappable = [...new Set([...n1.unmappable, ...n2.unmappable])];
    // The header keeps the game's BPMs. Where the start tempo is another (the
    // game's own charts often start on a tempo record at tick 0, or it was
    // edited), it is a record at tick 0: the engine takes the header first,
    // then records at a tick in order, and the last governs (ez2_tempo_build),
    // so the tempo map is the chart's either way.
    if (Number.isFinite(game.bpm)) {
      bpm = f32(game.bpm);
      bpm2 = Number.isFinite(game.bpm2) ? f32(game.bpm2) : bpm;
      if (bpm !== f32(headerBpm))
        tracks[0]!.unshift({ tick: 0, type: EZ_BPM, bpm: f32(headerBpm) });
    }
  }
  const ezff: EzffChart = {
    version: o.version ?? 8,
    name,
    name2,
    ticksPerMeasure: TICKS_PER_MEASURE,
    bpm,
    bpm2,
    totalTicks: game ? gameTotal(game, lastTick) : lastTick + TICKS_PER_BEAT,
    tracks: tracks.map((records, i) => ({
      name: nameField(`track${String(i).padStart(2, '0')}`),
      ticks: records.at(-1)?.tick ?? 0,
      records,
    })),
  };
  return { ezff, tempo, keysoundSlots, events, endMs, stats, ...(cabinet ? { cabinet } : {}) };
}

/**
 * A game chart's total_ticks: the game's own while the chart ends where the
 * game's did (some end short of their last record), else long enough to hold
 * it. (EZ2PORT ends a stage by its records; what the original does with the
 * field is not known, so it is kept.)
 */
function gameTotal(game: GameHeader, lastTick: number): number {
  if (lastTick <= (game.lastTick ?? game.totalTicks)) return game.totalTicks;
  return Math.max(game.totalTicks, lastTick);
}

/**
 * A note's raw length on the cabinet: a hold's own; a background note's as
 * the game had it (`x_len` - background plays as a tap either way, the byte
 * is kept); a lane tap's 1-6 as the game had it. A stale `x_len` on a note
 * that is now a hold is ignored.
 */
function rawLength(n: NoteRec, lane: boolean, holdTicks: number): number {
  if (holdTicks > 0) return holdTicks + HOLD_BIAS;
  const x = n.extra?.x_len;
  if (typeof x !== 'number' || !Number.isInteger(x) || x < 0 || x > 0xffff) return 0;
  return lane ? (x <= HOLD_BIAS ? x : 0) : x;
}

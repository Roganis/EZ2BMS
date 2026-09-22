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

import type { ChartData, NoteId, NoteRec } from '../model/types';
import {
  EZ_BPM,
  EZ_NOTE,
  HOLD_BIAS,
  nameField,
  type EzffChart,
  type EzffRecord,
  type EzffVersion,
} from '../io/ez/ezff';
import { EngineTempo } from '../timing/engine-tempo';
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
}

export interface CompileOptions {
  /** The mode's columns (from the registry, or the user's .gds). */
  columns: readonly Column[];
  /** Header name; the song key is safest (plain ASCII). */
  name: string;
  keysounds: KeysoundRegistry;
  samples?: SampleLookup;
  version?: EzffVersion;
}

const f32 = Math.fround;
/** EZ2PORT's importer never cuts a slice shorter than 0.5 ms. */
const MIN_SLICE_FRAMES = Math.round(0.0005 * OUT_RATE);

export function compileChart(chart: ChartData, o: CompileOptions): ChartPlan {
  const res = chart.info.resolution && chart.info.resolution > 0 ? chart.info.resolution : 240;
  const tc = new TickConverter(res, chart.stopEvents);
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
  const tickOf = (y: number) => {
    const r = tc.tick(y);
    stats.worstRounding = Math.max(stats.worstRounding, r.err);
    return r.tick;
  };

  // ---- tempo: the header holds the BPM at tick 0; later changes are records.
  let headerBpm = chart.info.initBpm && chart.info.initBpm > 0 ? chart.info.initBpm : 120;
  const bpmAt = new Map<number, number>();
  const bpmSorted = chart.bpmEvents
    .map((e, i) => ({ ...e, i }))
    .filter((e) => e.bpm > 0 && Number.isFinite(e.bpm))
    .sort((a, b) => a.y - b.y || a.i - b.i);
  for (const e of bpmSorted) {
    const tick = tickOf(e.y);
    if (tick === 0) headerBpm = e.bpm;
    else bpmAt.set(tick, e.bpm); // two at one tick: the later wins
  }
  const tempoRecords: EzffRecord[] = [...bpmAt]
    .sort((a, b) => a[0] - b[0])
    .map(([tick, bpm]) => ({ tick, type: EZ_BPM, bpm: f32(bpm) }));
  const tempo = new EngineTempo(
    headerBpm,
    tempoRecords.map((r) => ({ tick: r.tick, bpm: r.bpm! })),
  );
  const msOf = (tick: number) => tempo.msAt(tick);

  // ---- notes -> keysounds and records
  const trackOf = new Map(o.columns.map((c) => [c.x, c.track]));
  const laneTracks = new Set(o.columns.map((c) => c.track));
  const backing = new BackingAllocator(laneTracks);
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

  interface Pending {
    n: NoteRec;
    tick: number;
    ms: number;
    ks: number;
    durMs: number;
  }
  const pending: Pending[] = [];
  const byChannel = new Map<number, NoteRec[]>();
  for (const n of chart.notes) {
    // An `up` note is still a note; only its re-trigger at the release is
    // dropped (EZ2 has none). EZ2PORT's importer drops the whole note.
    if (n.up) stats.droppedUp++;
    const list = byChannel.get(n.ch);
    if (list) list.push(n);
    else byChannel.set(n.ch, [n]);
  }
  for (const ch of chart.channels) {
    const notes = (byChannel.get(ch.id) ?? []).sort(
      (a, b) => a.y - b.y || a.x - b.x || a.id - b.id,
    );
    const ticks = notes.map((n) => tickOf(n.y));
    const ms = ticks.map(msOf);
    const framesBetween = (from: number, to: number) => Math.round(((to - from) * OUT_RATE) / 1000);
    let anchor = -1;
    notes.forEach((n, i) => {
      const t = ms[i]!;
      if (!(n.c && anchor >= 0)) anchor = t;
      const startF = framesBetween(anchor, t);
      const nextCont = i + 1 < notes.length && notes[i + 1]!.c;
      let endF: number | null = null;
      if (i + 1 < notes.length) {
        endF = Math.max(framesBetween(anchor, ms[i + 1]!), startF + MIN_SLICE_FRAMES);
      }
      const whole = startF === 0 && !nextCont;
      const ks = whole ? o.keysounds.get(ch.name, 0, null) : o.keysounds.get(ch.name, startF, endF);
      if (!whole) stats.slices++;
      const info = o.samples?.(ch.name);
      const durFrames = whole
        ? (info?.frames ?? Infinity)
        : endF === null
          ? Math.max(0, (info?.frames ?? Infinity) - startF)
          : endF - startF;
      pending.push({ n, tick: ticks[i]!, ms: t, ks, durMs: (durFrames * 1000) / OUT_RATE });
    });
  }
  pending.sort((a, b) => a.tick - b.tick || a.n.x - b.n.x || a.n.id - b.n.id);

  const tracks: EzffRecord[][] = Array.from({ length: 64 }, () => []);
  tracks[0]!.push(...tempoRecords);
  const events: PlanEvent[] = [];
  let endMs = 0;
  // Lane records first, so backing never takes a tick a lane needs (they are on
  // different tracks anyway; this only keeps the allocator's view complete).
  for (const p of pending) {
    const laneTrack = p.n.x !== 0 ? trackOf.get(p.n.x) : undefined;
    if (laneTrack === undefined) continue;
    backing.occupy(laneTrack, p.tick, p.ms + p.durMs);
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
      track = backing.place({ tick: p.tick, startMs: p.ms, durMs: p.durMs });
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
      length: holdTicks > 0 ? holdTicks + HOLD_BIAS : 0,
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
    });
    const end = Math.max(
      p.ms + (Number.isFinite(p.durMs) ? p.durMs : 0),
      holdTicks ? msOf(p.tick + holdTicks) : 0,
    );
    endMs = Math.max(endMs, end);
  }
  stats.chokes = backing.chokes;

  // ---- close the stage after the last sound
  let lastTick = 0;
  for (const t of tracks) for (const r of t) lastTick = Math.max(lastTick, r.tick);
  const tailTick = Math.ceil(tempo.tickAtMs(endMs));
  if (tailTick > lastTick) {
    tracks[0]!.push({ tick: tailTick, type: EZ_BPM, bpm: tempo.bpmAt(tailTick) });
    lastTick = tailTick;
  }

  for (const t of tracks) t.sort((a, b) => a.tick - b.tick);
  const ezff: EzffChart = {
    version: o.version ?? 8,
    name: nameField(o.name),
    name2: new Uint8Array(),
    ticksPerMeasure: TICKS_PER_MEASURE,
    bpm: f32(headerBpm),
    bpm2: f32(headerBpm),
    totalTicks: lastTick + TICKS_PER_BEAT,
    tracks: tracks.map((records, i) => ({
      name: nameField(`track${String(i).padStart(2, '0')}`),
      ticks: records.at(-1)?.tick ?? 0,
      records,
    })),
  };
  return { ezff, tempo, keysoundSlots, events, endMs, stats };
}

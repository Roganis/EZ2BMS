// Cutting a stem where a MIDI file's notes start - the MIDI of the same song,
// exported from the DAW the stem came from, says where each hit is better
// than any onset detector. As BmsTWO's MIDI import: only when the notes
// start matters (not their pitch or length), and the MIDI's tempo can become
// the chart's.
//
// The MIDI's time 0 is the stem's first hit: that is where both start. Then:
//
// - tempo 'midi': from that hit on, the chart's tempo is the MIDI's (a MIDI
//   quarter note is a beat), and each note is at its MIDI beat. This is an
//   ordinary edit - anything else charted after the hit moves in time with
//   the new tempo - so the plan counts what would move and the caller asks.
// - tempo 'chart': the chart keeps its tempo; each note is placed at the
//   MIDI note's time, through the chart's own tempo map.
//
// Either way a cut goes on the nearest 1/48 beat (EZ2's finest), or on the
// grid step asked for, and is made by M4's cut operation - checked to keep
// the sound, refused where the stem is not playing - so the stem sounds as
// before, only cut. The tempo and the cuts are one undo step.

import { analysis } from '../edit/analysis';
import type { ChartDoc } from '../edit/doc';
import { said, sayText } from '../i18n/say';
import type { BpmEvent, ChartData } from '../model/types';
import { ChartClock } from '../publish/chart-plan';
import { PlanTimeline } from '../timing/plan-timeline';
import { applyCuts, planCuts, type SliceEnv, type SliceResult } from './ops';
import { stemView } from './view';
import { smfBpm, smfMs, type Smf } from '../io/midi/smf';

export interface MidiCutOptions {
  /** Tracks whose notes cut (default: every track with notes). */
  tracks?: readonly number[];
  tempo: 'midi' | 'chart';
  /** Snap to this many pulses (a grid step); default the nearest 1/48 beat. */
  step?: number;
}

export interface MidiCutPlan {
  /** Where the stem's first hit is: the MIDI's time 0. */
  start: number;
  /** Positions to cut at (before checking where the stem plays). */
  ys: number[];
  /** The chart's tempo from `start` on, when it becomes the MIDI's. */
  tempo?: { start: number; events: BpmEvent[] };
  /** Notes of other sounds after `start` whose time the new tempo changes. */
  moves: number;
  /** The furthest a cut lands from its MIDI note, in ms. */
  worstMs: number;
  /** MIDI notes that fell on one spot with another. */
  merged: number;
}

/** A refusal (said in the language chosen, for the MIDI panel to show), or the plan. */
export function planMidiCuts(
  doc: ChartDoc,
  src: string,
  smf: Smf,
  opts: MidiCutOptions,
): MidiCutPlan | { error: string } {
  const view = stemView(doc, src);
  const first = view.slices.find((s) => s.fresh);
  if (!first) return { error: sayText(said('slice.midi.no-hit', { src })) };
  const tracks = new Set(opts.tracks ?? smf.tracks.map((_, i) => i));
  const notes = smf.notes.filter((n) => tracks.has(n.track));
  if (!notes.length) return { error: sayText(said('slice.midi.no-notes')) };
  const res = doc.resolution;
  const step = opts.step && opts.step > 0 ? opts.step : res / 48;
  const snap = (y: number) => Math.round(y / step) * step;
  const y0 = first.y;
  const a = analysis(doc);
  const ms0 = a.timeline.msAt(y0);
  const ys = new Set<number>();
  let worst = 0;
  let merged = 0;
  let tempo: MidiCutPlan['tempo'];
  let moves = 0;
  if (opts.tempo === 'midi') {
    const yOfTick = (tick: number) => y0 + (tick * res) / smf.ppq;
    tempo = {
      start: y0,
      events: smf.tempos.map((t) => ({
        y: Math.round(yOfTick(t.tick)),
        bpm: Math.round(smfBpm(t) * 1000) / 1000,
      })),
    };
    // What moves: every other note after the hit, if its time changes.
    const before = doc.data.bpmEvents.filter((e) => e.y < y0);
    const at0 = tempo.events.find((e) => e.y === 0);
    const next: ChartData = {
      ...doc.data,
      info: { ...doc.data.info, ...(at0 ? { initBpm: at0.bpm } : {}) },
      bpmEvents: [...before, ...tempo.events.filter((e) => e.y > 0)],
    };
    const clock = new ChartClock(next);
    const probe = new PlanTimeline(clock.tempo, clock.resolution, next.stopEvents);
    const own = new Set(view.channels);
    for (const n of doc.data.notes)
      if (n.y > y0 && !own.has(n.ch) && Math.abs(probe.msAt(n.y) - a.timeline.msAt(n.y)) > 0.5)
        moves++;
    for (const n of notes) {
      const exact = yOfTick(n.tick);
      const y = snap(exact);
      const beatMs =
        (60_000 / smfBpm(smf.tempos.findLast((t) => t.tick <= n.tick)!)) *
        (Math.abs(y - exact) / res);
      worst = Math.max(worst, beatMs);
      if (ys.has(y)) merged++;
      ys.add(y);
    }
  } else {
    for (const n of notes) {
      const ms = ms0 + smfMs(smf, n.tick);
      const exact = a.timeline.pulseAt(ms);
      const y = snap(exact);
      worst = Math.max(worst, Math.abs(a.timeline.msAt(y) - ms));
      if (ys.has(y)) merged++;
      ys.add(y);
    }
  }
  ys.delete(y0); // the hit itself is not a cut
  return {
    start: y0,
    ys: [...ys].sort((p, q) => p - q),
    ...(tempo ? { tempo } : {}),
    moves,
    worstMs: worst,
    merged,
  };
}

/**
 * Make a plan: the tempo (when it is the MIDI's), then the cuts, as one undo
 * step. Refused, with nothing changed, when no cut keeps the sound.
 */
export function applyMidiCuts(
  doc: ChartDoc,
  src: string,
  plan: MidiCutPlan,
  env: SliceEnv = {},
): SliceResult {
  const merge = `midi-cuts-${Date.now()}`;
  const tempo = plan.tempo;
  if (tempo) {
    doc.transact(
      sayText(said('undo.midi-tempo')),
      (tx) => {
        const before = doc.data.bpmEvents.filter((e) => e.y < tempo.start);
        const events = tempo.events.filter((e) => e.y > 0);
        tx.setBpmEvents([...before, ...events]);
        const at0 = tempo.events.find((e) => e.y === 0);
        if (at0) tx.setInfo({ initBpm: at0.bpm });
      },
      { merge },
    );
  }
  const cuts = planCuts(doc, src, plan.ys, env);
  const r = cuts.length
    ? applyCuts(doc, cuts, env, sayText(said('undo.midi-cuts')), { merge })
    : ({
        ok: false,
        reason: sayText(said('slice.midi.not-playing', { src })),
      } as SliceResult);
  if (!r.ok && tempo) doc.undo();
  return r;
}

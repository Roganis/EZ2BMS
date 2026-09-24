// A compiled plan as the audio engine plays it: one event per note, on the
// voice of its keysound (lane or background alike - EZ2PORT's autoplay and
// backing both play the sample's own slot, reference/play.c), at the level
// and pan the original's arithmetic gives the note's velocity and pan.
//
// The editor feeds these to the engine; the tests feed the same events to
// the Rust mixer (crates/ez2bms-audio/examples/render_specs.rs), so what is
// checked is what is heard.

import { dsLevel, dsPan, MIX_UNITY, PAN_CENTRE } from '../ez2data/mixparam';
import type { ChartPlan, PlanEvent } from './chart-plan';
import type { KeysoundRegistry } from './keysounds';

/** One sound for the engine: the shape src-tauri's audio_set_events takes (EventDto). */
export interface EngineEvent {
  ms: number;
  origin_ms: number;
  until_ms: number | null;
  sample: number;
  voice: number;
  /** Hundredths of a dB. */
  level: number;
  /** DirectSound pan, -10000..10000. */
  pan: number;
}

/**
 * The plan's events for the engine. `sampleOf` gives the engine's sample id
 * for a source name (events whose sample is not loaded are left out); `keep`
 * filters (muting the background, soloing a lane).
 */
export function engineEvents(
  plan: ChartPlan,
  reg: KeysoundRegistry,
  sampleOf: (src: string) => number | null | undefined,
  keep?: (e: PlanEvent) => boolean,
): EngineEvent[] {
  const out: EngineEvent[] = [];
  for (const e of plan.events) {
    if (keep && !keep(e)) continue;
    const id = sampleOf(reg.defs[e.keysound]!.src);
    if (id === null || id === undefined) continue;
    out.push({
      ms: e.ms,
      origin_ms: e.originMs,
      until_ms: e.untilMs,
      sample: id,
      voice: e.keysound,
      level: dsLevel(MIX_UNITY, MIX_UNITY, MIX_UNITY, e.vel),
      pan: dsPan(PAN_CENTRE, e.pan),
    });
  }
  return out;
}

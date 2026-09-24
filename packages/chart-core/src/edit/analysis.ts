// What Classic mode and stem slicing ask of a chart again and again, cached
// per document until an edit makes it stale: the chart's clock and plan
// timeline, each channel's notes as the sounds they play (channelEvents),
// and each source file's audible segments. A hover or a strip redraw then
// costs a lookup, not a recompile (compileChart takes 159 ms at 50k notes).
//
// A note edit drops only what it touched: the channels changed and the
// source files they (and their old names) play. A timing edit or a channel
// list change drops everything.

import type { ChannelId } from '../model/types';
import { audible, type AudibleSeg } from '../publish/audible';
import {
  ChartClock,
  channelEvents,
  type ChannelEvent,
  type SampleLookup,
} from '../publish/chart-plan';
import { PlanTimeline } from '../timing/plan-timeline';
import type { ChartDoc } from './doc';

export class Analysis {
  private clockCache: ChartClock | undefined;
  private timelineCache: PlanTimeline | undefined;
  private events = new Map<ChannelId, ChannelEvent[]>();
  private sound = new Map<string, AudibleSeg[]>();
  /** Anything else derived from one source's notes (a stem view), by kind and source. */
  private derived = new Map<string, Map<string, unknown>>();
  private srcOf = new Map<ChannelId, string>();
  private samples: SampleLookup | undefined;

  constructor(private readonly doc: ChartDoc) {
    doc.onChange((cs) => {
      if (cs.timing || cs.channelList) {
        if (cs.timing) {
          this.clockCache = undefined;
          this.timelineCache = undefined;
        }
        this.events.clear();
        this.sound.clear();
        this.derived.clear();
        this.srcOf.clear();
        return;
      }
      for (const ch of cs.channels) {
        this.events.delete(ch);
        const old = this.srcOf.get(ch);
        if (old !== undefined) this.dropSource(old);
        const cur = doc.channel(ch)?.name;
        if (cur !== undefined) this.dropSource(cur);
        this.srcOf.delete(ch);
      }
    });
  }

  private dropSource(src: string): void {
    this.sound.delete(src);
    for (const m of this.derived.values()) m.delete(src);
  }

  get clock(): ChartClock {
    return (this.clockCache ??= new ChartClock(this.doc.data));
  }

  /** Pulses <-> song ms as the published chart plays (STOPs as gaps), not rounded to ticks. */
  get timeline(): PlanTimeline {
    return (this.timelineCache ??= new PlanTimeline(
      this.clock.tempo,
      this.clock.resolution,
      this.doc.data.stopEvents,
    ));
  }

  eventsOf(ch: ChannelId): ChannelEvent[] {
    let e = this.events.get(ch);
    if (!e) this.events.set(ch, (e = channelEvents(this.clock, this.doc.index.channel(ch))));
    return e;
  }

  private useSamples(samples: SampleLookup | undefined): void {
    if (samples !== this.samples) {
      this.sound.clear();
      this.derived.clear();
      this.samples = samples;
    }
  }

  private track(src: string): void {
    for (const c of this.doc.data.channels) if (c.name === src) this.srcOf.set(c.id, src);
  }

  /** The current sound of one source, cached until one of its channels changes. */
  soundOf(src: string, samples: SampleLookup | undefined): AudibleSeg[] {
    this.useSamples(samples);
    let s = this.sound.get(src);
    if (!s) {
      s = audible(this.doc.data, this.opts(new Set([src]), samples)).get(src) ?? [];
      this.sound.set(src, s);
      this.track(src);
    }
    return s;
  }

  /** Something made from one source's notes, cached like its sound. */
  derive<T>(kind: string, src: string, samples: SampleLookup | undefined, make: () => T): T {
    this.useSamples(samples);
    let m = this.derived.get(kind);
    if (!m) this.derived.set(kind, (m = new Map()));
    if (m.has(src)) return m.get(src) as T;
    const v = make();
    m.set(src, v);
    this.track(src);
    return v;
  }

  opts(srcs: ReadonlySet<string>, samples: SampleLookup | undefined) {
    return {
      srcs,
      clock: this.clock,
      notesOf: (ch: ChannelId) => this.doc.index.channel(ch),
      ...(samples ? { samples } : {}),
    };
  }
}

const analyses = new WeakMap<ChartDoc, Analysis>();

/** The document's cached analysis (made on first use; it follows the document's edits). */
export function analysis(doc: ChartDoc): Analysis {
  let a = analyses.get(doc);
  if (!a) analyses.set(doc, (a = new Analysis(doc)));
  return a;
}

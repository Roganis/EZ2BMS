// The stem strips beside the lanes: which files get one, and what each
// shows. A strip draws a stem where the chart plays it (render/strip.ts);
// slicing it is chart-core's (slice/ops.ts).
//
// Which files: a song's own choice once made (pinned and unpinned, kept in
// the app's settings per song folder - a view, not part of the song), else
// the stems - files a chart slices (has continuation notes for) or long
// ones - longest first.

import { stemView, timelineOf, type ChartDoc, type NoteId } from '@ez2bms/chart-core';
import { AnalysisCache } from '../audio/analysis';
import { PeakTiles } from '../audio/peaktiles';
import type { StripSpec } from '../render/striprows';
import type { App } from './app.svelte';

/** A file this long or longer is a stem, sliced or not. */
export const STEM_SECONDS = 20;
/** Strips shown before the song has chosen. */
const AUTO_STRIPS = 3;
export const MAX_STRIPS = 4;

export class StripsState {
  /** Strips shown at all (Edit mode). */
  show = $state(true);
  /** Onsets weaker than this are not marked or suggested (0..1). */
  sensitivity = $state(0.1);
  /** Bumped as waveform tiles and analyses arrive: draw again. */
  rev = $state(0);
  /** The slice under the pointer (in a strip, or its note on a lane). */
  hover = $state<NoteId | null>(null);
  /** The strip slicing acts on (the knife tool, the chop panel). */
  focus = $state<string | null>(null);
  readonly peaks: PeakTiles;
  readonly analyses: AnalysisCache;

  constructor(private readonly app: App) {
    this.peaks = new PeakTiles(app.backend.audio, () => this.rev++);
    this.analyses = new AnalysisCache(app.backend.audio, () => this.rev++);
  }

  /** The song's own list, once it has one. */
  private saved(): string[] | undefined {
    const dir = this.app.project?.dir;
    return dir === undefined ? undefined : this.app.settings.data.strips[dir];
  }

  /** The stems of a chart, longest first. */
  auto(doc: ChartDoc): string[] {
    const len = (src: string) => this.app.audio.loadedInfo(src)?.seconds ?? 0;
    // A scratch set, read and dropped here (not state).
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const names = new Set<string>();
    for (const c of doc.data.channels) {
      if (names.has(c.name)) continue;
      const sliced = doc.index.channel(c.id).some((n, i) => i > 0 && n.c);
      if (sliced || len(c.name) >= STEM_SECONDS) names.add(c.name);
    }
    return [...names].sort((a, b) => len(b) - len(a) || a.localeCompare(b)).slice(0, AUTO_STRIPS);
  }

  /** The files with strips in this chart. */
  list(doc: ChartDoc): string[] {
    const saved = this.saved();
    if (!saved) return this.auto(doc);
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a scratch set
    const here = new Set(doc.data.channels.map((c) => c.name));
    return saved.filter((s) => here.has(s)).slice(0, MAX_STRIPS);
  }

  has(doc: ChartDoc, src: string): boolean {
    return this.list(doc).includes(src);
  }

  private store(list: string[]): void {
    const dir = this.app.project?.dir;
    if (dir === undefined) return;
    this.app.settings.set('strips', { ...this.app.settings.data.strips, [dir]: list });
  }

  /** Give a file a strip (the oldest pinned makes room past MAX_STRIPS). */
  pin(doc: ChartDoc, src: string): void {
    const list = this.list(doc).filter((s) => s !== src);
    list.push(src);
    this.store(list.slice(-MAX_STRIPS));
    this.focus = src;
  }

  unpin(doc: ChartDoc, src: string): void {
    this.store(this.list(doc).filter((s) => s !== src));
    if (this.focus === src) this.focus = null;
  }

  /** What the playfield draws for each strip of this chart. */
  specs(doc: ChartDoc): StripSpec[] {
    if (!this.show) return [];
    void this.rev;
    const samples = this.app.audio.lengths();
    const timeline = timelineOf(doc);
    const list = this.list(doc);
    const focus = this.focus && list.includes(this.focus) ? this.focus : list[0];
    return list.map((src) => {
      const loaded = this.app.audio.loadedInfo(src);
      const ready = loaded && loaded.id !== null ? loaded : undefined;
      const a = ready ? this.analyses.get(ready) : undefined;
      const tempo = a?.tempo[0];
      const secs = ready ? `${ready.seconds.toFixed(1)} s` : 'not loaded';
      return {
        src,
        label: [src.replace(/\.[^.]+$/, ''), secs, tempo ? `${tempo.bpm.toFixed(1)} BPM` : '']
          .filter(Boolean)
          .join(' · '),
        view: stemView(doc, src, samples),
        timeline,
        peaks: ready ? (x: number, y: number) => this.peaks.range(ready, x, y) : () => undefined,
        onsets: a?.onsets ?? [],
        minStrength: this.sensitivity,
        focused: src === focus,
      };
    });
  }
}

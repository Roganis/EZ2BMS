// The stem strips beside the lanes: which files get one, and what each
// shows. A strip draws a stem where the chart plays it (render/strip.ts);
// slicing it is chart-core's (slice/ops.ts).
//
// Which files: a song's own choice once made (pinned and unpinned, kept in
// the app's settings per song folder - a view, not part of the song), else
// the stems - files a chart slices (has continuation notes for) or long
// ones - longest first.

import {
  applyCuts,
  BGM,
  chopPlan,
  classicSplit,
  compileChart,
  KeysoundRegistry,
  modeDef,
  onsetSuggestions,
  segmentEnd,
  sliceHeal,
  sliceKey,
  sliceMove,
  sliceSplit,
  splitCandidates,
  stemView,
  TICKS_PER_BEAT,
  timelineOf,
  whenHeard,
  type ChartDoc,
  type Cut,
  type ModeId,
  type NoteId,
  type SliceEnv,
  type Suggestion,
} from '@ez2bms/chart-core';
import { AnalysisCache } from '../audio/analysis';
import { PeakTiles } from '../audio/peaktiles';
import type { StripSpec } from '../render/striprows';
import type { App } from './app.svelte';
import { toast } from './toasts.svelte';

/** Hover a slice this long and it plays. */
const AUDITION_DWELL_MS = 300;

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
  /** Where a cut would go, or where one is being moved to: a line across a strip. */
  ghost = $state<{ strip: number; y: number } | null>(null);
  /** The strip whose panel (chop, onsets, tempo) is open. */
  panel = $state<string | null>(null);
  /** Onset cuts drawn on the focused strip. */
  suggest = $state(false);
  /** Onsets placed on the nearest EZ2 tick rather than the grid. */
  exact = $state(false);
  /** Chop leaves steps whose slice would be quieter than this (dBFS) uncut; null cuts everything. */
  silenceDb = $state<number | null>(-48);
  private dwell: ReturnType<typeof setTimeout> | undefined;
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

  env(): SliceEnv {
    return { samples: this.app.audio.lengths() };
  }

  /** The strip slicing acts on in this chart: the focused one, else the first. */
  focused(doc: ChartDoc): string | undefined {
    const list = this.list(doc);
    return this.focus && list.includes(this.focus) ? this.focus : list[0];
  }

  private refused(what: string, r: { ok: boolean; reason?: string }): boolean {
    if (!r.ok) toast(`Can't ${what}: ${r.reason}`, 'warn');
    return r.ok;
  }

  /** Cut `src` at y. */
  split(doc: ChartDoc, src: string, y: number): boolean {
    return this.refused('cut there', sliceSplit(doc, src, y, this.env()));
  }

  /** Join a cut's slice to the one before. */
  heal(doc: ChartDoc, id: NoteId): boolean {
    return this.refused('heal that cut', sliceHeal(doc, id, this.env()));
  }

  move(doc: ChartDoc, id: NoteId, y: number): boolean {
    return this.refused('move that cut', sliceMove(doc, id, y, this.env()));
  }

  /** Slices onto lane x at their own spots (BGM: back to the background). */
  key(doc: ChartDoc, ids: NoteId[], x: number): boolean {
    const r = sliceKey(doc, ids, x, this.env());
    return this.refused(x === BGM ? 'send that to the background' : 'key that there', r);
  }

  /**
   * The knife outside a strip: cut the focused strip's file at y, or with no
   * strips, whatever sounds there (Classic's split).
   */
  knife(doc: ChartDoc, y: number): boolean {
    const src = this.focused(doc);
    if (src) return this.split(doc, src, y);
    const env = { ...this.env(), brush: this.app.view.brush };
    const cand = splitCandidates(doc, y, env).find((c) => !c.bad);
    if (!cand) {
      toast('Nothing sounds there to cut', 'warn');
      return false;
    }
    return this.refused('cut there', classicSplit(doc, y, cand, env));
  }

  /**
   * The onset of `src` nearest pulse p within `within` pulses, on the
   * nearest EZ2 tick (for Shift-snapping a cut), or undefined.
   */
  onsetNear(doc: ChartDoc, src: string, p: number, within: number): number | undefined {
    const l = this.app.audio.loadedInfo(src);
    const a = l && l.id !== null ? this.analyses.get(l) : undefined;
    if (!a) return undefined;
    const view = stemView(doc, src, this.app.audio.lengths());
    const tl = timelineOf(doc);
    const tick = doc.resolution / TICKS_PER_BEAT;
    const t = tl.msAt(p);
    const w = Math.abs(tl.msAt(p + within) - t);
    let best: number | undefined;
    for (const [sec, strength] of a.onsets) {
      if (strength < this.sensitivity) continue;
      for (const ms of whenHeard(view, sec)) {
        if (Math.abs(ms - t) > w) continue;
        const q = Math.round(Math.round(tl.pulseAt(ms) / tick) * tick);
        if (best === undefined || Math.abs(q - p) < Math.abs(best - p)) best = q;
      }
    }
    return best;
  }

  /** Whether the file is quieter than the silence level over seconds [a, b) (false while unknown). */
  private silent(src: string): ((a: number, b: number) => boolean) | undefined {
    const db = this.silenceDb;
    const l = this.app.audio.loadedInfo(src);
    if (db === null || !l || l.id === null) return undefined;
    const limit = 32767 * 10 ** (db / 20);
    return (a, b) => {
      const p = this.peaks.range(l, a, b);
      return !!p && Math.max(-p[0], p[1]) < limit;
    };
  }

  /**
   * The pulses a chop covers: the selected slices of `src` (from the first's
   * start to the last's end), else the whole stem.
   */
  chopRange(doc: ChartDoc, src: string): { from: number; to: number; selection: boolean } {
    const view = stemView(doc, src, this.app.audio.lengths());
    const tl = timelineOf(doc);
    const sel = doc.selection.ids;
    const chosen = view.slices.filter((sl) => sel.has(sl.id));
    const endOf = (i: number) => {
      const sl = view.slices[i]!;
      const next = view.slices.slice(i + 1).find((n) => n.ch === sl.ch);
      if (next) return next.y;
      const seg = view.segments.at(-1);
      const end = seg ? segmentEnd(view, seg) : Infinity;
      return Number.isFinite(end) ? Math.ceil(tl.pulseAt(end)) : sl.y + 1;
    };
    if (chosen.length) {
      const idx = chosen.map((c) => view.slices.indexOf(c));
      return {
        from: Math.min(...chosen.map((c) => c.y)),
        to: Math.max(...idx.map(endOf)),
        selection: true,
      };
    }
    if (!view.slices.length) return { from: 0, to: 0, selection: false };
    return {
      from: view.slices[0]!.y,
      to: Math.max(...view.slices.map((_, i) => endOf(i))),
      selection: false,
    };
  }

  /** The cuts chopping `src` every `step` pulses would make (nothing changes). */
  chopPlan(doc: ChartDoc, src: string, step: number): Cut[] {
    const r = this.chopRange(doc, src);
    const isSilent = this.silent(src);
    return chopPlan(doc, src, r.from, r.to, step, this.env(), isSilent ? { isSilent } : {});
  }

  chop(doc: ChartDoc, src: string, step: number): boolean {
    const cuts = this.chopPlan(doc, src, step);
    if (!cuts.length) {
      toast('Nothing to chop there: it is cut on that grid already', 'info');
      return false;
    }
    const r = applyCuts(doc, cuts, this.env(), 'Chop to grid');
    if (r.ok) toast(`${r.ids!.length} cuts`, 'ok');
    return this.refused('chop there', r);
  }

  /** Where the file's onsets would cut it (on the grid `step`, or exact). */
  suggestions(doc: ChartDoc, src: string, step: number): Suggestion[] {
    const l = this.app.audio.loadedInfo(src);
    const a = l && l.id !== null ? this.analyses.get(l) : undefined;
    if (!a) return [];
    const onsets = a.onsets.map(([sec, strength]) => ({ sec, strength }));
    return onsetSuggestions(
      doc,
      src,
      onsets,
      { step, exact: this.exact, minStrength: this.sensitivity },
      this.env(),
    );
  }

  cutAtOnsets(doc: ChartDoc, src: string, step: number): boolean {
    const s = this.suggestions(doc, src, step);
    if (!s.length) {
      toast('No onsets to cut at: lower the sensitivity, or it is cut there already', 'info');
      return false;
    }
    const r = applyCuts(
      doc,
      s.map((x) => x.cut),
      this.env(),
      'Cut at onsets',
    );
    if (r.ok) toast(`${r.ids!.length} cuts at onsets`, 'ok');
    return this.refused('cut at the onsets', r);
  }

  /** Keysounds the chart makes now (each slice of a file is one). */
  keysounds(doc: ChartDoc, mode: ModeId): number {
    const reg = new KeysoundRegistry();
    compileChart(doc.data, {
      columns: modeDef(mode).columns,
      name: 'count',
      keysounds: reg,
      samples: this.app.audio.lengths(),
    });
    return reg.defs.length;
  }

  /** The pointer is over a slice (or none): light it, and after a moment play it. */
  hoverOn(doc: ChartDoc, id: NoteId | null): void {
    if (id === this.hover) return;
    this.hover = id;
    clearTimeout(this.dwell);
    if (id === null) return;
    this.dwell = setTimeout(() => {
      if (this.hover !== id || this.app.view.playing) return;
      const n = doc.index.get(id);
      const src = n && doc.channel(n.ch)?.name;
      if (!src) return;
      const sl = stemView(doc, src, this.app.audio.lengths()).slices.find((x) => x.id === id);
      if (sl)
        void this.app.audio.audition(
          src,
          sl.fromSec * 1000,
          sl.toSec === null ? null : sl.toSec * 1000,
        );
    }, AUDITION_DWELL_MS);
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

// The editor's side of the audio engine.
//
// It compiles the chart with the SAME compiler Publish uses (chart-core
// compileChart: slices, keysounds, STOPs as gaps, f32 tempo), hands the
// events to the engine, and while playing moves the cursor to what the
// speaker is playing, from the audio clock - never from a timer.

import {
  compileChart,
  engineEvents,
  KeysoundRegistry,
  modeDef,
  PlanTimeline,
  type ChartPlan,
  type SampleLookup,
} from '@ez2bms/chart-core';
import { SvelteMap } from 'svelte/reactivity';
import type { AudioEvent, Backend, ClockSnapshot, Loaded } from '../bridge';
import type { ChartSlot, Project } from '../state/project.svelte';
import type { Settings } from '../state/settings.svelte';
import { toast } from '../state/toasts.svelte';
import type { View } from '../state/view.svelte';
import { soundNames, soundPath } from './paths';

/** Voice for auditions: its own, so a new audition cuts the last one. */
const AUDITION_VOICE = (1 << 16) + 255;
const PUBLISH_RATE = 44100;

export class AudioClient {
  /** Sound name (as the chart names it) -> what the engine loaded. */
  private loaded = new SvelteMap<string, Loaded>();
  private plan: ChartPlan | undefined;
  private timeline: PlanTimeline | undefined;
  private planRev = -1;
  private planSlot: ChartSlot | undefined;
  private syncTimer: ReturnType<typeof setTimeout> | undefined;
  private clock: ClockSnapshot | undefined;
  private unstream: (() => void) | undefined;
  private offsetMs = 0;
  private startGen = -1;
  private startMs = 0;
  private lastMs = 0;
  private raf = 0;
  muteBgm = $state(false);
  solo = $state<number | null>(null);
  /** Test play: the engine plays the backing only; lane sounds come from presses. */
  lanesMuted = false;
  private reg: KeysoundRegistry | undefined;
  private planKey = '';
  /** Bumped whenever the set of loaded sounds changes. */
  private loadedRev = 0;
  private lookup: { rev: number; fn: SampleLookup } | undefined;

  constructor(
    private readonly backend: Backend,
    private readonly view: View,
    private readonly settings: Settings,
  ) {}

  /** Whether calibrate() has run: until then host and page times can't be compared. */
  get calibrated(): boolean {
    return this.clock !== undefined;
  }

  /** Measure how far the engine's host clock is from performance.now(): the fastest of ten pings. */
  async calibrate(): Promise<void> {
    let best = Infinity;
    for (let i = 0; i < 10; i++) {
      const t0 = performance.now();
      const host = await this.backend.audio.now();
      const t1 = performance.now();
      if (t1 - t0 < best) {
        best = t1 - t0;
        this.offsetMs = host / 1e6 - (t0 + t1) / 2;
      }
    }
    this.unstream?.();
    this.unstream = this.backend.audio.streamClock((c) => (this.clock = c));
  }

  /** Load every sound the project's charts use (and keep ids for the rest). */
  async loadProject(p: Project): Promise<void> {
    await this.load(p, soundNames(p.charts));
  }

  async load(p: Project, names: string[]): Promise<void> {
    const want = names.filter((n) => !this.loaded.has(n));
    if (!want.length) return;
    const pathOf = (n: string) => soundPath(p.dir, p.samples, n);
    const res = await this.backend.audio.load(want.map(pathOf));
    let failed = 0;
    res.forEach((r, i) => {
      this.loaded.set(want[i]!, r);
      if (r.error) failed++;
    });
    this.loadedRev++;
    if (failed)
      toast(
        `${failed} sound${failed === 1 ? '' : 's'} could not be read (see the Sounds drawer)`,
        'warn',
      );
    this.planRev = -1;
  }

  /**
   * Read sounds from disk again - edited in another program, say. The
   * engine re-decodes a file whose size or time changed and keeps its id;
   * each gets a new Loaded, so its waveform thumbnail is fetched again.
   */
  async reload(p: Project, names: string[] = [...this.loaded.keys()]): Promise<void> {
    for (const n of names) this.loaded.delete(n);
    this.loadedRev++;
    await this.load(p, names);
  }

  /**
   * A file was renamed: its sound moves to the new name without being
   * decoded again (and keeps its thumbnail - same Loaded). The old names go,
   * so a new file that takes one of them later is loaded, not mistaken for it.
   */
  rename(renames: ReadonlyMap<string, string>): void {
    for (const [from, to] of renames) {
      const l = this.loaded.get(from);
      this.loaded.delete(from);
      if (l && !this.loaded.has(to)) this.loaded.set(to, l);
    }
    this.loadedRev++;
    this.planRev = -1;
  }

  loadedInfo(name: string): Loaded | undefined {
    return this.loaded.get(name);
  }

  /**
   * Sample lengths at 44.1 kHz by sound name - what the compiler and the
   * Classic checks measure with. One function per set of loaded sounds, so
   * whatever caches on it stays valid until a sound loads.
   */
  lengths(): SampleLookup {
    if (!this.lookup || this.lookup.rev !== this.loadedRev) {
      // A frozen copy: the function must not change under what cached on it.
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const known = new Map(this.loaded);
      this.lookup = {
        rev: this.loadedRev,
        fn: (src) => {
          const l = known.get(src);
          return l && !l.error ? { frames: Math.round(l.seconds * PUBLISH_RATE) } : undefined;
        },
      };
    }
    return this.lookup.fn;
  }

  /** Recompile soon (after edits settle); play() compiles right away. */
  scheduleSync(slot: ChartSlot): void {
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => void this.sync(slot), this.view.playing ? 30 : 160);
  }

  async sync(slot: ChartSlot): Promise<void> {
    clearTimeout(this.syncTimer);
    const key = `${this.muteBgm}|${this.solo}|${this.lanesMuted}`;
    if (this.planSlot === slot && this.planRev === slot.rev && this.planKey === key) return;
    this.planKey = key;
    const d = slot.doc.data;
    const reg = new KeysoundRegistry();
    const plan = compileChart(d, {
      columns: modeDef(slot.mode).columns,
      name: 'preview',
      keysounds: reg,
      samples: this.lengths(),
    });
    this.plan = plan;
    this.reg = reg;
    this.timeline = new PlanTimeline(plan.tempo, slot.doc.resolution, d.stopEvents);
    this.planRev = slot.rev;
    this.planSlot = slot;
    const events: AudioEvent[] = engineEvents(
      plan,
      reg,
      (src) => this.loaded.get(src)?.id,
      (e) =>
        !(this.muteBgm && !e.lane) &&
        !(this.lanesMuted && e.lane) &&
        !(this.solo !== null && e.lane && e.x !== this.solo),
    );
    await this.backend.audio.setEvents(events);
  }

  /** The chart's clock (f32 tempo, STOPs as gaps) once `slot` is synced: what a take snaps by. */
  timelineFor(slot: ChartSlot): PlanTimeline | undefined {
    return this.planSlot === slot ? this.timeline : undefined;
  }

  /** Song milliseconds at a pulse, as EZ2PORT will play it. */
  msAt(slot: ChartSlot, pulse: number): number {
    if (!this.timeline || this.planSlot !== slot) return 0;
    return this.timeline.msAt(pulse);
  }

  /** The pulse at song milliseconds (the inverse of msAt). */
  pulseAt(slot: ChartSlot, ms: number): number {
    if (!this.timeline || this.planSlot !== slot) return 0;
    return Math.max(0, this.timeline.pulseAt(ms));
  }

  get playing(): boolean {
    return this.view.playing;
  }

  async play(slot: ChartSlot, fromPulse: number): Promise<void> {
    await this.sync(slot);
    if (!this.clock) await this.calibrate();
    const ms = this.timeline!.msAt(fromPulse);
    this.startMs = ms;
    this.lastMs = ms;
    this.startGen = this.clock?.generation ?? -1;
    await this.backend.audio.play(ms + this.settings.data.audioOffsetMs);
    this.view.playing = true;
    cancelAnimationFrame(this.raf);
    const tick = () => {
      if (!this.view.playing) return;
      const heard = this.heardMs();
      if (heard !== undefined) {
        this.view.cursor = Math.max(0, this.timeline!.pulseAt(heard));
        if (this.plan && heard > this.plan.endMs + 1500) {
          void this.stop();
          return;
        }
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  async stop(): Promise<void> {
    cancelAnimationFrame(this.raf);
    this.view.playing = false;
    await this.backend.audio.stop();
  }

  /** The plan last sent to the engine. */
  get currentPlan(): ChartPlan | undefined {
    return this.plan;
  }

  /** Song ms being heard now (undefined until the engine has started). */
  heardNow(): number | undefined {
    return this.view.playing ? this.heardMs() : undefined;
  }

  /** Sound one keysound of the compiled chart on a voice (a lane press). */
  async triggerKeysound(ks: number, voice: number, level: number, pan: number): Promise<void> {
    const def = this.reg?.defs[ks];
    const id = def ? this.loaded.get(def.src)?.id : undefined;
    if (!def || id === null || id === undefined) return;
    await this.backend.audio.trigger({
      sample: id,
      voice,
      level,
      pan,
      offset_ms: (def.startFrame * 1000) / PUBLISH_RATE,
      until_ms: def.endFrame === null ? null : (def.endFrame * 1000) / PUBLISH_RATE,
    });
  }

  /**
   * A page time (performance.now(), an event's timeStamp) on the engine's
   * host clock, in ms - the clock controller events are stamped on, so a key
   * and a pad press compare.
   */
  hostMsAtPerf(perfMs: number): number {
    return perfMs + this.offsetMs;
  }

  hostNowMs(): number {
    return this.hostMsAtPerf(performance.now());
  }

  /**
   * The song ms the speaker was playing at host time `hostMs` (undefined
   * until the engine has started this play). What a press is judged and
   * recorded at, before the player's input offset.
   */
  songMsAtHost(hostMs: number): number | undefined {
    const c = this.clock;
    if (!c || !c.playing || c.generation === this.startGen) return undefined;
    const frame = c.frame + ((hostMs * 1e6 - c.host_ns) * c.rate) / 1e9 - c.latency_frames;
    return (frame * 1000) / c.rate - this.settings.data.audioOffsetMs;
  }

  /** What the speaker is playing now, in song ms; undefined until the engine has started. */
  private heardMs(): number | undefined {
    const ms = this.songMsAtHost(this.hostNowMs());
    if (ms === undefined) return undefined;
    // Never backwards: a late buffer must not make the cursor jitter.
    this.lastMs = Math.max(this.lastMs, ms);
    return this.lastMs;
  }

  /** A whole sound on a voice, now (a recorded press on a lane: it cuts the lane's last). */
  async triggerSample(name: string, voice: number): Promise<void> {
    const id = this.loaded.get(name)?.id;
    if (id === null || id === undefined) return;
    await this.backend.audio.trigger({ sample: id, voice, offset_ms: 0, until_ms: null });
  }

  /** Hear a sound (or part of one) now, cutting the last audition. */
  async audition(name: string, fromMs = 0, untilMs: number | null = null): Promise<void> {
    const id = this.loaded.get(name)?.id;
    if (id === null || id === undefined) return;
    await this.backend.audio.trigger({
      sample: id,
      voice: AUDITION_VOICE,
      offset_ms: fromMs,
      until_ms: untilMs,
    });
  }

  forget(): void {
    void this.stop();
    this.loaded.clear();
    this.loadedRev++;
    this.plan = undefined;
    this.reg = undefined;
    this.planSlot = undefined;
    this.planRev = -1;
  }
}

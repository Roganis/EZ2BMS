// The song's preview in the editor: which chart's mix (or which audio file)
// and what window (ez2bms.song.json; chart-core publish/preview.ts), the
// whole song's loudness to pick the window from, auditioning it as the wheel
// loops it - restarted hard at its end - and the job a publish renders.

import {
  KeysoundRegistry,
  compileChart,
  engineEvents,
  modeDef,
  previewWindow,
  type ChartPlan,
  type PreviewSettings,
  type PreviewWindow,
} from '@ez2bms/chart-core';
import { soundPath } from '../audio/paths';
import { joinPath, type AudioEvent, type PreviewJob } from '../bridge';
import type { App } from './app.svelte';
import type { ChartSlot, Project } from './project.svelte';

interface Compiled {
  slot: ChartSlot;
  rev: number;
  plan: ChartPlan;
  reg: KeysoundRegistry;
}

export class PreviewState {
  constructor(private readonly app: App) {}

  /** Auditioning: the loop is running. */
  playing = $state(false);
  private loop: ReturnType<typeof setTimeout> | undefined;
  private audition: { sample: number; voice: number } | undefined;
  private compiled: Compiled | undefined;

  settings(p: Project): PreviewSettings {
    return p.sidecar.preview ?? {};
  }

  /** Change the setting (undefined members are removed; nothing left, no setting). */
  async set(patch: Partial<Record<keyof PreviewSettings, string | number | undefined>>) {
    const p = this.app.project;
    if (!p) return;
    const next: Record<string, string | number> = { ...($state.snapshot(p.sidecar.preview) ?? {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete next[k];
      else next[k] = v;
    }
    if (Object.keys(next).length) p.sidecar.preview = next as PreviewSettings;
    else delete p.sidecar.preview;
    await p.saveSidecar();
  }

  /** The chart the preview is mixed from: the one the song file names, else the first. */
  chart(p: Project): ChartSlot | undefined {
    const name = this.settings(p).chart;
    return p.charts.find((c) => c.file === name) ?? p.charts[0];
  }

  /** The chart compiled as the engine plays it (as Publish compiles it). */
  plan(slot: ChartSlot): Compiled {
    const c = this.compiled;
    if (c && c.slot === slot && c.rev === slot.rev) return c;
    const reg = new KeysoundRegistry();
    const plan = compileChart(slot.doc.data, {
      columns: modeDef(slot.mode).columns,
      name: 'preview',
      keysounds: reg,
      samples: this.app.audio.lengths(),
    });
    return (this.compiled = { slot, rev: slot.rev, plan, reg });
  }

  /** Where the song's notes are, ms (the window's default and its bounds). */
  noteMs(p: Project): number[] {
    const slot = this.chart(p);
    return slot ? this.plan(slot).plan.events.map((e) => e.ms) : [];
  }

  window(p: Project): PreviewWindow {
    return previewWindow(this.settings(p), this.noteMs(p));
  }

  /** The chart's events over the loaded samples (its sounds are loaded first). */
  private async liveEvents(p: Project, slot: ChartSlot): Promise<AudioEvent[]> {
    await this.app.audio.load(
      p,
      slot.doc.data.channels.map((c) => c.name),
    );
    const { plan, reg } = this.plan(slot);
    return engineEvents(plan, reg, (src) => this.app.audio.loadedInfo(src)?.id);
  }

  /**
   * The loudness of what the preview is cut from: `width` [min, max] pairs
   * over `endMs` - the chart's last sound out (each note's sound for as long
   * as it plays), or the file's length.
   */
  async overview(p: Project, width: number): Promise<{ peaks: Int16Array; endMs: number }> {
    const s = this.settings(p);
    if (s.file) {
      await this.app.audio.load(p, [s.file]);
      const info = this.app.audio.loadedInfo(s.file);
      const empty = { peaks: new Int16Array(width * 2), endMs: 0 };
      if (!info || info.id === null) return empty;
      return {
        peaks: await this.app.backend.audio.thumbs([info.id], width),
        endMs: info.seconds * 1000,
      };
    }
    const slot = this.chart(p);
    if (!slot) return { peaks: new Int16Array(width * 2), endMs: 0 };
    const events = await this.liveEvents(p, slot);
    const { plan, reg } = this.plan(slot);
    let endMs = 0;
    for (const e of plan.events) {
      const len = (this.app.audio.loadedInfo(reg.defs[e.keysound]!.src)?.seconds ?? 0) * 1000;
      endMs = Math.max(endMs, Math.min(e.untilMs ?? Infinity, e.originMs + len), e.ms);
    }
    endMs = Math.ceil(endMs) + 250;
    return { peaks: await this.app.backend.audio.previewOverview(events, endMs, width), endMs };
  }

  /** Play the preview as the wheel will: faded, looped with a hard restart. */
  async play(p: Project): Promise<void> {
    this.stop();
    const s = this.settings(p);
    const w = this.window(p);
    const at = { from_ms: w.startMs, length_ms: w.lengthMs, fade_ms: w.fadeMs };
    const slot = this.chart(p);
    const job: PreviewJob = s.file
      ? { file: joinPath(p.dir, s.file), ...at }
      : { events: slot ? await this.liveEvents(p, slot) : [], ...at };
    const a = await this.app.backend.audio.preview(job);
    this.audition = a;
    this.playing = true;
    const again = () => {
      if (!this.playing) return;
      void this.app.backend.audio.trigger({ sample: a.sample, voice: a.voice });
      this.loop = setTimeout(again, a.seconds * 1000);
    };
    again();
  }

  stop(): void {
    clearTimeout(this.loop);
    if (this.playing && this.audition)
      // An empty sound on the voice silences it.
      void this.app.backend.audio.trigger({ ...this.audition, until_ms: 0 });
    this.playing = false;
  }

  /** What a publish renders into preview.ssf: sources are the song folder's files. */
  packageJob(p: Project): PreviewJob | undefined {
    const s = this.settings(p);
    const w = this.window(p);
    const at = { from_ms: w.startMs, length_ms: w.lengthMs, fade_ms: w.fadeMs };
    if (s.file) return { file: s.file, ...at };
    const slot = this.chart(p);
    if (!slot) return undefined;
    const { plan, reg } = this.plan(slot);
    const sources: string[] = [];
    // Bookkeeping for this job only; nothing renders from it.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const index = new Map<string, number>();
    const events = engineEvents(plan, reg, (src) => {
      let i = index.get(src);
      if (i === undefined) {
        index.set(src, (i = sources.length));
        sources.push(soundPath(p.dir, p.samples, src));
      }
      return i;
    });
    return events.length ? { sources, events, ...at } : undefined;
  }
}

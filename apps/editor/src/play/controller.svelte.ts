// Play mode: autoplay (everything KOOL, as EZ2PORT's --auto) and test play
// (you press, on the keyboard or a controller, through the input hub with
// the player's bindings), judged by chart-core's port of the engine's
// score.c, timed by the audio clock.
//
// In test play the engine plays the backing only. A key press sounds the
// lane's nearest keysound on the lane's own voice, whether or not it hits,
// and a note left unpressed is silent - as the cabinet does. Each channel
// goes where EZ2PORT sends it (chart-core routeChannel); in ScratchMix the
// turntable strums and the keys are frets (engine/strum.ts).

import {
  effectiveIni,
  JUDGEMENT_PRESETS,
  J,
  LIFE_PRESETS,
  modeDef,
  PlaySession,
  routeChannel,
  songIniFrom,
  type ChannelEdge,
  type Column,
  type JudgeFx,
  type SoundCmd,
} from '@ez2bms/chart-core';
import { SvelteSet } from 'svelte/reactivity';
import type { App } from '../state/app.svelte';
import type { ChartSlot } from '../state/project.svelte';

const LANE_VOICE_BASE = 1 << 16;

export interface Hud {
  kind: 'auto' | 'test';
  combo: number;
  score: number;
  gauge: number;
  counts: number[];
  total: number;
  /** The last judgement, with a sequence number so the same one re-animates. */
  judge: { j: J; early?: boolean; seq: number } | null;
}

export interface Result {
  kind: 'auto' | 'test';
  grade: string;
  score: number;
  maxScore: number;
  rate: number;
  counts: number[];
  maxCombo: number;
  total: number;
  gauge: number;
  failed: boolean;
  title: string;
  label: string;
  /** Stopped before the end: graded on the notes played so far. */
  partial: boolean;
}

export class PlayController {
  active = $state<'auto' | 'test' | null>(null);
  hud = $state<Hud | null>(null);
  result = $state<Result | null>(null);
  /** Lanes held down (bmson x), for the key beams. */
  readonly pressed = new SvelteSet<number>();
  /**
   * Notes already hit: they leave the field. Deliberately NOT reactive: the
   * renderer reads it every frame while playing, and a reactive set would
   * re-run the UI's effects on every hit.
   */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  readonly hidden = new Set<number>();
  private session: PlaySession | undefined;
  private slot: ChartSlot | undefined;
  private cols: readonly Column[] = [];
  private raf = 0;
  private seq = 0;
  private detach: (() => void) | undefined;

  constructor(private readonly app: App) {}

  async start(kind: 'auto' | 'test'): Promise<void> {
    const app = this.app;
    const slot = app.slot;
    if (!slot) return;
    await this.stop(false);
    if (app.view.playing) await app.audio.stop();
    app.view.mode = 'play';
    this.slot = slot;
    const info = slot.doc.data.info;
    const ini = effectiveIni(
      songIniFrom(
        info.level ?? 1,
        info.judgementDeltas ?? JUDGEMENT_PRESETS[0]!.deltas,
        info.lifeDeltas ?? LIFE_PRESETS[0]!.deltas,
      ),
      slot.mode,
    );
    app.audio.lanesMuted = kind === 'test';
    await app.audio.sync(slot);
    const plan = app.audio.currentPlan!;
    const cols = modeDef(slot.mode).columns;
    this.cols = cols;
    const res = slot.doc.resolution;
    const from = app.view.cursor;
    const startMs = app.audio.msAt(slot, from);
    this.session = new PlaySession(plan, cols, ini, {
      autoplay: kind === 'auto',
      startMs,
      strum: slot.mode === 'scratch',
    });
    this.hidden.clear();
    this.pressed.clear();
    this.result = null;
    this.hud = {
      kind,
      combo: 0,
      score: 0,
      gauge: this.session.score.gauge,
      counts: [0, 0, 0, 0, 0, 0],
      total: this.session.totalNotes,
      judge: null,
    };
    this.active = kind;
    if (kind === 'test')
      this.detach = app.input.attach({ keys: 'all', pads: true, edges: (e) => this.onEdges(e) });
    // A beat of lead-in before the cursor.
    await app.audio.play(slot, Math.max(0, from - res));
    cancelAnimationFrame(this.raf);
    const tick = () => {
      if (!this.active) return;
      const ms = app.audio.heardNow();
      if (ms !== undefined && this.session) {
        const r = this.session.advance(ms);
        this.show(r.fx);
        if (this.session.finished || !app.view.playing) {
          void this.stop(true);
          return;
        }
      } else if (!app.view.playing) {
        void this.stop(true);
        return;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Stop; with `report`, show the result card. */
  async stop(report: boolean): Promise<void> {
    cancelAnimationFrame(this.raf);
    this.detach?.();
    this.detach = undefined;
    const s = this.session;
    const kind = this.active;
    this.active = null;
    this.pressed.clear();
    this.app.audio.lanesMuted = false;
    if (this.app.view.playing) await this.app.audio.stop();
    if (report && s && kind && this.slot) {
      const sc = s.score;
      const partial = !s.finished;
      const total = partial ? sc.notes : s.totalNotes;
      this.result = {
        kind,
        grade: sc.gradeName(sc.grade(total)),
        score: sc.score,
        maxScore: sc.maxFor(total),
        rate: sc.rate(total),
        counts: [...sc.counts],
        maxCombo: sc.maxCombo,
        total,
        gauge: sc.gauge,
        failed: sc.failed,
        title: this.slot.doc.data.info.title ?? '',
        label: `${this.slot.label} · level ${this.slot.level}`,
        partial,
      };
    }
    this.session = undefined;
  }

  /** Channels from the input hub: presses and releases, strums in ScratchMix. */
  private onEdges(edges: readonly ChannelEdge[]): void {
    const s = this.session;
    const slot = this.slot;
    if (this.active !== 'test' || !s || !slot) return;
    for (const e of edges) {
      const route = routeChannel(slot.mode, this.cols, e.channel);
      if (!route) continue;
      if ('strum' in route) {
        if (!e.down) continue;
        const at = this.app.input.songMs(e.ms);
        if (at !== undefined) this.sound(s.strum(route.strum, at));
        continue;
      }
      const x = this.cols[route.column]!.x;
      if (!e.down) {
        this.pressed.delete(x);
        s.release(route.column);
        continue;
      }
      this.pressed.add(x);
      // When it was pressed, not when this ran (the hub's times).
      const at = this.app.input.songMs(e.ms);
      if (at !== undefined) this.sound(s.press(route.column, at));
    }
  }

  private sound(r: { sounds: SoundCmd[]; fx: JudgeFx[] }): void {
    for (const snd of r.sounds) {
      const i = Number(snd.voice.slice(4));
      void this.app.audio.triggerKeysound(snd.keysound, LANE_VOICE_BASE + i, snd.level, snd.pan);
    }
    this.show(r.fx);
  }

  private show(fx: JudgeFx[]): void {
    const s = this.session;
    const h = this.hud;
    if (!s || !h) return;
    for (const f of fx) {
      if (!f.instalment && f.noteId !== undefined && f.j !== J.MISS) this.hidden.add(f.noteId);
      h.judge = { j: f.j, ...(f.early !== undefined ? { early: f.early } : {}), seq: ++this.seq };
    }
    if (fx.length) {
      h.combo = s.score.combo;
      h.score = s.score.score;
      h.gauge = s.score.gauge;
      h.counts = [...s.score.counts];
    }
  }
}

// Play mode: autoplay (everything KOOL, as EZ2PORT's --auto) and test play
// (you press, with EZ2PORT's keys), judged by chart-core's port of the
// engine's score.c, timed by the audio clock.
//
// In test play the engine plays the backing only. A key press sounds the
// lane's nearest keysound on the lane's own voice, whether or not it hits,
// and a note left unpressed is silent - as the cabinet does.

import {
  effectiveIni,
  JUDGEMENT_PRESETS,
  J,
  LIFE_PRESETS,
  modeDef,
  PlaySession,
  songIniFrom,
  type JudgeFx,
} from '@ez2bms/chart-core';
import { SvelteSet } from 'svelte/reactivity';
import { DEFAULT_LANE_KEYS, laneForKey } from '../input/lanekeys';
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
  /** code -> lane, from the player's keys.ini when there is one. */
  keys: Record<string, number> = DEFAULT_LANE_KEYS;
  private session: PlaySession | undefined;
  private slot: ChartSlot | undefined;
  private raf = 0;
  private seq = 0;
  /** bmson lane -> the session's lane index, for this run (not UI state). */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  private laneIndex = new Map<number, number>();
  private laneSet: ReadonlySet<number> = new SvelteSet();

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
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    this.laneIndex = new Map(cols.map((c) => [c.x, c.index]));
    this.laneSet = new SvelteSet(this.laneIndex.keys());
    const res = slot.doc.resolution;
    const from = app.view.cursor;
    const startMs = app.audio.msAt(slot, from);
    this.session = new PlaySession(plan, cols, ini, { autoplay: kind === 'auto', startMs });
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

  /** A key went down or up. True when it was a lane key (and was used). */
  key(e: KeyboardEvent, down: boolean): boolean {
    if (this.active !== 'test' || !this.session || !this.slot) return false;
    const x = laneForKey(e.code, this.laneSet, this.keys);
    if (x === undefined) return false;
    e.preventDefault();
    const lane = this.laneIndex.get(x)!;
    if (!down) {
      this.pressed.delete(x);
      this.session.release(lane);
      return true;
    }
    if (e.repeat) return true;
    this.pressed.add(x);
    const heard = this.app.audio.heardNow();
    if (heard === undefined) return true;
    // When the key actually went down, not when this handler ran.
    const at = heard - (performance.now() - e.timeStamp) - this.app.settings.data.inputOffsetMs;
    const r = this.session.press(lane, at);
    for (const snd of r.sounds) {
      const i = Number(snd.voice.slice(4));
      void this.app.audio.triggerKeysound(snd.keysound, LANE_VOICE_BASE + i, snd.level, snd.pan);
    }
    this.show(r.fx);
    return true;
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

// The latency tests in Controls and timing: tap along to a steady beat and
// the editor works out how late this machine hears, shows and takes presses.
//
// - The sound test plays clicks. Taps are timed as pressed (the input hub)
//   against the song clock - which already allows for the audio device's own
//   latency - without the input offset: how late they land is the INPUT
//   offset (the time from hearing a beat to the press reaching the editor,
//   the player's habit included).
// - The picture test flashes silently. Its taps have the input offset taken
//   off already, so how late they land is the PICTURE offset: how much
//   later the screen shows a frame than the clock says. The shown cursor is
//   then drawn that much ahead.
//
// 20 beats at 120 BPM from 1 s; the first 4 are warm-up; chart-core's
// calibrate() drops the slips and takes the median (input/calibrate.ts).

import { calibrate, type Calibration, type Tap } from '@ez2bms/chart-core';
import type { App } from './app.svelte';

export type CalibrationKind = 'sound' | 'picture';

export const CAL_FIRST_MS = 1000;
export const CAL_INTERVAL_MS = 500;
export const CAL_BEATS = 20;
export const CAL_WARMUP = 4;
/** How long the picture test's flash stays lit. */
const FLASH_MS = 90;

export class Calibrator {
  kind = $state<CalibrationKind | null>(null);
  running = $state(false);
  /** The beat under way (-1 before the first). */
  beat = $state(-1);
  /** The picture test's flash is lit. */
  flash = $state(false);
  taps = $state(0);
  result = $state<Calibration | null>(null);
  /** The test ran and too few taps were usable. */
  failed = $state(false);
  private list: Tap[] = [];
  private detach: (() => void) | undefined;
  private raf = 0;

  constructor(private readonly app: App) {}

  beatMs(k: number): number {
    return CAL_FIRST_MS + k * CAL_INTERVAL_MS;
  }

  async start(kind: CalibrationKind): Promise<void> {
    this.stop();
    const app = this.app;
    this.kind = kind;
    this.list = [];
    this.taps = 0;
    this.result = null;
    this.failed = false;
    this.beat = -1;
    const beats = Array.from({ length: CAL_BEATS }, (_, k) => ({
      ms: this.beatMs(k),
      accent: k % 4 === 0,
    }));
    const events = kind === 'sound' ? await app.audio.clickEvents(beats) : [];
    this.detach = app.input.attach({
      keys: 'all',
      pads: true,
      edges: (edges) => {
        for (const e of edges) if (e.down) this.tap(e.ms);
      },
    });
    this.running = true;
    await app.audio.playTrack(events);
    const endMs = this.beatMs(CAL_BEATS - 1) + CAL_INTERVAL_MS;
    const tick = () => {
      if (!this.running) return;
      const heard = app.audio.songMsAtHost(app.audio.hostNowMs());
      if (heard !== undefined) {
        const k = Math.floor((heard - CAL_FIRST_MS) / CAL_INTERVAL_MS);
        this.beat = Math.min(k, CAL_BEATS - 1);
        this.flash =
          kind === 'picture' && k >= 0 && k < CAL_BEATS && heard - this.beatMs(k) < FLASH_MS;
        if (heard > endMs) return void this.finish();
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** A press at host time `hostMs`: which beat it answered, and how late. */
  private tap(hostMs: number): void {
    const app = this.app;
    const t = this.kind === 'picture' ? app.input.songMs(hostMs) : app.audio.songMsAtHost(hostMs);
    if (t === undefined) return;
    const k = Math.round((t - CAL_FIRST_MS) / CAL_INTERVAL_MS);
    if (k < 0 || k >= CAL_BEATS || this.list.some((x) => x.beat === k)) return;
    const offsetMs = t - this.beatMs(k);
    if (Math.abs(offsetMs) > CAL_INTERVAL_MS / 2) return;
    this.list.push({ beat: k, offsetMs });
    this.taps = this.list.filter((x) => x.beat >= CAL_WARMUP).length;
  }

  private finish(): void {
    const taps = this.list;
    this.stop();
    this.result = calibrate(taps, { warmup: CAL_WARMUP });
    this.failed = !this.result;
  }

  /** Stop a test under way (its result, if any, stays). */
  stop(): void {
    cancelAnimationFrame(this.raf);
    this.detach?.();
    this.detach = undefined;
    if (this.running) void this.app.audio.stopTrack();
    this.running = false;
    this.flash = false;
  }

  /** Use the result: the input offset from the sound test, the picture offset from the picture test. */
  apply(): void {
    const r = this.result;
    if (!r || !this.kind) return;
    const v = Math.round(r.offsetMs);
    this.app.settings.set(this.kind === 'sound' ? 'inputOffsetMs' : 'visualOffsetMs', v);
    this.result = null;
  }
}

// The one way presses reach the editor: keyboard and game controllers alike,
// through chart-core's InputMapper (EZ2PORT's input layer: a channel is the OR
// of its bindings, debounced; hats; the turntable), to whatever is listening -
// test play, step input, and later recording and calibration.
//
// - Times. Every event is put on the audio engine's host clock: a key by its
//   timeStamp (a page time, converted), a pad by SDL's stamp (already host
//   time, crates/ez2bms-input). EZ2PORT backdates a press by its age and
//   ignores an age over 200 ms (taking it as now); so does this, once, here.
//   `songMs` turns a host time into song time with the player's input offset.
// - Keys. Only while something listens, and only keys that are bound: those
//   are kept from the editor (preventDefault, and no other listener sees
//   them), so with Ctrl as the turntable, Ctrl+Z in the middle of a song
//   is Key1 and a scratch, not an undo. A 'plain' listener (step input)
//   takes only unmodified presses, so shortcuts keep working around it.
//   Losing the window's focus releases every key.
// - Pads are open only while a listener wants them (src-tauri input.rs):
//   an open DirectInput board is closed to every other program.
// - Bindings are the editor's own (settings.controls), in keys.ini's grammar.
//   Until the player chooses, EZ2PORT's keys.ini is taken from where the port
//   keeps it (and kept), else the port's defaults are used; Debounce likewise
//   from settings.ini.

import {
  DEFAULT_DEBOUNCE_MS,
  formatKeyconf,
  fromBytes,
  InputMapper,
  keyconfDefaults,
  parseKeyconf,
  portDebounce,
  scancodeForCode,
  type ChannelEdge,
  type Keyconf,
  type RawInput,
} from '@ez2bms/chart-core';
import type { PadEvent, PadInfo } from '../bridge';
import type { App } from '../state/app.svelte';
import type { Controls } from '../state/settings.svelte';

/** EZ2PORT takes an event older than this as happening now (the age rule). */
export const MAX_AGE_MS = 200;

export interface HubUser {
  /**
   * 'all': every bound key is the game's (test play, recording). 'plain':
   * only presses without Ctrl, Alt or Meta, so shortcuts still work (step
   * input). 'none': the keys stay the editor's (the Controls dialog, which
   * only watches).
   */
  keys: 'all' | 'plain' | 'none';
  /** Open the controllers while attached. */
  pads: boolean;
  /** Channel edges in time order; `ms` is host time (see songMs). */
  edges(edges: readonly ChannelEdge[]): void;
}

/** Where the bindings in force came from: the editor's own, or EZ2PORT's defaults. */
export type ControlsSource = 'editor' | 'defaults';

/** Stored controls, whatever an older or hand-edited settings file holds. */
export function normControls(c: unknown): Controls {
  const o = (c ?? {}) as Partial<Controls>;
  return {
    ini: typeof o.ini === 'string' ? o.ini : null,
    debounceMs:
      typeof o.debounceMs === 'number' && o.debounceMs >= 0 && o.debounceMs <= 100
        ? Math.round(o.debounceMs)
        : null,
  };
}

/** keys.ini text for settings: the port's layout, as text (names are bytes in chart-core). */
export const controlsIni = (conf: Keyconf): string => fromBytes(formatKeyconf(conf));

export class InputHub {
  /** The controllers open now (empty while closed). */
  devices = $state<PadInfo[]>([]);
  /** Why controllers can't be used (keyboard only), when they can't. */
  padError = $state<string | null>(null);
  source = $state<ControlsSource>('defaults');
  /** The keys.ini the bindings were taken from, when they were taken this session. */
  sourcePath = $state<string | null>(null);
  readonly mapper = new InputMapper(keyconfDefaults());
  // Bookkeeping, not UI state: nothing renders these.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  private readonly users = new Set<HubUser>();
  /** Keys whose press was taken: their release is taken too. */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  private readonly taken = new Set<number>();
  private known: string[] = [];
  private held = false;
  private raf = 0;
  private capturing: ((token: string | null) => void) | null = null;

  constructor(private readonly app: App) {}

  /** Listen from now on (once, at start-up). */
  start(): void {
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    window.addEventListener('blur', this.onBlur);
    const input = this.app.backend.input;
    input.stream((evs) => this.onPads(evs));
    void input
      .info()
      .then((i) => (this.padError = i.error))
      .catch(() => {});
    // A reloaded page starts with the pads closed, whatever the last one held.
    void input.hold(false).catch(() => {});
  }

  /** Stop listening altogether (tests; the app's hub lives as long as the page). */
  stop(): void {
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    window.removeEventListener('blur', this.onBlur);
    this.users.clear();
    this.update();
  }

  /**
   * Put the stored bindings in force; with none stored yet, take EZ2PORT's
   * keys.ini (and settings.ini's Debounce) and keep them as the editor's.
   */
  async loadControls(): Promise<void> {
    const s = this.app.settings;
    let c = normControls(s.data.controls);
    if (c.ini === null) {
      const port = await this.readPort();
      if (port?.keysPath) {
        c = { ini: controlsIni(port.conf), debounceMs: c.debounceMs ?? port.debounceMs };
        s.set('controls', c);
        this.sourcePath = port.keysPath;
      }
    }
    this.apply(c);
  }

  /** Bindings and debounce in force from now on (the Controls dialog, and loading). */
  apply(c: Controls): void {
    const conf = c.ini === null ? keyconfDefaults() : parseKeyconf(c.ini).conf;
    this.mapper.setBindings(conf);
    this.mapper.debounceMs = c.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.source = c.ini === null ? 'defaults' : 'editor';
  }

  /** The bindings in force. */
  conf(): Keyconf {
    const c = normControls(this.app.settings.data.controls);
    return c.ini === null ? keyconfDefaults() : parseKeyconf(c.ini).conf;
  }

  /**
   * EZ2PORT's keys.ini (over its defaults, as ez2play loads it) and
   * settings.ini Debounce, from the first place the port keeps each.
   */
  async readPort(): Promise<{
    conf: Keyconf;
    keysPath: string | null;
    debounceMs: number | null;
  } | null> {
    const { backend, settings } = this.app;
    const files = await backend.input
      .configFiles(settings.data.ez2play, settings.data.gameRoot)
      .catch(() => []);
    const read = async (kind: 'keys' | 'settings') => {
      for (const f of files.filter((f) => f.kind === kind && f.exists)) {
        const bytes = await backend.readFile(f.path).catch(() => null);
        if (bytes) return { path: f.path, bytes };
      }
      return null;
    };
    const keys = await read('keys');
    const cfg = await read('settings');
    if (!keys && !cfg) return null;
    return {
      conf: keys ? parseKeyconf(keys.bytes).conf : keyconfDefaults(),
      keysPath: keys?.path ?? null,
      debounceMs: cfg ? (portDebounce(cfg.bytes) ?? null) : null,
    };
  }

  /** Start listening; returns the function that stops. */
  attach(user: HubUser): () => void {
    this.users.add(user);
    this.update();
    return () => {
      if (!this.users.delete(user)) return;
      this.update();
    };
  }

  /**
   * The next control pressed, as a binding token (chart-core's capture: a
   * pad's before a key's, `Left Ctrl` or `0810:e501/b3`); axes too with
   * `wantAxes`. Every key is taken while it waits - bound or not - and Esc
   * gives null. Something must be attached (the pads must be open).
   */
  capture(wantAxes: boolean): Promise<string | null> {
    this.cancelCapture();
    this.mapper.armCapture(wantAxes);
    return new Promise((resolve) => (this.capturing = resolve));
  }

  get isCapturing(): boolean {
    return this.capturing !== null;
  }

  cancelCapture(): void {
    this.finishCapture(null);
  }

  private finishCapture(token: string | null): void {
    const done = this.capturing;
    if (!done) return;
    this.capturing = null;
    this.mapper.disarmCapture();
    done(token);
  }

  private pollCapture(): void {
    if (!this.capturing) return;
    const t = this.mapper.captured();
    if (t) this.finishCapture(t);
  }

  /** Song ms for a host time, with the player's input offset; undefined when the song isn't playing. */
  songMs(hostMs: number): number | undefined {
    const ms = this.app.audio.songMsAtHost(hostMs);
    return ms === undefined ? undefined : ms - this.app.settings.data.inputOffsetMs;
  }

  /** EZ2PORT's age rule: an event from the future or over 200 ms old is now. */
  private aged(hostMs: number): number {
    const now = this.app.audio.hostNowMs();
    const age = now - hostMs;
    return age < 0 || age > MAX_AGE_MS ? now : hostMs;
  }

  private update(): void {
    const pads = [...this.users].some((u) => u.pads);
    if (pads !== this.held) {
      this.held = pads;
      // Pad stamps are host time: the page must know the host clock first.
      const audio = this.app.audio;
      void (audio.calibrated ? Promise.resolve() : audio.calibrate())
        .then(() => this.app.backend.input.hold(this.held))
        .catch((e: unknown) => (this.padError = e instanceof Error ? e.message : String(e)));
    }
    cancelAnimationFrame(this.raf);
    if (!this.users.size) {
      // Nothing listens: whatever is held is let go, and nothing is being bound.
      this.cancelCapture();
      this.taken.clear();
      this.deliver(this.mapper.releaseKeys(this.app.audio.hostNowMs()));
      return;
    }
    // Turntable holds run out and velocity axes turn with time, not events.
    const tick = () => {
      this.deliver(this.mapper.tick(this.app.audio.hostNowMs()));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private feed(ev: RawInput): void {
    this.deliver(this.mapper.input(ev));
    this.pollCapture();
  }

  private deliver(edges: readonly ChannelEdge[]): void {
    if (!edges.length) return;
    for (const u of [...this.users]) u.edges(edges);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.users.size || typing(e)) return;
    const sc = scancodeForCode(e.code);
    if (this.capturing) {
      // Binding by pressing: any key is the answer, Esc is no answer.
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Escape') return this.cancelCapture();
      if (!sc || e.repeat) return;
      this.taken.add(sc);
      const ms = this.aged(this.app.audio.hostMsAtPerf(e.timeStamp));
      return this.feed({ kind: 'key', scancode: sc, down: true, ms });
    }
    if (!sc || !this.mapper.keyBound(sc)) return;
    const plain = !(e.ctrlKey || e.altKey || e.metaKey);
    const users = [...this.users];
    if (!users.some((u) => u.keys === 'all' || (plain && u.keys === 'plain'))) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.taken.add(sc);
    if (e.repeat) return;
    const ms = this.aged(this.app.audio.hostMsAtPerf(e.timeStamp));
    this.feed({ kind: 'key', scancode: sc, down: true, ms });
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const sc = scancodeForCode(e.code);
    if (!sc || !this.taken.delete(sc)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const ms = this.aged(this.app.audio.hostMsAtPerf(e.timeStamp));
    this.feed({ kind: 'key', scancode: sc, down: false, ms });
  };

  private readonly onBlur = (): void => {
    this.taken.clear();
    this.deliver(this.mapper.releaseKeys(this.app.audio.hostNowMs()));
  };

  private onPads(evs: readonly PadEvent[]): void {
    for (const ev of evs) {
      if (ev.kind === 'devices') {
        // A rescan clears every pad's state, as the port's does.
        const now = this.app.audio.hostNowMs();
        for (const d of this.known) this.deliver(this.mapper.forget(d, now));
        this.known = ev.devices.map((d) => d.key);
        this.devices = ev.devices;
        continue;
      }
      const ms = this.aged(ev.hostNs / 1e6);
      if (ev.kind === 'button')
        this.feed({ kind: 'button', device: ev.device, index: ev.index, down: ev.down, ms });
      else this.feed({ kind: ev.kind, device: ev.device, index: ev.index, value: ev.value, ms });
    }
  }
}

/** Typing into a field: its keys are its own. */
function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

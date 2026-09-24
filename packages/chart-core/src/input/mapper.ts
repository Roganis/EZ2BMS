// Controls to channels: which of EZ2PORT's input channels are down, and when
// each went down or up, from key and pad events. A transcription of the
// port's input layer (third_party/ez2port-core/reference ezinput.c and
// ezpad.c - platform code, built on SDL, so not in the oracle; the port's own
// test cases for it are in test/input-mapper.test.ts).
//
// - A channel is the OR of its bindings (up to 4: a key, a pad button, a hat
//   direction), recomputed on every edge, so releasing one of two held
//   controls does not release the channel.
// - A key repeat is not a press.
// - Debounce: a second edge on a channel within `debounceMs` (8, the port's
//   settings.ini default) of its last is chatter and ignored; the level is
//   read again at the next input event, as the port does it.
// - A hat direction is held only while the hat reads exactly it: diagonals
//   are directions of their own.
// - An axis bound as a turntable moves an 8-bit position (a full axis swing
//   is one turn, 256 units, the difference taken across the wrap) and also
//   raises the digital scratch channels: any movement (TT_STEP_UNITS 1)
//   holds that direction for 90 ms (TT_HOLD_MS), a reversal drops the other
//   at once. A `vel` axis is a speed about centre, integrated once per 1/60 s
//   (the port's frame) with a dead band and 8 units a frame at full tilt.
//   These edges are forced: never debounced.
//
// Deliberate differences from the port: times are float ms on the audio
// engine's host clock (the port's are integer SDL ms); a turntable hold is
// released exactly at its deadline, not at the next frame; a time earlier
// than a channel's last edge is not chatter (the port's unsigned subtraction
// makes it so). Seats (2P playing 1P's side) and the mouse/virtual
// turntables' positions are not needed here and are left out.

import { HAT_NAMES, isAnalogBinding, parseBindspec, type Bindspec } from './bindspec';
import { KEY_CHANNELS, type Keyconf } from './keyconf';
import { scancodeFromName, scancodeName } from './scancodes';

/** The port's per-device limits (ezpad.c). */
export const PAD_LIMITS = { buttons: 64, axes: 16, hats: 8, pads: 8 } as const;

/** SDL_HAT_* masks, by HAT_NAMES index. */
const HAT_MASK = [1, 3, 2, 6, 4, 12, 8, 9] as const;

export const TT_STEP_UNITS = 1;
export const TT_HOLD_MS = 90;
/** The port's frame (60 Hz), which a velocity axis is integrated over: frame n is at n * 1000 / 60 ms. */

export type RawInput =
  /** A keyboard key by scancode (USB usage). */
  | { kind: 'key'; scancode: number; down: boolean; ms: number }
  | { kind: 'button'; device: string; index: number; down: boolean; ms: number }
  /** An SDL_HAT_* mask. */
  | { kind: 'hat'; device: string; index: number; value: number; ms: number }
  /** -32768..32767. */
  | { kind: 'axis'; device: string; index: number; value: number; ms: number };

export interface ChannelEdge {
  channel: number;
  down: boolean;
  ms: number;
}

interface Pad {
  btn: Uint8Array;
  hat: Uint8Array;
  axis: Int32Array;
}

type Binding =
  | { kind: 'key'; scancode: number }
  | { kind: 'button' | 'hat'; device: string; index: number; dir: number };

interface Turntable {
  spec?: Bindspec;
  pos: number;
  accum: number;
  delta: number;
  raw: number;
  haveRaw: boolean;
  velFrac: number;
  upUntil: number;
  downUntil: number;
  upDown: boolean;
  downDown: boolean;
}

const CH = (name: (typeof KEY_CHANNELS)[number]) => KEY_CHANNELS.indexOf(name);
/** Which two channels each turntable raises (up, down). */
const TT_CHANNELS: readonly (readonly [number, number])[] = [
  [CH('Scratch1'), CH('Scratch2')],
  [CH('P2Scratch1'), CH('P2Scratch2')],
];

const newTurntable = (spec?: Bindspec): Turntable => ({
  ...(spec ? { spec } : {}),
  pos: 128,
  accum: 0,
  delta: 0,
  raw: 0,
  haveRaw: false,
  velFrac: 0,
  upUntil: -Infinity,
  downUntil: -Infinity,
  upDown: false,
  downDown: false,
});

export class InputMapper {
  debounceMs: number;
  private bind: Binding[][] = [];
  private keys = new Set<number>();
  private pads = new Map<string, Pad>();
  private down: boolean[] = KEY_CHANNELS.map(() => false);
  private forced: boolean[] = KEY_CHANNELS.map(() => false);
  private lastEdge: (number | undefined)[] = KEY_CHANNELS.map(() => undefined);
  private tt: Turntable[] = [newTurntable(), newTurntable()];
  /** The next velocity frame to integrate, by number (its time is n * 1000 / 60, not a running sum). */
  private nextFrame: number | undefined;
  private capturePad: string | null = null;
  private captureKey = 0;
  private captureArmed = false;
  private captureAxes = false;

  constructor(conf: Keyconf, opts: { debounceMs?: number } = {}) {
    this.debounceMs = opts.debounceMs ?? 8;
    this.setBindings(conf);
  }

  /**
   * Bind every channel and turntable (ezBindControls/ezBindAnalog): keys SDL
   * has no name for, malformed tokens and analog specs bind nothing.
   */
  setBindings(conf: Keyconf): void {
    this.bind = KEY_CHANNELS.map((_, ch) => {
      const out: Binding[] = [];
      for (const name of (conf.names[ch] ?? []).slice(0, 4)) {
        const b = parseBindspec(name);
        if (!b) continue;
        if (b.kind === 'key') {
          const sc = scancodeFromName(b.key);
          if (sc) out.push({ kind: 'key', scancode: sc });
        } else if (b.kind === 'button' || b.kind === 'hat')
          out.push({ kind: b.kind, device: b.device, index: b.index, dir: b.dir });
      }
      return out;
    });
    this.tt = conf.analog.map((a) => {
      const b = a ? parseBindspec(a) : null;
      return newTurntable(b && isAnalogBinding(b) ? b : undefined);
    });
  }

  isDown(ch: number): boolean {
    return this.down[ch] ?? false;
  }

  /** A turntable's 8-bit position (128 at rest), and the movement since last asked. */
  turntable(which: 0 | 1): { pos: number; delta: number; bound: boolean } {
    const t = this.tt[which]!;
    const delta = t.delta;
    t.delta = 0;
    return { pos: t.pos & 0xff, delta, bound: !!t.spec };
  }

  /** What a pad reports now (for a live readout). */
  padState(device: string): Pad | undefined {
    return this.pads.get(device);
  }

  /** A device went away: its controls read as released. */
  forget(device: string, ms: number): ChannelEdge[] {
    this.pads.delete(device);
    return this.resolveAll(ms);
  }

  // ---- capture (a binding page's "press what you want") ------------------------

  armCapture(wantAxes: boolean): void {
    this.captureArmed = true;
    this.capturePad = null;
    this.captureKey = 0;
    this.captureAxes = wantAxes;
  }

  /** The control pressed since arming, as a binding token - a pad's before a key's. */
  captured(): string | null {
    if (!this.captureArmed) return null;
    const got = this.capturePad ?? (this.captureKey ? scancodeName(this.captureKey) : null);
    if (!got) return null;
    this.captureArmed = false;
    this.capturePad = null;
    this.captureKey = 0;
    return got;
  }

  private capture(token: string): void {
    if (this.captureArmed && this.capturePad === null) this.capturePad = token;
  }

  // ---- events ----------------------------------------------------------------

  input(ev: RawInput): ChannelEdge[] {
    // A turntable hold that ran out before this event ends first.
    const out = this.expire(ev.ms, false);
    switch (ev.kind) {
      case 'key': {
        if (ev.down && this.captureArmed && !this.captureKey) this.captureKey = ev.scancode;
        if (this.keys.has(ev.scancode) === ev.down) return out; // a repeat
        if (ev.down) this.keys.add(ev.scancode);
        else this.keys.delete(ev.scancode);
        return out.concat(this.resolveAll(ev.ms));
      }
      case 'button': {
        if (ev.index < 0 || ev.index >= PAD_LIMITS.buttons) return out;
        this.pad(ev.device).btn[ev.index] = ev.down ? 1 : 0;
        if (ev.down) this.capture(`${ev.device}/b${ev.index}`);
        return out.concat(this.resolveAll(ev.ms));
      }
      case 'hat': {
        if (ev.index < 0 || ev.index >= PAD_LIMITS.hats) return out;
        this.pad(ev.device).hat[ev.index] = ev.value;
        const d = HAT_MASK.indexOf(ev.value as (typeof HAT_MASK)[number]);
        if (ev.value !== 0 && d >= 0) this.capture(`${ev.device}/h${ev.index}.${HAT_NAMES[d]}`);
        return out.concat(this.resolveAll(ev.ms));
      }
      case 'axis': {
        if (ev.index < 0 || ev.index >= PAD_LIMITS.axes) return out;
        this.pad(ev.device).axis[ev.index] = ev.value;
        if (this.captureAxes) this.capture(`${ev.device}/a${ev.index}`);
        this.tt.forEach((t, which) => {
          const s = t.spec;
          if (s?.kind === 'axis' && s.device === ev.device && s.index === ev.index)
            out.push(...this.fromAxis(which, ev.value, ev.ms));
        });
        return out;
      }
    }
  }

  /**
   * Time passing with nothing arriving: velocity turntables turn, and holds
   * run out (each at its exact deadline). Call it every frame.
   */
  tick(ms: number): ChannelEdge[] {
    return this.expire(ms, true);
  }

  /** The window lost focus: every key it held is up (pads keep working). */
  releaseKeys(ms: number): ChannelEdge[] {
    this.keys.clear();
    return this.resolveAll(ms);
  }

  // ---- the resolver (ezinput.c) --------------------------------------------------

  private pad(device: string): Pad {
    let p = this.pads.get(device);
    if (!p) {
      p = {
        btn: new Uint8Array(PAD_LIMITS.buttons),
        hat: new Uint8Array(PAD_LIMITS.hats),
        axis: new Int32Array(PAD_LIMITS.axes),
      };
      this.pads.set(device, p);
    }
    return p;
  }

  /** A channel is down when ANY of its bindings is. */
  private level(ch: number): boolean {
    if (this.forced[ch]) return true;
    for (const b of this.bind[ch] ?? []) {
      if (b.kind === 'key') {
        if (this.keys.has(b.scancode)) return true;
      } else {
        const p = this.pads.get(b.device);
        if (!p) continue;
        if (b.kind === 'button' && p.btn[b.index]) return true;
        if (b.kind === 'hat' && HAT_MASK[b.dir] !== undefined && p.hat[b.index] === HAT_MASK[b.dir])
          return true;
      }
    }
    return false;
  }

  private resolve(ch: number, ms: number): ChannelEdge | undefined {
    const now = this.level(ch);
    if (now === this.down[ch]) return undefined;
    const last = this.lastEdge[ch];
    if (this.debounceMs > 0 && last !== undefined) {
      const dt = ms - last;
      if (dt >= 0 && dt < this.debounceMs) return undefined; // chatter
    }
    this.lastEdge[ch] = ms;
    this.down[ch] = now;
    return { channel: ch, down: now, ms };
  }

  private resolveAll(ms: number): ChannelEdge[] {
    const out: ChannelEdge[] = [];
    for (let ch = 0; ch < KEY_CHANNELS.length; ch++) {
      const e = this.resolve(ch, ms);
      if (e) out.push(e);
    }
    return out;
  }

  /** ez2_input_channel: a forced level, never debounced (the turntable's pair). */
  private force(ch: number, down: boolean, ms: number): ChannelEdge[] {
    this.forced[ch] = down;
    const now = this.level(ch);
    if (now === this.down[ch]) return [];
    this.lastEdge[ch] = ms;
    this.down[ch] = now;
    return [{ channel: ch, down: now, ms }];
  }

  // ---- the turntables (ezpad.c) ---------------------------------------------------

  /** tt_move: the position, and the digital pair following it. */
  private move(which: number, units: number, ms: number): ChannelEdge[] {
    const t = this.tt[which]!;
    const [up, dn] = TT_CHANNELS[which]!;
    if (!units) return [];
    const out: ChannelEdge[] = [];
    t.pos = (t.pos + units) & 0xff;
    t.delta += units;
    t.accum += units;
    while (t.accum >= TT_STEP_UNITS) {
      t.accum -= TT_STEP_UNITS;
      t.upUntil = ms + TT_HOLD_MS;
    }
    while (t.accum <= -TT_STEP_UNITS) {
      t.accum += TT_STEP_UNITS;
      t.downUntil = ms + TT_HOLD_MS;
    }
    // A reversal drops the other direction at once: on a wheel they are one control.
    if (units > 0 && t.downDown) {
      t.downUntil = -Infinity;
      t.downDown = false;
      out.push(...this.force(dn!, false, ms));
    }
    if (units < 0 && t.upDown) {
      t.upUntil = -Infinity;
      t.upDown = false;
      out.push(...this.force(up!, false, ms));
    }
    if (t.upUntil > ms && !t.upDown) {
      t.upDown = true;
      out.push(...this.force(up!, true, ms));
    }
    if (t.downUntil > ms && !t.downDown) {
      t.downDown = true;
      out.push(...this.force(dn!, true, ms));
    }
    return out;
  }

  /** tt_from_axis: a wrapping position, in 256 units a swing; a velocity axis only notes its reading. */
  private fromAxis(which: number, value: number, ms: number): ChannelEdge[] {
    const t = this.tt[which]!;
    if (t.spec?.velocity) {
      t.raw = value;
      t.haveRaw = true;
      if (this.nextFrame === undefined) this.nextFrame = Math.ceil((ms * 60) / 1000);
      return [];
    }
    const raw = t.spec?.reverse ? -value : value;
    if (!t.haveRaw) {
      t.raw = raw;
      t.haveRaw = true;
      return [];
    }
    let d = raw - t.raw;
    if (d > 32768) d -= 65536;
    if (d < -32768) d += 65536;
    t.raw = raw;
    const units = Math.trunc((d * 256) / 65536);
    if (units === 0 && d !== 0) {
      // Keep the remainder: a slow turn is many sub-unit steps.
      t.raw -= d;
      return [];
    }
    return this.move(which, units, ms);
  }

  /** tt_from_velocity, one frame's worth. */
  private fromVelocity(which: number, ms: number): ChannelEdge[] {
    const t = this.tt[which]!;
    if (!t.haveRaw) return [];
    let raw = t.spec?.reverse ? -t.raw : t.raw;
    if (raw > -1024 && raw < 1024) raw = 0;
    t.velFrac += raw * 8;
    const units = Math.trunc(t.velFrac / 32768);
    t.velFrac -= units * 32768;
    return this.move(which, units, ms);
  }

  /**
   * Everything time does up to `ms`, in time order: velocity frames, and each
   * hold released at its own deadline (reached, or - for an arriving event,
   * `inclusive` false - passed).
   */
  private expire(ms: number, inclusive: boolean): ChannelEdge[] {
    const out: ChannelEdge[] = [];
    const due = (at: number) => (inclusive ? at <= ms : at < ms);
    for (;;) {
      // The earliest thing due: a hold running out, or a velocity frame.
      let when = Infinity;
      let what: (() => ChannelEdge[]) | undefined;
      this.tt.forEach((t, which) => {
        const [up, dn] = TT_CHANNELS[which]!;
        if (t.upDown && due(t.upUntil) && t.upUntil < when) {
          when = t.upUntil;
          what = () => {
            t.upDown = false;
            return this.force(up!, false, t.upUntil);
          };
        }
        if (t.downDown && due(t.downUntil) && t.downUntil < when) {
          when = t.downUntil;
          what = () => {
            t.downDown = false;
            return this.force(dn!, false, t.downUntil);
          };
        }
      });
      const n = this.nextFrame;
      const frame = n === undefined ? Infinity : (n * 1000) / 60;
      if (n !== undefined && due(frame) && frame < when) {
        when = frame;
        what = () => {
          this.nextFrame = n + 1;
          const edges: ChannelEdge[] = [];
          this.tt.forEach((t, which) => {
            if (t.spec?.kind === 'axis' && t.spec.velocity)
              edges.push(...this.fromVelocity(which, frame));
          });
          return edges;
        };
      }
      if (!what) return out;
      out.push(...what());
    }
  }
}

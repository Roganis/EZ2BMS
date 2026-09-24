// EZ2PORT's song-select wheel as the port draws it (ez2/selectwheel.c, read
// off the original's m439f00, m438d30, m431ae0 and update2): where the song's
// disc and title plate sit on the select screen, the scroll's chase between
// songs, and the disc's swing between tiers. Pure arithmetic, transcribed in
// the C's own float32 steps (Math.fround after each), so the editor's wheel
// preview puts every disc and plate where the port does - the oracle
// `select-wheel` subcommand checks it (test/selectwheel.oracle.test.ts).

const f = Math.fround;

/** Idle ticks before the highlighted song's preview starts (0x1e). */
export const WHEEL_IDLE_PREVIEW = 0x1e;

/** A wheel: `count` songs on the ring, the cursor, and the scroll chasing cursor*100. */
export interface SelectWheel {
  count: number;
  cursor: number;
  /** Entry units of 100; float32. */
  scroll: number;
  /** Ticks since the cursor last moved (the game's f_20e894). */
  idle: number;
}

export function selectWheel(count: number, cursor = 0): SelectWheel {
  const n = count > 0 ? count : 1;
  const c = count > 0 ? ((cursor % count) + count) % count : 0;
  // Scroll starts on the cursor: no chase on entry. Idle starts AT the
  // threshold (songselectctor.cpp:314), so the first tick passes it and the
  // song under the cursor previews on the screen's first frame.
  return { count: n, cursor: c, scroll: f(c * 100), idle: WHEEL_IDLE_PREVIEW };
}

/**
 * ez2_select_wheel_step for button presses (the turntable's accumulator and
 * the hold-repeat are the cabinet's; a preview has only keys): `down` first,
 * then `up`, the cursor wrapped every tick, idle zeroed by a step. Call once
 * per tick; returns the net step.
 */
export function wheelStep(w: SelectWheel, down: boolean, up: boolean): number {
  let moved = 0;
  if (down) moved += 1;
  if (up) moved -= 1;
  w.cursor = (((w.cursor + moved) % w.count) + w.count) % w.count;
  if (down || up) w.idle = 0;
  w.idle++;
  return moved;
}

/** ez2_select_wheel_wants_preview: the dwell has passed; the cursor's song previews. */
export function wheelWantsPreview(w: SelectWheel): boolean {
  return w.idle > WHEEL_IDLE_PREVIEW;
}

/** ez2_select_wheel_chase: one frame of the stepped-velocity chase, the short way round. */
export function wheelChase(w: SelectWheel): void {
  const target = f(w.cursor * 100);
  const nf = f(w.count);
  const d = f(target - w.scroll);
  const add = (v: number) => (w.scroll = f(w.scroll + v));
  if (d > f(nf * 50)) {
    // The game's wrap-down ladder is 5/10/30/50, not 5/10/20/30: kept as read.
    const dd = f(d - f(nf * 100));
    if (dd > -50) add(-5);
    else if (dd > -100) add(-10);
    else if (dd > -200) add(-30);
    else add(-50);
  } else if (f(nf * -50) > d) {
    const du = f(d + f(nf * 100));
    if (50 > du) add(5);
    else if (100 > du) add(10);
    else if (200 > du) add(20);
    else add(30);
  } else if (50 > d && d > -50) add(d > 0 ? 5 : -5);
  else if (100 > d && d > -100) add(d > 0 ? 10 : -10);
  else if (200 > d && d > -200) add(d > 0 ? 20 : -20);
  else add(d > 0 ? 30 : -30);
  if (10 > d && d > -10) w.scroll = target;
  if (w.scroll > f(f(nf * 100) - 10) && target === 0) w.scroll = target;
  if (w.scroll > f(nf * 100)) w.scroll = f(w.scroll - f(nf * 100));
  if (0 > w.scroll) w.scroll = f(w.scroll + f(nf * 100));
}

// The engine's 1024-per-turn trig tables, as sinf/cosf at 1024ths.
const TURN = f(f(6.2831853) / f(1024));
const sin1024 = (k: number) => f(Math.sin(f(f(k) * TURN)));
const cos1024 = (k: number) => f(Math.cos(f(f(k) * TURN)));

function angleToY(a: number): number {
  const i = Math.trunc(a);
  const c = i - 0x34c < 0 ? f(-sin1024((0xb4 - i) & 0x3ff)) : sin1024((i + 0xb4) & 0x3ff);
  return f(f(f(f(1074 - f(c * 360)) - 600)) - 48);
}

export interface WheelPlace {
  /** The disc's CENTRE, 640x480 screen pixels. */
  x: number;
  y: number;
  /** Its side: 176 at the focus down to 112. */
  size: number;
  /** 0..255, splatted into every colour channel. */
  bright: number;
}

/**
 * ez2_select_wheel_place: where entry `i`'s disc is, or undefined when it is
 * off the arc. Only the focus is on screen: the cabinet shows one disc at a
 * time (its neighbours fly in along the arc while the scroll chases).
 */
export function wheelPlace(w: SelectWheel, i: number): WheelPlace | undefined {
  let d = f(f(i * 100) - w.scroll);
  if (d > f(w.count * 50)) d = f(d - f(w.count * 100));
  if (f(-w.count * 50) > d) d = f(d + f(w.count * 100));
  d = f(d * 2);
  if (!(800 > d && d > -400)) return undefined;
  const bright = 100 > d && d > -100 ? 255 - Math.abs(Math.trunc(d)) : 0x9b;
  let size: number;
  if (d >= 200 || -200 >= d) size = 112;
  else if (d >= 0) size = f(176 / f(1 + f(d * f(0.01))));
  else size = f(176 / f(1 - f(d * f(0.01))));
  let idx = Math.trunc(d) + 0x34c;
  if (idx < 0) idx = -0x34c - Math.trunc(d);
  idx &= 0x3ff;
  const x = f(angleToY(d) - 274);
  const y = f(f(f(f(f(f(444 - f(cos1024(idx) * 500)) - 500) + 480) - 56)) + 88);
  return { x, y, size, bright };
}

/** The disc's rest angle per tier: whole extra turns (the game's f_f4 index). */
export const SWING_TIER_INDEX = { NM: 0, HD: 1, SHD: 3, EX: 4 } as const;

/**
 * ez2_select_swing_tick: one frame of the focused disc's spring toward its
 * tier's rest angle - 0, 360, 720 or 1080 degrees - closing a sixth of the
 * gap, gated and clamped as compiled. Returns the new [angle, step].
 */
export function swingTick(diffIdx: number, angle: number, step: number): [number, number] {
  const sixth = f(0.16666667);
  if (diffIdx === 1) step = f(30 - f(f(angle - 180) * sixth));
  else if (diffIdx === 3) step = f(90 - f(f(angle - 180) * sixth));
  else if (diffIdx === 4) step = f(150 - f(f(angle - 180) * sixth));
  else step = f(angle * f(-0.16666667));
  if ((step > 0 && 1080 > angle) || (0 > step && angle > -360)) {
    angle = f(angle + step);
    if (angle > 1080) angle = 1080;
    else if (angle <= 0) angle = 0;
  }
  return [angle, step];
}

/** The title plate's y offset once its half-height is added (drawOne). */
export const RAIL_DY = 41;

/** How many rail slots the walk has: a list under 30 repeats down the rail (count * 60). */
export function railSlots(w: SelectWheel): number {
  return w.count < 0x1e ? w.count * 60 : w.count;
}

export interface RailPlace {
  /** The song this row shows (ring-wrapped). */
  entry: number;
  /** The plate's LEFT edge. */
  x: number;
  /** The drawer's y: the plate's TOP is y + plateHeight / 2 + RAIL_DY. */
  y: number;
  /** 0..255 (may go negative past the bottom edge, as the original's does). */
  bright: number;
}

/**
 * ez2_select_rail_place: the title plates down the left edge. The focus is
 * the row at d 700, in the gap the y bands open for it; a short list repeats.
 */
export function railPlace(w: SelectWheel, slot: number): RailPlace | undefined {
  const fine = w.count < 0x1e;
  const i = slot - 7;
  const wrap = fine ? f(w.count * 1000) : f(w.count * 50);
  let d = f(f(slot * 100) - w.scroll);
  if (slot < 0 || slot >= railSlots(w)) return undefined;
  if (d > wrap) d = f(d - f(w.count * 100));
  if (-wrap > d) d = f(f(w.count * 100) + d);
  if (85 > d || 1500 < d) return undefined;
  if ((i + w.count * 8) % w.count < 0) return undefined;
  let bright: number;
  if (d === 700) bright = 0xff;
  else if (d >= 701) bright = Math.trunc(d) >= 0x4b0 ? 0x5af - Math.trunc(d) : 0xff;
  else if (!(699 < d)) {
    const b = Math.trunc(d);
    bright = b > 0xfa ? 0xff : b;
  } else bright = 0xff;
  let idx = Math.trunc(f(f(d - 500) * 5));
  if (idx < 0) idx = -idx;
  idx &= 0x3ff;
  const c = cos1024(idx);
  const k1 = f(0.31695721);
  let y: number;
  if (599 >= d) y = f(f(d * k1) - (fine ? 104 : 106));
  else if (699 >= d) y = f(f(f(d * k1) + f(c * 10)) - (fine ? 95 : 97));
  else if (d >= 799) y = f(f(d * k1) - 31);
  else y = f(f(f(f(d * f(0.48076925)) + 34) - f(c * 22)) - (fine ? 214 : 216));
  return { entry: (i + w.count * 8) % w.count, x: f(f(76.5) - 50), y, bright };
}

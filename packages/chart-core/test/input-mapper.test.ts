// The input layer (input/mapper.ts), case for case against the port's own
// tests for it (third_party/ez2port-core/reference/test_inputchannel.c:
// or, timing, repeat, specs, analog, debounce) and its turntable rules
// (ezpad.c tt_move/tt_expire/tt_from_axis/tt_from_velocity).

import { describe, expect, it } from 'vitest';
import { KEY_CHANNELS, keyconfDefaults, type Keyconf } from '../src/input/keyconf';
import { InputMapper, TT_HOLD_MS, type ChannelEdge } from '../src/input/mapper';
import { scancodeFromName } from '../src/input/scancodes';

const ch = (name: (typeof KEY_CHANNELS)[number]) => KEY_CHANNELS.indexOf(name);
const sc = (name: string) => scancodeFromName(name);

/** A map with only `names` bound on `channel` (and nothing else anywhere). */
function only(channel: number, names: string[], analog: [string, string] = ['', '']): Keyconf {
  const c = keyconfDefaults();
  c.names = c.names.map(() => []);
  c.names[channel] = names;
  c.analog = analog;
  return c;
}

const key = (name: string, down: boolean, ms: number) =>
  ({ kind: 'key', scancode: sc(name), down, ms }) as const;
const on = (edges: ChannelEdge[], channel: number) => edges.filter((e) => e.channel === channel);

describe('the resolver (test_inputchannel.c)', () => {
  it('or: a channel is down while any of its bindings is', () => {
    const m = new InputMapper(only(ch('Key1'), ['A', 'B']), { debounceMs: 0 });
    expect(on(m.input(key('A', true, 100)), ch('Key1'))).toEqual([
      { channel: ch('Key1'), down: true, ms: 100 },
    ]);
    // The second going down is not a second press.
    expect(m.input(key('B', true, 110))).toEqual([]);
    // Releasing one while the other is held leaves the channel down.
    expect(m.input(key('A', false, 120))).toEqual([]);
    expect(m.isDown(ch('Key1'))).toBe(true);
    expect(m.input(key('B', false, 130))).toEqual([{ channel: ch('Key1'), down: false, ms: 130 }]);
  });

  it('timing: an event carries the time it arrived', () => {
    const m = new InputMapper(only(ch('Key2'), ['C']), { debounceMs: 0 });
    expect(m.input(key('C', true, 4321))).toEqual([{ channel: ch('Key2'), down: true, ms: 4321 }]);
    expect(m.input(key('C', false, 4327))).toEqual([
      { channel: ch('Key2'), down: false, ms: 4327 },
    ]);
  });

  it('repeat: a key repeat is not a new press', () => {
    const m = new InputMapper(only(ch('Key3'), ['D']), { debounceMs: 0 });
    const edges = [200, 210, 220].flatMap((t) => m.input(key('D', true, t)));
    expect(edges).toHaveLength(1);
    expect(m.input(key('D', false, 230))).toHaveLength(1);
  });

  it('specs: pads bind with nothing plugged in; malformed specs and axes bind nothing', () => {
    const c = keyconfDefaults();
    c.names = c.names.map(() => []);
    c.names[ch('Key4')] = ['0810:e501/b3'];
    c.names[ch('Key5')] = ['0810:e501/h0.up'];
    c.names[ch('Key6')] = ['0810:e501/b'];
    c.names[ch('Key7')] = ['0810:e501/a0', 'Semicolon'];
    const m = new InputMapper(c, { debounceMs: 0 });
    expect(m.input({ kind: 'button', device: '0810:e501', index: 3, down: true, ms: 1 })).toEqual([
      { channel: ch('Key4'), down: true, ms: 1 },
    ]);
    // Up-right is not up: a diagonal is its own direction.
    expect(m.input({ kind: 'hat', device: '0810:e501', index: 0, value: 3, ms: 2 })).toEqual([]);
    expect(m.input({ kind: 'hat', device: '0810:e501', index: 0, value: 1, ms: 3 })).toEqual([
      { channel: ch('Key5'), down: true, ms: 3 },
    ]);
    // Another board of the same make is another device.
    expect(m.input({ kind: 'button', device: '0810:e501#1', index: 3, down: true, ms: 4 })).toEqual(
      [],
    );
    // Nothing reaches Key6 or Key7: a malformed spec, an axis, a name SDL lacks.
    expect(m.input({ kind: 'axis', device: '0810:e501', index: 0, value: 9000, ms: 5 })).toEqual(
      [],
    );
    expect(m.isDown(ch('Key6')) || m.isDown(ch('Key7'))).toBe(false);
    // Unplugged: its controls read as released.
    expect(m.forget('0810:e501', 6).map((e) => [e.channel, e.down])).toEqual([
      [ch('Key4'), false],
      [ch('Key5'), false],
    ]);
  });

  it('debounce: chatter inside the window is nothing; the real edges land', () => {
    const m = new InputMapper(only(ch('Key3'), ['D']), { debounceMs: 8 });
    expect(m.input(key('D', true, 1000))).toEqual([{ channel: ch('Key3'), down: true, ms: 1000 }]);
    expect([...m.input(key('D', false, 1002)), ...m.input(key('D', true, 1004))]).toEqual([]);
    expect(m.isDown(ch('Key3'))).toBe(true);
    expect(m.input(key('D', false, 1040))).toEqual([
      { channel: ch('Key3'), down: false, ms: 1040 },
    ]);
    // A bounce on release is nothing either.
    expect(m.input(key('D', true, 1043))).toEqual([]);
    expect(m.isDown(ch('Key3'))).toBe(false);
    expect(m.input(key('D', false, 1050))).toEqual([]);
    expect(m.input(key('D', true, 1100))).toEqual([{ channel: ch('Key3'), down: true, ms: 1100 }]);
    // An earlier time is not chatter (the port's unsigned subtraction aside).
    expect(m.input(key('D', false, 1095))).toEqual([
      { channel: ch('Key3'), down: false, ms: 1095 },
    ]);
  });

  it('capture hears the control pressed, a pad before a key', () => {
    const m = new InputMapper(only(ch('Key1'), []));
    m.armCapture(false);
    expect(m.captured()).toBeNull();
    m.input(key('Left Ctrl', true, 1));
    m.input({ kind: 'axis', device: '0810:e501', index: 0, value: 100, ms: 2 });
    m.input({ kind: 'hat', device: '0810:e501', index: 1, value: 12, ms: 3 });
    expect(m.captured()).toBe('0810:e501/h1.downleft');
    m.armCapture(true);
    m.input({ kind: 'axis', device: '0810:e501', index: 2, value: 100, ms: 4 });
    expect(m.captured()).toBe('0810:e501/a2');
    m.armCapture(false);
    m.input(key('Semicolon', false, 5));
    m.input(key(';', true, 6));
    expect(m.captured()).toBe(';');
    expect(m.captured()).toBeNull();
  });

  it('a lost focus releases the keys it held', () => {
    const m = new InputMapper(only(ch('Pedal'), ['Space']), { debounceMs: 0 });
    m.input(key('Space', true, 10));
    expect(m.releaseKeys(20)).toEqual([{ channel: ch('Pedal'), down: false, ms: 20 }]);
  });
});

describe('the turntable (ezpad.c)', () => {
  const tt = (spec: string) => only(ch('Key1'), [], [spec, '']);
  const axis = (value: number, ms: number, index = 0) =>
    ({ kind: 'axis', device: '0810:e501', index, value, ms }) as const;
  const up = ch('Scratch1');
  const dn = ch('Scratch2');

  it('a wrapping axis turns 256 units a swing and holds a direction 90 ms', () => {
    const m = new InputMapper(tt('0810:e501/a0'));
    // The first reading only sets where it is.
    expect(m.input(axis(0, 0))).toEqual([]);
    // 256 units a full swing: 256 raw steps a unit.
    expect(m.input(axis(1024, 10))).toEqual([{ channel: up, down: true, ms: 10 }]);
    expect(m.turntable(0)).toMatchObject({ pos: 132, delta: 4, bound: true });
    // More turning extends the hold; it ends exactly 90 ms after the last.
    expect(m.input(axis(2048, 50))).toEqual([]);
    expect(m.tick(139)).toEqual([]);
    expect(m.tick(200)).toEqual([{ channel: up, down: false, ms: 50 + TT_HOLD_MS }]);
  });

  it('a reversal drops the other direction at once, and the wrap is a small move', () => {
    const m = new InputMapper(tt('0810:e501/a0'));
    m.input(axis(32000, 0));
    // 32000 -> -32000 across the wrap is +1536 raw, 6 units up, not a whole turn down.
    expect(m.input(axis(-32000, 10))).toEqual([{ channel: up, down: true, ms: 10 }]);
    expect(m.input(axis(32000, 20))).toEqual([
      { channel: up, down: false, ms: 20 },
      { channel: dn, down: true, ms: 20 },
    ]);
  });

  it('keeps the remainder of a slow turn, and reverses with :rev', () => {
    const m = new InputMapper(tt('0810:e501/a0:rev'));
    m.input(axis(0, 0));
    // 100 raw is under a unit: kept, not dropped.
    expect(m.input(axis(-100, 1))).toEqual([]);
    expect(m.input(axis(-200, 2))).toEqual([]);
    // Now 300 in all: a unit up (the axis is reversed).
    expect(m.input(axis(-300, 3))).toEqual([{ channel: up, down: true, ms: 3 }]);
  });

  it('an event after a hold ran out ends the hold at its deadline first', () => {
    const m = new InputMapper(tt('0810:e501/a0'));
    m.input(axis(0, 0));
    m.input(axis(1024, 10));
    expect(m.input(axis(2048, 500))).toEqual([
      { channel: up, down: false, ms: 100 },
      { channel: up, down: true, ms: 500 },
    ]);
  });

  it('a velocity axis turns every 1/60 s by its deflection, dead band and all', () => {
    const m = new InputMapper(tt('0810:e501/a0:vel'));
    // Inside the dead band: nothing, however long.
    m.input(axis(1000, 0));
    expect(m.tick(1000)).toEqual([]);
    // Full tilt: 8 units a frame less the remainder kept (32767 * 8 / 32768),
    // from the next frame - frame 60, at 1000 ms, already ran (the tick above).
    const edges = [...m.input(axis(32767, 1000)), ...m.tick(1020)];
    expect(edges).toEqual([{ channel: up, down: true, ms: (61 * 1000) / 60 }]);
    expect(m.turntable(0).delta).toBe(7);
    // Back to rest: the hold ends 90 ms after the last frame that moved.
    const rest = [...m.input(axis(0, 1030)), ...m.tick(1200)];
    expect(rest).toEqual([{ channel: up, down: false, ms: (61 * 1000) / 60 + TT_HOLD_MS }]);
  });

  it('is never debounced, and composes with the scratch keys', () => {
    const c = tt('0810:e501/a0');
    c.names[up] = ['Left Ctrl'];
    const m = new InputMapper(c, { debounceMs: 8 });
    m.input(axis(0, 0));
    m.input(key('Left Ctrl', true, 1));
    // Already down from the key: turning adds nothing.
    expect(m.input(axis(1024, 2))).toEqual([]);
    // Letting go of the key leaves it down while the hold lasts.
    expect(m.input(key('Left Ctrl', false, 3))).toEqual([]);
    expect(m.tick(200)).toEqual([{ channel: up, down: false, ms: 92 }]);
  });
});

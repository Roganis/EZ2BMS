// Key names as SDL resolves them, and each input channel on the lane
// EZ2PORT sends it to (reference/play.c gds_key_for_channel), in every mode.

import { describe, expect, it } from 'vitest';
import { gdsKeyForChannel, laneForChannel, routeChannel } from '../src/input/channels';
import { KEY_CHANNELS, keyconfDefaults } from '../src/input/keyconf';
import {
  codeForKeyName,
  keyNameForCode,
  scancodeFromName,
  scancodeName,
  SDL_SCANCODE_NAMES,
} from '../src/input/scancodes';
import { MODES } from '../src/modes/ids';
import { modeDef } from '../src/modes/registry';

const ch = (name: (typeof KEY_CHANNELS)[number]) => KEY_CHANNELS.indexOf(name);

describe('key names', () => {
  it('are resolved as SDL resolves them', () => {
    expect(scancodeFromName('Left Ctrl')).toBe(224);
    expect(scancodeFromName('left ctrl')).toBe(224);
    expect(scancodeFromName(';')).toBe(51);
    expect(scancodeFromName('Semicolon')).toBe(0);
    // Return is two scancodes; the first wins.
    expect(scancodeFromName('Return')).toBe(40);
    expect(scancodeName(4)).toBe('A');
    expect(scancodeName(3)).toBe('');
  });

  it('meet the browser by USB usage, both ways', () => {
    expect(codeForKeyName('Left Shift')).toBe('ShiftLeft');
    expect(codeForKeyName('Return')).toBe('Enter');
    expect(codeForKeyName('Keypad Enter')).toBe('NumpadEnter');
    expect(codeForKeyName('\\')).toBe('Backslash');
    expect(codeForKeyName('Nope')).toBeUndefined();
    expect(keyNameForCode('ControlRight')).toBe('Right Ctrl');
    expect(keyNameForCode('Semicolon')).toBe(';');
    expect(keyNameForCode('Unidentified')).toBeUndefined();
    // Every default binding is a key the browser can press.
    for (const [name] of keyconfDefaults().names) expect(codeForKeyName(name!), name).toBeDefined();
    // Names are unique but for Return.
    const names = SDL_SCANCODE_NAMES.map(([, n]) => n.toLowerCase());
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual(['return']);
  });
});

describe('channels', () => {
  it('raise the .gds controls play.c gives them', () => {
    expect(gdsKeyForChannel(ch('Key1'))).toBe(10);
    expect(gdsKeyForChannel(ch('Key6'))).toBe(6);
    expect(gdsKeyForChannel(ch('Effect1'))).toBe(6);
    expect(gdsKeyForChannel(ch('P2Key7'))).toBe(9);
    expect(gdsKeyForChannel(ch('P2Scratch2'))).toBe(24);
    for (const c of ['Start', 'P2Start', 'Test', 'Service', 'Coin'] as const)
      expect(gdsKeyForChannel(ch(c))).toBe(-1);
    // Keys 6/7 and effectors 1/2 are one lane; so are P2's 6/7 and effectors 3/4.
    expect(laneForChannel(ch('Key6'))).toBe(laneForChannel(ch('Effect1')));
    expect(laneForChannel(ch('P2Key6'))).toBe(laneForChannel(ch('Effect3')));
    expect(laneForChannel(ch('Scratch2'))).toBe(1);
  });

  it('reach the mode columns they name, and nothing else', () => {
    for (const m of MODES) {
      const cols = modeDef(m.id).columns;
      const reached = new Set<number>();
      KEY_CHANNELS.forEach((_, c) => {
        const r = routeChannel(m.id, cols, c);
        if (r && 'column' in r) {
          expect(cols[r.column]!.x).toBe(laneForChannel(c));
          reached.add(r.column);
        }
      });
      // Every column of every mode can be played from some channel.
      expect(
        [...reached].sort((a, b) => a - b),
        m.id,
      ).toEqual(cols.map((_, i) => i));
    }
  });

  it('strum in ScratchMix: the turntable is the strum, the pedal nothing', () => {
    const cols = modeDef('scratch').columns;
    expect(routeChannel('scratch', cols, ch('Scratch1'))).toEqual({ strum: 0 });
    expect(routeChannel('scratch', cols, ch('Scratch2'))).toEqual({ strum: 0 });
    expect(routeChannel('scratch', cols, ch('P2Scratch1'))).toEqual({ strum: 1 });
    expect(routeChannel('scratch', cols, ch('Pedal'))).toBeNull();
    expect(routeChannel('scratch', cols, ch('Key3'))).toEqual({ column: 2 });
    // Elsewhere the turntable is its lane.
    const five = modeDef('5k').columns;
    expect(routeChannel('5k', five, ch('Scratch1'))).toEqual({
      column: five.findIndex((c) => c.x === 1),
    });
  });
});

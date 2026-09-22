import { describe, expect, it } from 'vitest';
import { DEFAULT_LANE_KEYS, laneForKey, laneKeysFromIni, sdlToCode } from './lanekeys';

describe('lane keys', () => {
  it("uses EZ2PORT's default bindings", () => {
    expect(DEFAULT_LANE_KEYS).toMatchObject({
      KeyZ: 11,
      KeyS: 12,
      KeyC: 15,
      ControlLeft: 1,
      ShiftLeft: 1,
      Space: 10,
      KeyM: 21,
      Comma: 23,
      Semicolon: 34,
      AltRight: 20,
    });
    expect(laneForKey('KeyV', new Set([11, 31]))).toBe(31);
    expect(laneForKey('KeyV', new Set([11]))).toBeUndefined();
  });

  it("reads the player's keys.ini: names, alternates, quotes, comments", () => {
    const map = laneKeysFromIni(`; mine
[Keys]
Key1 = A, Keypad 1   ; two keys
Key3 = ","
Pedal =
Scratch1 = Left Alt
[Other]
Key2 = Q
`);
    expect(map.KeyA).toBe(11);
    expect(map.Numpad1).toBe(11);
    expect(map.Comma).toBe(13);
    expect(map.Space).toBeUndefined(); // unbound
    expect(map.AltLeft).toBe(1);
    expect(map.KeyS).toBe(12); // untouched: still the default
    expect(map.KeyQ).toBeUndefined(); // not in [Keys]
    expect(sdlToCode('Right Shift')).toBe('ShiftRight');
    expect(sdlToCode('Return')).toBe('Enter');
    expect(sdlToCode('\\')).toBe('Backslash');
  });
});

// Which keyboard key plays which lane, EZ2PORT's defaults (keys.ini): keys
// Z S X D C for 1-5, V B for 6-7 (the effectors in 7K), Shift for the
// turntable, Space for the pedal, F G H J for the effectors. The 2P side of
// 10K/14K uses the numeric keypad. Keyed by KeyboardEvent.code, so the layout
// of the keyboard does not matter.

export const DEFAULT_LANE_KEYS: Record<string, number> = {
  ShiftLeft: 1,
  ControlLeft: 1,
  KeyZ: 11,
  KeyS: 12,
  KeyX: 13,
  KeyD: 14,
  KeyC: 15,
  KeyV: 31,
  KeyB: 32,
  Space: 10,
  KeyF: 31,
  KeyG: 32,
  KeyH: 33,
  KeyJ: 34,
  ShiftRight: 2,
  Numpad1: 21,
  Numpad2: 22,
  Numpad3: 23,
  Numpad4: 24,
  Numpad5: 25,
  Numpad0: 20,
};

/** The lane a key plays in a mode, if the mode has that lane. */
export function laneForKey(
  code: string,
  lanes: ReadonlySet<number>,
  map = DEFAULT_LANE_KEYS,
): number | undefined {
  const x = map[code];
  return x !== undefined && lanes.has(x) ? x : undefined;
}

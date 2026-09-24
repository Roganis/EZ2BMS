// Which keyboard key plays which lane in test play: the player's own keys.ini
// (<game>/ez2port/keys.ini) over EZ2PORT's defaults - Z S X D C for keys 1-5,
// V B for 6-7, Ctrl/Shift for the turntable, Space for the pedal, F G H J for
// the effectors, 2P mirrored on M K , L . / ; with the right-hand modifiers.
// Keyed by KeyboardEvent.code, so the keyboard's layout does not matter.
//
// The file is read by chart-core's transcription of the port's own reader
// (input/keyconf.ts), key names resolved as SDL resolves them
// (input/scancodes.ts), and each channel sent to the lane the port sends it
// to (input/channels.ts).

import {
  codeForKeyName,
  fromBytes,
  KEY_CHANNELS,
  laneForChannel,
  parseKeyconf,
} from '@ez2bms/chart-core';

/** keys.ini text -> KeyboardEvent.code -> lane (bmson x). Channels it does not name keep the defaults. */
export function laneKeysFromIni(text: string | null): Record<string, number> {
  const conf = parseKeyconf(text ?? '').conf;
  const map: Record<string, number> = {};
  KEY_CHANNELS.forEach((_, ch) => {
    const x = laneForChannel(ch);
    if (x === undefined) return;
    for (const name of conf.names[ch] ?? []) {
      const code = codeForKeyName(fromBytes(name));
      // The first channel to claim a key keeps it.
      if (code && !(code in map)) map[code] = x;
    }
  });
  return map;
}

export const DEFAULT_LANE_KEYS = laneKeysFromIni(null);

/** The lane a key plays in a mode, if the mode has that lane. */
export function laneForKey(
  code: string,
  lanes: ReadonlySet<number>,
  map = DEFAULT_LANE_KEYS,
): number | undefined {
  const x = map[code];
  return x !== undefined && lanes.has(x) ? x : undefined;
}

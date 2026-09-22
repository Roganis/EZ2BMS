// Colours derived from data, stable across sessions.

/** A hue for a sound, from its name (so a kit's sounds keep their colours). */
export function channelHue(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return (h >>> 0) % 360;
}

export const TIER_COLOR = { NM: 0x56f39a, HD: 0xffc247, SHD: 0xff5470, EX: 0xb56dff } as const;

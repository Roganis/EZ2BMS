// The original's velocity/pan arithmetic, in DirectSound units (EZ2PORT
// ez2/mixparam.c, transcribed from setVolume @0x40f4a0 and setPan @0x40f550).
// Integer maths with C's truncating division - the order of the divisions is
// load-bearing.

export const MIX_UNITY = 127;
export const MIX_DIVISOR = 16129;
export const PAN_CENTRE = 64;

const idiv = (a: number, b: number) => Math.trunc(a / b);

/** Attenuation in hundredths of a dB, 0 (full) down to -5000. */
export function dsLevel(master: number, mixA: number, mixB: number, vol: number): number {
  const q1 = idiv(master * mixB * mixA, MIX_DIVISOR);
  const q2 = idiv(q1 * vol * 5000, MIX_DIVISOR);
  return q2 - 5000;
}

/** DirectSound pan -10000 (left) .. 10000 (right), the lane's position pulling the note's pan. */
export function dsPan(panPos: number, pan: number): number {
  const diff = panPos - PAN_CENTRE;
  let p = pan;
  if (diff < 0) p += idiv(diff * p, 64);
  else if (diff > 0) p += idiv((127 - p) * diff, 64);
  return idiv(p * 20000, 127) - 10000;
}

/** Linear gain for a DirectSound level (EZ2PORT platform/common/ezaudio.c: 10^(db100/2000)). */
export function levelToGain(db100: number): number {
  return Math.pow(10, db100 / 2000);
}

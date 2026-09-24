/* Per-note volume and pan, in DirectSound units.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * Transcribed from the MATCHED `KEZPlayer::setVolume` @0x40f4a0 and
 * `KEZPlayer::setPan` @0x40f550 (../../src/sound.cpp), and checked against
 * them by `port/oracle/run.sh` - the original's own compiled code, not a
 * reading of it.
 *
 * WHY BOTHER, GIVEN THE MIXER IS IN THE "FREE" COLUMN. The ruling
 * (PORTING.md 4d) frees the mixer's *topology* - how voices are summed, what
 * the buffer size is. It does not free the per-note attenuation, which is
 * chart DATA: every note carries its own volume and pan bytes, and what the
 * player hears is those numbers put through this arithmetic. Getting it right
 * costs one function, and the integer rounding is not reproducible by the
 * obvious floating-point formula - `ez2play` was off by one lsb across most of
 * the range before this existed.
 *
 * The two mix factors and the master level are the engine's own state
 * (SoundParam +0x18/+0x1c and KEZPlayer+0x726c). A port with no equivalent
 * passes EZ2_MIX_UNITY for all three, which is what the arithmetic reduces to
 * "the note's own volume, unattenuated".
 */
#ifndef EZ2_MIXPARAM_H
#define EZ2_MIXPARAM_H

#ifdef __cplusplus
extern "C" {
#endif

/* Everything in this file is on the game's 0..127 scale. 127 is unity, and
 * 127*127 = 16129 is the divisor both stages use. */
#define EZ2_MIX_UNITY   127
#define EZ2_MIX_DIVISOR 16129

/* Pan position 64 is centre; the setter weights the note's pan toward whichever
 * side the lane sits on. */
#define EZ2_PAN_CENTRE  64

/* The DirectSound attenuation for a note of volume `vol`, in hundredths of a
 * decibel, 0 at unity and -5000 at silence.
 *
 *     q1 = (master * mixB * mixA) / 16129
 *     q2 = (q1 * vol * 5000) / 16129
 *     return q2 - 5000
 *
 * Two separate integer divisions, in that order - collapsing them into one
 * expression or into floating point changes the result across most of the
 * range. */
int ez2_ds_level(int master, int mix_a, int mix_b, int vol);

/* The DirectSound pan for a note of pan `pan`, +-10000, given the lane's own
 * pan position. `pan_pos` of EZ2_PAN_CENTRE leaves the note's pan alone. */
int ez2_ds_pan(int pan_pos, int pan);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_MIXPARAM_H */

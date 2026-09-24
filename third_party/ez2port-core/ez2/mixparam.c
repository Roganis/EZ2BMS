/* Per-note volume and pan, in DirectSound units. See mixparam.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "mixparam.h"

int ez2_ds_level(int master, int mix_a, int mix_b, int vol)
{
    /* setVolume @0x40f4a0, transcribed. The order of the two divisions is
     * load-bearing: each truncates, so folding them loses a level here and
     * there - which is audible as nothing, and wrong as a matter of record. */
    int q1 = (master * mix_b * mix_a) / EZ2_MIX_DIVISOR;
    int q2 = (q1 * vol * 5000) / EZ2_MIX_DIVISOR;

    return q2 - 5000;
}

int ez2_ds_pan(int pan_pos, int pan)
{
    /* setPan @0x40f550. The lane's own position pulls the note's pan toward
     * that side, proportionally to how far off centre the lane is. */
    int diff = pan_pos - EZ2_PAN_CENTRE;

    if (diff < 0)
        pan += diff * pan / 64;
    else if (diff > 0)
        pan += (127 - pan) * diff / 64;

    return pan * 20000 / 127 - 10000;
}

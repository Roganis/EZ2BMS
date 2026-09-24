/* The screen layout. See layout.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * No platform calls and no I/O: this decides, the caller applies. That is
 * what lets ez2core stay renderer-free and lets the rule be unit-tested
 * against the measured .pvi table without a window.
 */
#include "layout.h"

void ez2_layout_from_wide(int wide, int bga_mode, ez2_layout *out)
{
    if (out == 0)
        return;

    if (bga_mode != EZ2_BGA_NATIVE && bga_mode != EZ2_BGA_BACKDROP)
        bga_mode = EZ2_BGA_COVER;

    out->canvas_w = EZ2_DESIGN_W;
    out->canvas_h = EZ2_DESIGN_H;
    out->window_w = EZ2_DESIGN_W;
    out->window_h = EZ2_DESIGN_H;
    out->bga_mode = bga_mode;

    switch (wide) {
    case 1:
        /* 854x480 is the original's own number for `Wide = 1`, and it is
         * 16:9 to within two thirds of a pixel (480 * 16 / 9 = 853.33). */
        out->canvas_w = 854;
        out->window_w = 854;
        break;
    case 2:
        /* The original's `Wide = 2`: a 1440x1080 window, which is 4:3. A
         * bigger picture, not a wider one - so the canvas does not change. */
        out->window_w = 1440;
        out->window_h = 1080;
        break;
    default:
        break;
    }

    out->gutter = out->canvas_w - EZ2_DESIGN_W;
}

int ez2_layout_anchor_for_box(int left, int right)
{
    int lgap, rgap, lo, hi;

    if (right <= left)
        return EZ2_ANCHOR_CENTER;

    lgap = left;
    rgap = EZ2_DESIGN_W - right;
    if (lgap < 0) lgap = 0;
    if (rgap < 0) rgap = 0;

    lo = lgap < rgap ? lgap : rgap;
    hi = lgap < rgap ? rgap : lgap;

    /* Both margins comparable - a field that is already centred. The compare
     * is integer (2*lo >= hi is lo/hi >= 0.5) so there is no float in a
     * decision that has to be identical everywhere. */
    if (hi == 0 || 2 * lo >= hi)
        return EZ2_ANCHOR_CENTER;

    return lgap < rgap ? EZ2_ANCHOR_LEFT : EZ2_ANCHOR_RIGHT;
}

/* The song-select wheel - implementation. Header comment in selectwheel.h;
 * every constant and arm below is a transcription, with its source named.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "selectwheel.h"

#include <math.h>
#include <stdlib.h>

void ez2_select_wheel_init(ez2_select_wheel *w, int count, int cursor)
{
    w->count  = count > 0 ? count : 1;
    w->cursor = (count > 0) ? ((cursor % count) + count) % count : 0;
    w->prev   = w->cursor;
    /* The seed @0x435070 / the re-entry blocks in update2: scroll and target
     * start ON the cursor - no chase on entry. */
    w->scroll = (float)(w->cursor * 100);
    w->hold_up = w->hold_down = 0;
    w->rep_up = w->rep_down = 0;
    w->accum = 0;
    /* The ctor seeds f_20e894 = 0x1e (songselectctor.cpp:314), so the first
     * tick's `++ > 0x1e` passes and the remembered song's preview starts on
     * the screen's first frame (SCREEN-AUDIT.md 3.3). */
    w->idle = EZ2_WHEEL_IDLE_PREVIEW;
}

/* One direction's step test - inputRubyMix @0x43b8d0. The turntable
 * accumulator, the button edge, and the hold-repeat counter are OR'd; the
 * caller (below) resets both repeat counters when either direction fires,
 * as the `moved == 1` aftermath does. */
static int dir_fires(int accum_past, int edge, int rep, int rep_thresh)
{
    return accum_past || edge || rep > rep_thresh;
}

int ez2_select_wheel_step(ez2_select_wheel *w, int up_edge, int down_edge,
                          int up_held, int down_held, int accum_delta)
{
    int short_list = w->count < 8;
    int rep_thresh = short_list ? EZ2_WHEEL_REP_SHORT : EZ2_WHEEL_REP_LONG;
    int acc_thresh = short_list ? EZ2_WHEEL_ACCUM_SHORT : EZ2_WHEEL_ACCUM_LONG;
    int moved = 0;   /* net step for the caller */
    int fired = 0;   /* the original's `moved` FLAG - either direction */

    /* heldFor: frames the control has been down. The repeat counter counts
     * only past the 150-tick arm (`heldFor(..) >= 0x96` gates the ++). */
    w->hold_up   = up_held   ? w->hold_up + 1   : 0;
    w->hold_down = down_held ? w->hold_down + 1 : 0;
    if (w->hold_up >= EZ2_WHEEL_HOLD_ARM)
        w->rep_up++;
    if (w->hold_down >= EZ2_WHEEL_HOLD_ARM)
        w->rep_down++;

    w->accum += accum_delta;

    /* Down the list first, then up - the handlers test the +accum block
     * before the -accum block, and both can fire in one tick (a step each
     * way cancels, which is what the original does too). */
    if (dir_fires(w->accum > acc_thresh, down_edge, w->rep_down, rep_thresh)) {
        w->prev = w->cursor;
        w->cursor += 1;
        moved += 1;
        fired = 1;
    }
    if (dir_fires(w->accum < -acc_thresh, up_edge, w->rep_up, rep_thresh)) {
        w->prev = w->cursor;
        w->cursor -= 1;
        moved -= 1;
        fired = 1;
    }

    /* The wrap runs every tick, not only on a step (`f84 = (f84+f7c) % f7c`
     * sits after the step blocks unconditionally). */
    w->cursor = ((w->cursor % w->count) + w->count) % w->count;

    if (fired) {
        /* The `moved == 1` aftermath: idle to zero, BOTH repeat counters to
         * zero, the accumulator consumed. (The original re-latches the
         * accumulator inside its input object; consuming it here is the same
         * one-step-per-threshold behaviour.) A step each way still runs it,
         * as the original's flag does. */
        w->idle = 0;
        w->rep_up = w->rep_down = 0;
        w->accum = 0;
    }
    w->idle++;

    return moved;
}

void ez2_select_wheel_chase(ez2_select_wheel *w)
{
    /* update2 @0x446540, the non-radio arm. `nf` is the ring length in
     * entries; all comparisons strict, exactly as compiled. */
    float target = (float)(w->cursor * 100);
    float nf = (float)w->count;
    float d = target - w->scroll;

    if (d > nf * 50.0f) {
        /* Shorter the other way round the ring, downward. NOTE the ladder:
         * 5/10/30/50, not 5/10/20/30 - the original's own asymmetry. */
        float dd = d - nf * 100.0f;
        if (dd > -50.0f)        w->scroll -= 5.0f;
        else if (dd > -100.0f)  w->scroll -= 10.0f;
        else if (dd > -200.0f)  w->scroll -= 30.0f;
        else                    w->scroll -= 50.0f;
    } else if (nf * -50.0f > d) {
        float du = d + nf * 100.0f;
        if (50.0f > du)         w->scroll += 5.0f;
        else if (100.0f > du)   w->scroll += 10.0f;
        else if (200.0f > du)   w->scroll += 20.0f;
        else                    w->scroll += 30.0f;
    } else if (50.0f > d && d > -50.0f) {
        w->scroll += (d > 0.0f) ? 5.0f : -5.0f;
    } else if (100.0f > d && d > -100.0f) {
        w->scroll += (d > 0.0f) ? 10.0f : -10.0f;
    } else if (200.0f > d && d > -200.0f) {
        w->scroll += (d > 0.0f) ? 20.0f : -20.0f;
    } else if (d > 0.0f) {
        w->scroll += 30.0f;
    } else {
        w->scroll -= 30.0f;
    }

    if (10.0f > d && d > -10.0f)
        w->scroll = target;
    /* Approaching a zero target through the wrap: snap from the last ten. */
    if (w->scroll > nf * 100.0f - 10.0f && target == 0.0f)
        w->scroll = target;
    if (w->scroll > nf * 100.0f)
        w->scroll -= nf * 100.0f;
    if (0.0f > w->scroll)
        w->scroll += nf * 100.0f;
}

int ez2_select_wheel_wants_preview(const ez2_select_wheel *w)
{
    return w->idle > EZ2_WHEEL_IDLE_PREVIEW;
}

/* The engine's trig tables, 1024 samples per turn (0x4a5228 / 0x4a6228 -
 * confirmed live in the packer dump; the original builds them with a small
 * accumulated error of ~3e-3 that nothing here is precise enough to see). */
static float sin1024(int k)
{
    return sinf((float)k * (6.2831853f / 1024.0f));
}

static float cos1024(int k)
{
    return cosf((float)k * (6.2831853f / 1024.0f));
}

/* angleToY @0x434d70 (src/accessors.cpp, 100%): truncate, take the cosine
 * out of the sine table at +180 entries with the mirror below zero, map onto
 * the screen as 1074 - 360c - 600 - 48. */
static float angle_to_y(float a)
{
    int   i = (int)a;
    float c;

    if (i - 0x34c < 0)
        c = -sin1024((0xb4 - i) & 0x3ff);
    else
        c = sin1024((i + 0xb4) & 0x3ff);
    return 1074.0f - c * 360.0f - 600.0f - 48.0f;
}

int ez2_select_wheel_place(const ez2_select_wheel *w, int i,
                           ez2_select_place *out)
{
    /* m439f00 @0x439f00, arm for arm. */
    float d = (float)(i * 100) - w->scroll;
    int   idx;

    if (d > (float)(w->count * 50))
        d -= (float)(w->count * 100);
    if ((float)(-w->count * 50) > d)
        d += (float)(w->count * 100);
    d = d * 2.0f;

    if (!(800.0f > d && d > -400.0f))
        return 0;

    if (100.0f > d && d > -100.0f)
        out->bright = 255 - abs((int)d);
    else
        out->bright = 0x9b;

    if (d >= 200.0f || -200.0f >= d)
        out->size = 112.0f;
    else if (d >= 0.0f)
        out->size = 176.0f / (1.0f + d * 0.01f);
    else
        out->size = 176.0f / (1.0f - d * 0.01f);

    idx = (int)d + 0x34c;
    if (idx < 0)
        idx = -0x34c - (int)d;
    idx &= 0x3ff;

    out->x = angle_to_y(d) - 274.0f;
    /* The original's constant chain folds to 456 - cos*500; kept whole so a
     * diff against the listing reads term for term:
     * 444 - cos*500 - 500 + 480 - 56 + 88. */
    out->y = 444.0f - cos1024(idx) * 500.0f - 500.0f + 480.0f - 56.0f + 88.0f;
    return 1;
}

void ez2_select_swing_tick(int diff_idx, float *angle, float *step)
{
    /* m431ae0's tail, arm for arm: the step re-derived from the gap every
     * frame, then the gated, clamped advance. */
    if (diff_idx == 1)
        *step = 30.0f - (*angle - 180.0f) * 0.16666667f;
    else if (diff_idx == 3)
        *step = 90.0f - (*angle - 180.0f) * 0.16666667f;
    else if (diff_idx == 4)
        *step = 150.0f - (*angle - 180.0f) * 0.16666667f;
    else
        *step = *angle * -0.16666667f;

    if ((*step > 0.0f && 1080.0f > *angle) ||
        (0.0f > *step && *angle > -360.0f)) {
        *angle += *step;
        if (*angle > 1080.0f)
            *angle = 1080.0f;
        else if (*angle <= 0.0f)
            *angle = 0.0f;
    }
}

/* ---- the song-name rail - m438d30 @0x438d30 ---------------------------- */

/* drawOne's x, before its own `- off - 50`. */
#define RAIL_X     76.5f
/* The walk starts seven slots ahead of the ring, which is what puts the
 * focus at d == 700 rather than at d == 0. */
#define RAIL_LEAD  7

int ez2_select_rail_slots(const ez2_select_wheel *w)
{
    return w->count < 0x1e ? w->count * 60 : w->count;
}

int ez2_select_rail_place(const ez2_select_wheel *w, int slot,
                          ez2_select_rail *out)
{
    /* m438d30 @0x438d30, arm for arm - the two halves differ only in the
     * wrap threshold and three band constants, so they are one body here
     * with `fine` picking between them. The original writes them out twice
     * because cl duplicated the loop, not because they diverge. */
    int   fine = w->count < 0x1e;
    int   i    = slot - RAIL_LEAD;
    float wrap = fine ? (float)(w->count * 1000) : (float)(w->count * 50);
    float d    = (float)(slot * 100) - w->scroll;
    int   idx;
    float c;

    if (slot < 0 || slot >= ez2_select_rail_slots(w))
        return 0;

    if (d > wrap)
        d -= (float)(w->count * 100);
    if (-wrap > d)
        d = (float)(w->count * 100) + d;

    if (85.0f > d)
        return 0;
    if (1500.0f < d)
        return 0;
    /* The original's own guard. `i` never reaches -8*count from a lead of
     * seven, so it never fires; kept because the listing has it. */
    if ((i + w->count * 8) % w->count < 0)
        return 0;

    if (d == 700.0f) {
        out->bright = 0xff;
    } else if (d >= 701.0f) {
        out->bright = ((int)d >= 0x4b0) ? 0x5af - (int)d : 0xff;
    } else if (!(699.0f < d)) {
        int b = (int)d;

        out->bright = b > 0xfa ? 0xff : b;
    } else {
        /* 699 < d < 701 and d != 700 - a window the scroll passes through
         * mid-chase. The original leaves `bright` UNINITIALIZED here and
         * paints the row with whatever its frame happens to hold. Every
         * neighbouring arm gives 255 at this distance, so that is what the
         * band would have held; the port fills it rather than reproducing
         * a one-frame garbage flicker. */
        out->bright = 0xff;
    }

    /* The bottom fade runs 1455 - d and the cull only stops at 1500, so the
     * original's own arithmetic goes NEGATIVE for d in (1455, 1500] and
     * splats a signed byte through the colour word (a row at d 1500 is
     * ffffffd3 on the original - measured). Those rows sit below y 480, off
     * the bottom edge, so nothing shows it; left signed so the draw list
     * matches - select.c builds the word with the same shifts and ORs. */

    idx = (int)((d - 500.0f) * 5.0f);
    if (idx < 0)
        idx = -idx;
    idx &= 0x3ff;
    c = cos1024(idx);

    if (599.0f >= d)
        out->y = d * 0.31695721f - (fine ? 104.0f : 106.0f);
    else if (699.0f >= d)
        out->y = d * 0.31695721f + c * 10.0f - (fine ? 95.0f : 97.0f);
    else if (d >= 799.0f)
        out->y = d * 0.31695721f - 31.0f;
    else
        out->y = d * 0.48076925f + 34.0f - c * 22.0f - (fine ? 214.0f : 216.0f);

    out->x     = RAIL_X - 50.0f;
    out->entry = (i + w->count * 8) % w->count;
    return 1;
}

/* ---- CV2Mix's own page - m4391b0 @0x4391b0 ------------------------------ */

#define CV2_X     45.0f
#define CV2_LEAD  5

int ez2_select_cv2_slots(const ez2_select_wheel *w)
{
    /* `for (i = -5; i + 5 < f80; i++)` - one slot per entry, and unlike the
     * rail there is no short-list second half: CV2's table is the raw song
     * list rather than a filtered page. */
    return w->count;
}

int ez2_select_cv2_place(const ez2_select_wheel *w, int slot,
                         ez2_select_cv2 *out)
{
    int   i = slot - CV2_LEAD;
    float d = (float)(slot * 100) - w->scroll;
    int   entry;

    if (slot < 0 || slot >= w->count)
        return 0;

    if (d > (float)(w->count * 50))
        d -= (float)(w->count * 100);
    if ((float)(-w->count * 50) > d)
        d = (float)(w->count * 100) + d;

    if (85.0f > d)
        return 0;
    if (1200.0f < d)
        return 0;
    entry = (i + w->count * 6) % w->count;
    if (entry < 0)
        return 0;

    if (d == 500.0f) {
        out->bright = 0xff;
    } else if (d >= 501.0f) {
        out->bright = ((int)d >= 0x384) ? 0x483 - (int)d : 0xff;
    } else if (!(499.0f < d)) {
        int b = (int)d;

        out->bright = b > 0xfa ? 0xff : b;
    } else {
        /* The same uninitialised window the rail has, for the same reason
         * and with the same answer: every neighbouring arm gives 255 here. */
        out->bright = 0xff;
    }
    /* AND IT IS NOT CLAMPED. `1155 - (int)d` goes negative for the last
     * panel of the run - d reaches 1200, so bright bottoms out at -45 - and
     * the original does not fence it: m4324b0 @0x4324b0 builds the colour by
     * OR-ing the value into itself four times, which for -45 leaves
     * 0xffffffd3 rather than a byte. Measured on the original's own bottom
     * row (playcv2_hits, the CV2 select): 0xffffffd3, where a clamp to zero
     * had the port drawing that row invisible. */
    /* One chained run, written in the original's order - no cosine. */
    out->y = d * 0.390625f + 10.0f + 34.0f - 112.0f + 25.3f;
    out->x = CV2_X;
    out->entry = entry;
    return 1;
}

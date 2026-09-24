/* Note placement. See scroll.h - every line here is a transcription.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "scroll.h"

void ez2_scroll_init(ez2_scroll *s, float measure_scale, int beat,
                     float target)
{
    if (s == 0)
        return;
    s->base = measure_scale != 0.0f ? measure_scale : EZ2_SCROLL_MEASURE_SCALE;
    s->beat = beat > 0 ? beat : EZ2_SCROLL_BEAT;
    s->rate = target;
}

float ez2_scroll_target(int percent, float chart_multiplier)
{
    /* Panel::update2 @0x429dd0: `(g_speedPercent * 0.01f) * g_1b2e708`. The
     * multiply order is the original's - the percent is scaled first. */
    return ((float)percent * 0.01f) * chart_multiplier;
}

void ez2_scroll_tick(ez2_scroll *s, float target)
{
    /* chaseKeysScrollRate (../../src/gamepanels.cpp:6125): a tenth of the
     * remaining gap per tick, and NO snap - the original writes
     * `f3290 = d * 0.1f + f3290` and passes that straight to setScrollRate,
     * with only the `d != 0` guard in front of it. */
    float d;

    if (s == 0)
        return;
    d = target - s->rate;
    if (d != 0.0f)
        s->rate = d * EZ2_SCROLL_CHASE + s->rate;
}

float ez2_scroll_offset(const ez2_scroll *s, double note_tick, double now_tick,
                        float note_rate, float lane_rate)
{
    /* `48.0f / (float)(int)beat * (float)(start - now) * rate * fe8`, and
     * fe8 is `f3248[lane] * s->rate` = base * lane_rate * rate. */
    double k;

    if (s == 0)
        return 0.0f;
    k = 48.0 / (double)(s->beat > 0 ? s->beat : EZ2_SCROLL_BEAT);
    return (float)(k * (note_tick - now_tick) * (double)note_rate *
                   ((double)s->base * (double)lane_rate * (double)s->rate));
}

float ez2_scroll_y(const ez2_scroll *s, float judge_y,
                   double note_tick, double now_tick,
                   float note_rate, float lane_rate)
{
    /* `y = t - <offset> + e->f08` with t zero: the judgement line minus the
     * distance, so a note still to come sits ABOVE it. */
    return judge_y - ez2_scroll_offset(s, note_tick, now_tick,
                                       note_rate, lane_rate);
}

/* Where a note is on the field - the game's own placement arithmetic.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * THE SCROLL IS TICK-BASED, NOT TIME-BASED, and the port had it the other
 * way round until 2026-08-30 (see ../GAMEPLAY-AUDIT.md finding 1). Four
 * independent drawers place a note identically -
 *
 *     Panel::m42af30   @0x42af30   ../../src/panelhold.cpp     (keys, hold)
 *     Panel::m42a630   @0x42a630   (keys, tap)
 *     GFPanel::m4637f0 @0x4637f0   ../../src/gfpaneltap.cpp    (scratch, tap)
 *     GFPanel::m463210 @0x463210   ../../src/gfpanelhold.cpp   (scratch, hold)
 *     CatchPanel's pair            ../../src/catchhold.cpp
 *     the hold bars                ../../src/panelholdbar.cpp
 *
 * - as
 *
 *     y = t - 48/beat * (note.start - now) * st->rate * e->fe8 + e->f08
 *
 * where `note.start` and `now` are CHART TICKS (`now` is Panel::update
 * @0x42d5c0's `f28 = clock->now()`), `beat` is Panel::init's
 * `f2c = buf[2]` off the sink's tempo query - 48 - and `e->f08` is the
 * judgement line. There is no millisecond anywhere in the chain.
 *
 * The difference from a time-based field shows on any chart with a BPM
 * change: the game keeps pixels-per-TICK fixed, so a slow section's notes
 * stay the same distance apart and simply arrive later; a time-based field
 * keeps pixels-per-MILLISECOND fixed and spreads the slow section out. The
 * game's speed readout being a BPM (`songBpm * pct / 100`) only makes sense
 * under the first.
 *
 * ---- what `e->fe8` is ----------------------------------------------------
 *
 * The lane's scroll rate, and it is built in two places:
 *
 *   Panel::resetLanes @0x427680 seeds every lane from the director's f320 -
 *   the .gds **MeasureScale**, which m420640 @0x420640 FORCES to 1.6 outside
 *   modes 6/7/8/9/12 (and mode 12 keeps its field while still PUBLISHING
 *   1.6 - see ez2/songini.h, which has the exact rule and models it) - and
 *   multiplies it by a per-lane 0.5..2.5 when the
 *   slot's randomise flag is up. That product is kept in f3248[].
 *
 *   Panel::update2 @0x429dd0 (and the GF/Catch twins) then chases a live
 *   rate 10% of the remaining gap per tick toward
 *
 *       (g_speedPercent * 0.01f) * g_1b2e708           not CV2
 *       g_panelRateLadder[slot->f4e0] * g_1b2e708      CV2
 *
 *   **CORRECTED 2026-08-31** - this line used to read
 *   `ladder[slot->speedIndex]`, meaning the 0.25..5.25 table indexed by the
 *   effector's `g_1b2e914`, and both halves were wrong. The ladder is the
 *   SCROLL one (1, 1.5, 2, quarter steps to 6, then 10, 99) and the index is
 *   a per-player rung the effector never touches. All three panels do it the
 *   same way with their own copy of the same table. The full account, and
 *   why the port has not been changed to match, is in ez2/speed.h and
 *   GAMEPLAY-AUDIT.md finding 27.
 *
 *   and setScrollRate @0x429b20 writes `fe8 = f3248[lane] * rate`.
 *
 * `g_1b2e708` is the CHART's own scroll multiplier - on-disk record type 6,
 * runtime event kind 7 (../../src/kezplayer.cpp:175), reset to 1.0 per stage.
 *
 * So at rest, with the beat at 48, a note rate of 1 and no randomisers:
 * MeasureScale 1.6 x speed 1.0 = **1.6 px per chart tick = 76.8 px a beat**.
 */
#ifndef EZ2_SCROLL_H
#define EZ2_SCROLL_H

#ifdef __cplusplus
extern "C" {
#endif

/* MeasureScale's forced value outside modes 6/7/8/9/12 (@0x420640). */
#define EZ2_SCROLL_MEASURE_SCALE  1.6f
/* The beat the sink's tempo query reports - Panel::init's buf[2]. */
#define EZ2_SCROLL_BEAT           48
/* One tick of the live rate's chase (../../src/gamepanels.cpp:6125). */
#define EZ2_SCROLL_CHASE          0.1f

typedef struct ez2_scroll {
    /* The lane-independent half of e->fe8: MeasureScale, and the live rate
     * the panels chase. Kept apart because only the second one moves. */
    float base;        /* MeasureScale - f3248[] with no per-lane randomiser */
    float rate;        /* the eased live rate */
    int   beat;        /* buf[2], 48 */
} ez2_scroll;

/* Seed at the stage's start. `measure_scale` is the .gds value after
 * ez2_song_ini_apply_measure_scale has forced it; `target` is the resting
 * rate, and the live rate starts ON it rather than easing up from zero. */
void  ez2_scroll_init(ez2_scroll *s, float measure_scale, int beat,
                      float target);

/* The rate the panels chase toward: the dial times the chart's own
 * multiplier. `percent` is g_speedPercent for the twelve normal modes;
 * pass `ez2_speed_multiplier(index) * 100` for CV2Mix, which is the same
 * number in the same units. */
float ez2_scroll_target(int percent, float chart_multiplier);

/* One tick of the 10% chase. Call once a frame, before placing anything. */
void  ez2_scroll_tick(ez2_scroll *s, float target);

/* Pixels between a note and the cursor. Positive = the note is still above
 * the judgement line. `note_rate` is SlotState.rate - 1.0 unless an option
 * randomised it - and `lane_rate` the per-lane 0.5..2.5 factor, 1.0 when the
 * slot's randomiser is down. */
float ez2_scroll_offset(const ez2_scroll *s, double note_tick, double now_tick,
                        float note_rate, float lane_rate);

/* The note's y on a field whose judgement line is at `judge_y`. */
float ez2_scroll_y(const ez2_scroll *s, float judge_y,
                   double note_tick, double now_tick,
                   float note_rate, float lane_rate);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_SCROLL_H */

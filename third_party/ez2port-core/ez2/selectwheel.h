/* The song-select wheel - the cursor's input rules and the scroll's chase.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * The game's select cursor is not an instant list index: presses, held keys
 * and the turntable all step a cursor, and a SCROLL value then chases
 * `cursor * 100` at a stepped velocity. Both halves are read off matched or
 * call-exact reconstructions, and both are pure arithmetic - which is why
 * they live here and not in the tool: the feel of the wheel is game
 * behaviour, testable with no screen.
 *
 * ---- the input side, read off `inputRubyMix` @0x43b8d0 (100%) ------------
 *
 * All thirteen handlers share the shape (`src/songselectinput.cpp`); the
 * per-mode differences are which buttons feed it, not the arithmetic:
 *
 *   - a step fires on a BUTTON EDGE, on the turntable's accumulator passing
 *     a threshold, or on a HOLD-REPEAT counter passing one;
 *   - the thresholds are LIST-SIZE dependent, split on `count >= 8`: the
 *     turntable needs +-0x14 on a short list and +-0xa on a long one, the
 *     repeat counter > 0xa short and > 3 long - a short list scrolls
 *     deliberately, a long one fast;
 *   - the repeat counter starts counting only once the key has been held
 *     0x96 (150) ticks, increments per tick, and EVERY counter resets on
 *     ANY step - so repeat cadence is ~11 frames short, ~4 long;
 *   - a step remembers the previous cursor, zeroes the idle counter, stops
 *     the preview; the idle counter feeds the preview reload at > 0x1e (30).
 *
 * The move sound is `system\SongSelect\select2.wav` for the keys modes
 * (`select.wav` in modes 6..9, CV2's own elsewhere) and the confirm
 * `decide.wav` - the ctor @0x435390 loads them (`src/songselectctor.cpp`);
 * the shipped tree carries them as `.ssf`.
 *
 * ---- the motion side, read off update2 @0x446540 (call-exact) ------------
 *
 * Per tick the scroll moves toward `cursor * 100` by a velocity picked from
 * the remaining distance - 5 under 50, 10 under 100, 20 under 200, 30
 * beyond - taking the SHORT WAY around the ring (the wrap arms re-bias by
 * count*100 first; note the game's wrap-DOWN ladder is 5/10/30/50, not
 * 5/10/20/30 - reproduced as read). It snaps when within 10, snaps a
 * wrap-approach to a zero target from count*100-10, and re-wraps into
 * [0, count*100).
 *
 * The port's select list positions rows from `scroll`, so the chase is what
 * a player sees. The RADIO modes (6..9) have none of this - their handlers
 * step the cursor directly (PORT-DELTAS, song-select behaviour 4) - and the
 * eased ANGLE pair at +0x20c0d4/+0x20c0d8 (the 2*pi/count per step, chased
 * by a third per tick) drives the rotating disc, not this scroll.
 */
#ifndef EZ2_SELECTWHEEL_H
#define EZ2_SELECTWHEEL_H

#ifdef __cplusplus
extern "C" {
#endif

/* The game's constants, named so the tests read like the listing. */
/* 0x96 is 150 MILLISECONDS: heldFor counts ms (effectorinput.cpp reads
 * `>= 500` as half a second), so the arm is nine frames at 60, not 150. */
#define EZ2_WHEEL_HOLD_ARM     9      /* frames held (150 ms) before repeat counts */
#define EZ2_WHEEL_REP_SHORT    0xa    /* repeat counter threshold, count < 8 */
#define EZ2_WHEEL_REP_LONG     3      /* and count >= 8 */
/* THE RADIO WHEELS REPEAT DIFFERENTLY. inputRadioMix @0x43cf30 and its three
 * siblings (input5RadioMix @0x43dc00, input10RadioMix @0x43e8d0,
 * input14RadioMix @0x43f390) do not take the count < 8 split and do not ease:
 * their arms are a bare `f84 -= 1` / `f84 += 1` with no chart reset and no
 * angle step, the two directions are `else if` rather than two independent
 * tests, and the repeat threshold is **>= 5 with the counter RESET on the
 * step** - so after the same 150-tick arm the wheel advances every five
 * ticks rather than every tick. P2's arms carry no repeat term at all. */
#define EZ2_WHEEL_REP_RADIO    5      /* and it resets, so: one step per 5 */
#define EZ2_WHEEL_ACCUM_SHORT  0x14   /* turntable threshold, count < 8 */
#define EZ2_WHEEL_ACCUM_LONG   0xa    /* and count >= 8 */
#define EZ2_WHEEL_IDLE_PREVIEW 0x1e   /* idle ticks before the preview */

typedef struct ez2_select_wheel {
    int   count;       /* f7c - entries on the ring */
    int   cursor;      /* f84 - wrapped into [0, count) */
    int   prev;        /* f_bfdd8 - the cursor before the last step */
    float scroll;      /* f_c4 - entry units of 100, chases cursor*100 */

    int   hold_up;     /* ticks the up control has been held (heldFor) */
    int   hold_down;
    int   rep_up;      /* f_c0e20 / f_c0e24 - the repeat counters */
    int   rep_down;
    int   accum;       /* the turntable accumulator, if the caller has one */
    int   idle;        /* f_20e894 - ticks since the last step */
} ez2_select_wheel;

void ez2_select_wheel_init(ez2_select_wheel *w, int count, int cursor);

/* One input tick. `up_edge`/`down_edge` are this tick's presses;
 * `up_held`/`down_held` whether the controls are down at all (the wheel
 * counts the hold itself). `accum_delta` adds to the turntable accumulator
 * (0 for a keyboard). Returns -1, 0 or +1 - how the cursor stepped - and a
 * caller that gets non-zero stops its preview and plays the move sound,
 * which is the game's own aftermath. */
int  ez2_select_wheel_step(ez2_select_wheel *w, int up_edge, int down_edge,
                           int up_held, int down_held, int accum_delta);

/* One motion tick - the stepped-velocity chase. Call once per frame. */
void ez2_select_wheel_chase(ez2_select_wheel *w);

/* 1 once the idle dwell has reached the preview threshold. */
int  ez2_select_wheel_wants_preview(const ez2_select_wheel *w);

/* ---- the disc carousel's placement - m439f00 @0x439f00 ------------------
 *
 * The keys modes' default select page is a carousel of song DISCS flying an
 * arc, read off the plain list page (src/songselectpage.cpp) and its entry
 * drawer m431ae0 @0x431ae0: (x, y) is the entry's CENTRE - the drawer
 * paints at (x - s/2, y - s/2) sized s by s - `size` runs 176 at the focus
 * down to 112 past a spread of 200, and `bright` is splatted into all four
 * colour channels. The focused entry (size 176) is where the drawer latches
 * the big disc art (`system\disc\<key>[-tier].bmp`) over the thumb
 * (`system\discsmall\<key>.bmp`), between the shared base
 * (`system\disc\disc-mask.bmp`) and ring (`shape_mask.bmp`, 3px larger).
 *
 * The math rides the engine's 1024-samples-per-turn trig tables (0x4a5228 /
 * 0x4a6228 - live in the packer dump, sin[256] = 1.0, so plain libm at
 * 1024ths reproduces them): the entry's ring distance is doubled, culled
 * outside (-400, 800), x comes from angleToY @0x434d70 minus 274 and y from
 * the cosine arc at (d + 0x34c). The focus lands at (473.6, 231) - which is
 * why the port's hand-placed big disc at (454, 230) always looked right.
 *
 * ONE DISC IS ON SCREEN AT A TIME, AND THAT IS CORRECT. Do not "fix" it.
 * The arithmetic reads like a carousel and is not one: entry spacing is 100,
 * DOUBLED to 200, so with 40 songs only five entries pass the gate and four
 * of those five land off the screen -
 *
 *     entry  0  (473.6, 231.2) size 176   <- the focus, the only one visible
 *     entry  1  (107.9,  -40.2) size 112  <- above the top edge
 *     entry  2  (-199.3, 346.4) size 112  <- off the left
 *     entry  3  ( -40.6, 878.4) size 112  <- below and left
 *     entry 39  (412.7, 800.8) size 112   <- below the bottom
 *
 * That looks like a bug and is not: CONFIRMED against the cabinet on
 * 2026-08-30 - its song select shows one disc at a time too. The neighbours
 * exist so a disc can fly in and out along the arc while the scroll chases,
 * not so several sit on screen together. test_selectwheel.c pins it. */

typedef struct ez2_select_place {
    float x, y;     /* the entry's CENTRE */
    float size;     /* 176 focused .. 112 far */
    int   bright;   /* 255 at the focus, 155 past +-100, splat into RGBA */
} ez2_select_place;

/* Place entry i against the wheel's current scroll. Returns 1 and fills
 * `out` when the entry is inside the visible gate, 0 when culled. */
int ez2_select_wheel_place(const ez2_select_wheel *w, int i,
                           ez2_select_place *out);

/* ---- the focused disc's SWING - m431ae0's spring ------------------------
 *
 * The focused disc spins toward a rest angle picked by the difficulty's art
 * index (the game's f_f4: NM 0, HD 1, SHD 3, EX 4) - 0, 360, 720 and 1080
 * degrees, i.e. whole extra turns per tier - closing a sixth of the gap per
 * frame, the advance gated and clamped into [0, 1080] exactly as compiled.
 * The art the disc shows flips from the NM face to the tier's own as the
 * angle passes 180. A latch starts at angle 0 with step -30; a retarget
 * negates the step before the ladder overwrites it (the original does the
 * same dead store - kept out of this function, which is the LADDER + the
 * advance only, run once per frame). */
void ez2_select_swing_tick(int diff_idx, float *angle, float *step);

/* ---- the SONG-NAME RAIL - m438d30 @0x438d30 + drawOne @0x4323c0 ---------
 *
 * The page draw runs the disc carousel and then calls m438d30, which is the
 * screen's other half: a vertical column of PRE-RENDERED TITLE PICTURES down
 * the left edge, 256x32 apiece (`system\songname\<key>.bmp`, the same key
 * the disc art uses), under a stretched backing strip.
 *
 * m438d30 in order:
 *
 *   1. blend (9,6), `System\SongSelect\vf\b_mask_2.bmp` at (0, 64) with
 *      width 0 - the drawer's "natural", so 512 - and height 490. The
 *      asset is 512x32, so it is STRETCHED down the screen: a multiply
 *      strip that darkens the movie behind the names.
 *   2. `System\SongSelect\VF\Selectcursor.str` ticked - the highlight
 *      that marks the focused row.
 *   3. the wrapped entry walk below, each visible slot handed to
 *      Obj4323C0::drawOne @0x4323c0 as `drawOne(i, f70, 76.5, y, 0, 0,
 *      bright)`. drawOne draws the plate under blend (2,2) at
 *
 *          x = 76.5 - off - 50           (off is 0, so 26.5)
 *          y = plate_h*0.5 + y + 41      (frac is 0, so the height is the
 *                                         texture's own and this centres it)
 *
 *      with `bright` splatted into all four colour bytes. Both `off` and
 *      `frac` are literal zeros at BOTH of the game's call sites, and a
 *      zero width or height means "the texture's own" in every member of
 *      the quad family (drawTex @0x403f80, m404c50 @0x404c50) - so the
 *      plate is drawn at 256x32 and EZ2_SELECT_RAIL_DY is the whole offset.
 *
 * THE WALK IS NOT ONE ENTRY PER ROW. The slot index runs from a fixed lead
 * of 7 ahead of the cursor and the distance `d = slot*100 - scroll` is the
 * ring position, so the FOCUS IS AT d == 700, not at d == 0 the way the
 * disc carousel's is. Slots outside 85 <= d <= 1500 are culled, which
 * leaves about fifteen rows on screen.
 *
 * AND IT HAS TWO HALVES, which is the part worth knowing: on a list of
 * fewer than 30 entries the walk runs `count * 60` slots with a wider wrap
 * instead of `count`, so a SHORT LIST REPEATS down the rail rather than
 * leaving it half empty. The band constants differ by 2px between the two
 * halves (95/104/214 fine, 97/106/216 coarse) - transcribed, not smoothed.
 *
 * The y ramp is four bands: a flat 0.317 pitch above and below, and around
 * the focus a 0.481 pitch with a cosine ripple, which opens ~50px of air
 * above the focused row and ~90 below it. Brightness ramps in from 85 (dark)
 * to 255 at the top of the rail and fades out from d 1200 to 1455 at the
 * bottom. */

/* drawOne's y offset once the plate's own half-height is added:
 * `(h - h*frac)*0.5 + y + 41` with frac 0. */
#define EZ2_SELECT_RAIL_DY  41.0f

typedef struct ez2_select_rail {
    int   entry;    /* the page row this slot shows - already ring-wrapped */
    float x;        /* the plate's LEFT edge (drawOne's x - off - 50) */
    float y;        /* the drawer's y; the plate's TOP is
                       y + plate_height*0.5 + EZ2_SELECT_RAIL_DY */
    int   bright;   /* 0..255, splatted into all four colour bytes */
} ez2_select_rail;

/* How many slots the walk has - `count` normally, `count * 60` on a list of
 * fewer than 30, which is what makes a short list repeat. */
int ez2_select_rail_slots(const ez2_select_wheel *w);

/* Place rail slot `slot` against the wheel's current scroll. Returns 1 and
 * fills `out` when the slot is inside the visible gate, 0 when culled. */
int ez2_select_rail_place(const ez2_select_wheel *w, int slot,
                          ez2_select_rail *out);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_SELECTWHEEL_H */

/* ---- CV2Mix's OWN page - m4391b0 @0x4391b0 ------------------------------
 *
 * CV2Mix does not use the keys modes' select at all. update @0x443380's
 * `case 12` calls m439dc0 @0x439dc0, which runs m4391b0 and then its own
 * chart refreshes and the two-digit stage readout - where every other keys
 * arm calls m439f00. So there is no disc carousel and no name rail on this
 * screen; there is one column of entry panels, and it is a different
 * arithmetic throughout:
 *
 *   the window       a +-5 slot lead over the RAW song table, not the
 *                    category page - `for (i = -5; i + 5 < f80; i++)` with
 *                    the ring wrapped into (-50*f80, 50*f80]
 *   the gate         85 <= d <= 1200, where the rail's is 1500
 *   THE FOCUS        d == 500, where the rail's is 700
 *   the y ramp       d * 0.390625 + 10 + 34 - 112 + 25.3 - one chained
 *                    constant run with NO cosine arc anywhere
 *   x                45
 *   brightness       255 at the focus, (int)d capped below it, 1155 - d
 *                    past 900 - the same shape as the rail's, its own
 *                    numbers
 *
 * Each visible slot goes to m4324b0 @0x4324b0, drawOne's sibling, which
 * draws a BackPanel mask/panel pair at the entry's own centre, the entry's
 * name texture at x - 50, and the chart's level as one or two 32x32 digits.
 * Both of its `off` and `frac` arguments are literal zero at the one call
 * site, exactly as drawOne's are, so a zero width or height means the
 * texture's own. */

typedef struct ez2_select_cv2 {
    int   entry;    /* the song this slot shows - already ring-wrapped */
    float x;        /* 45 - the panel's left edge */
    float y;        /* the drawer's y; the panel's top adds half its height */
    int   bright;
} ez2_select_cv2;

/* m4324b0's own offsets from the y above, with `frac` zero:
 *   the panel pair   y + panel_height*0.5 + 38
 *   the name plate   y + panel_height*0.5 + 41, at x - 50
 *   the level digits y + 59, one at x + 203 or two at x + 198 and x + 208 */
#define EZ2_CV2_PANEL_DY   38.0f
#define EZ2_CV2_NAME_DY    41.0f
#define EZ2_CV2_NAME_DX   (-50.0f)
#define EZ2_CV2_LEVEL_DY   59.0f
#define EZ2_CV2_LEVEL_DX   203.0f   /* 306 - 103, the one-digit case */
#define EZ2_CV2_LEVEL_DX2  198.0f   /* 301 - 103, the tens */
#define EZ2_CV2_LEVEL_DX3  208.0f   /* 311 - 103, the ones */

int ez2_select_cv2_slots(const ez2_select_wheel *w);
int ez2_select_cv2_place(const ez2_select_wheel *w, int slot,
                         ez2_select_cv2 *out);

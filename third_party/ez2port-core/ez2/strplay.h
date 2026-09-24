/* EZ2AC `.str` clip PLAYER - the engine's tween, headless.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * ez2/str.c parses a clip; this plays it, exactly as Obj402860's tick
 * @0x403940 does (../../src/accessors.cpp, 100%), and hands a drawer the
 * blit each row wants this frame. It draws nothing itself, which is why it
 * lives in the core and not beside the renderer: the rules below are
 * testable on a build box with no window, and were not while they sat in
 * scene/bga.c - the first build of the stateful player shipped a hang no
 * test could see (a draw past a looping clip's length ticked forever).
 *
 * THE MODEL. A layer's keys come in pairs: a POSE (frametype 0) and, at the
 * same frame, a DELTA (frametype 1). Per row the player keeps a cursor onto
 * the key in force and an accumulator - a VideoBlit, which ez2_str_key IS
 * with two ints in front. Each frame: a pose is COPIED into the
 * accumulator; a delta is ADDED to it, every channel - position, uv, quad,
 * angle, colour and alpha - and its frame mode says how the cell index
 * moves. So a fade is a colour delta, a pan a uv delta, a zoom a quad
 * delta, and a stateless "pose at frame f" cannot draw any of them.
 *
 * The rules that come with it, all the engine's own:
 *   - the cursor advances when a later key starts THIS frame, and RETIRES
 *     (-1) once it reaches the row's last key; a retired row draws nothing;
 *   - a pose whose next key shares its frame hands the cursor on at once,
 *     which is how the (pose, delta) pair works;
 *   - the table is DONE when every row that has a track has retired - row 0
 *     exempt when it has none (attach @0x4028b0: it is the clear colour's
 *     slot and nearly always empty);
 *   - done and looping (attach's flag 1) rewinds: frame counter, retired
 *     count and cursors to zero, the accumulators left as they are (the
 *     poses at frame 0 overwrite them); done and one-shot FINISHES: nothing
 *     draws until the player is rewound from outside;
 *   - the speed guard: a frame speed over 100000 (the +inf a still layer
 *     carries) is zero.
 *
 * SEEKING. A drawer asks for "frame f" (a scene clock, a caller's modulo);
 * ez2_str_player_seek ticks up to and including it, rewinding first when f
 * is earlier than the last frame ticked - the engine's seek @0x402d60. The
 * comparison is against `played`, the count of ticks run since that rewind,
 * NOT the engine's own frame counter: a loop rewind zeroes the latter, and
 * comparing against it is the hang. */
#ifndef EZ2_STRPLAY_H
#define EZ2_STRPLAY_H

#include "str.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct ez2_str_row {
    int          cursor;   /* key in force; -1 = retired */
    ez2_str_key  out;      /* the accumulator */
    ez2_str_key  cp;       /* what this frame draws (differs from out in mode 5) */
    int          drawn;    /* this frame reached the row's draw */
} ez2_str_row;

typedef struct ez2_str_player {
    const ez2_str *clip;   /* borrowed - must outlive the player */
    ez2_str_row   *rows;   /* one per layer */
    int            f8;       /* the engine's frame counter: the next tick is frame f8 */
    int            played;   /* ticks run since the last outside rewind */
    int            retired;  /* f20c */
    int            fc;       /* rows that must retire for the table to be done */
    int            loop;     /* attach's flag: 1 rewinds, 0 finishes */
    int            finished; /* a one-shot that has run out */
} ez2_str_player;

/* Attach a clip. Returns 0 out of memory. The player starts at frame 0 with
 * nothing ticked; a draw wants ez2_str_player_seek first. */
int  ez2_str_player_init(ez2_str_player *p, const ez2_str *clip, int loop);
void ez2_str_player_free(ez2_str_player *p);

/* Back to frame 0, ticks and finish flag cleared. */
void ez2_str_player_reset(ez2_str_player *p);

/* One frame. Returns 0 when a one-shot has run out (and draws nothing). */
int  ez2_str_player_tick(ez2_str_player *p);

/* Tick up to and including `frame` (rewinding when it is earlier than the
 * last frame ticked). Bounded: at most `frame - played + 1` ticks. */
void ez2_str_player_seek(ez2_str_player *p, int frame);

/* The blit row `r` draws after the last tick, or NULL when it draws
 * nothing (no track, retired, before its first key, or the table has
 * finished). Row 0's blit is the CLEAR colour, not a sprite - the tick's
 * draw tail @0x403940 clears the device with it. */
const ez2_str_key *ez2_str_player_row(const ez2_str_player *p, int r);

/* Whether the whole table has finished (one-shot only). */
int  ez2_str_player_finished(const ez2_str_player *p);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_STRPLAY_H */

/* The note-order options — the random lane shuffles.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * THIS IS IN THE "MUST BE EXACT" COLUMN (../../docs/PORTING.md 4d), because it
 * decides which lane a note is in: the same chart played with the same inputs
 * diverges if the shuffle does. It consumes ez2_rng, which is exact, and every
 * reduction here is `% n` with the game's modulo bias left intact.
 *
 * Seven passes went into finding this; ../../docs/PORT-ROADMAP.md ("The
 * note-order options") carries the working, the dead ends, and what is still
 * unread. The short version, read from EZ2DJMainGameDirector::pickTwoLanes
 * @0x421680 and the transform @0x421c60..0x421dbc:
 *
 * ---- it is a per-step SWAP of two lanes, not a permutation ----------------
 *
 * Each step draws two lane indices, rejects the draw if it is unusable, and
 * SWAPS the notes of the two lanes' tracks over that step's tick window. The
 * original does the swap as three moves through track 21 as scratch
 * (`move(ta,21); move(tb,ta); move(21,tb)`, all @0x421510). This module swaps
 * directly - the result is identical, and borrowing track 21 is a detail of
 * the original's note storage rather than of the shuffle. See the roadmap on
 * why track 21 is a questionable temporary to imitate.
 *
 * ---- THREE strategies, chosen by mode and two globals --------------------
 *
 *     mode 4 or 8  ->  g_1b2ef38 ? HALF : PLAIN
 *     otherwise    ->  g_1b2ebbc ? INNER : PLAIN
 *
 * with `n` the lane count and `off` a base offset:
 *
 *   PLAIN   first = rand() % n + off,      second = rand() % n + off
 *   INNER   first = rand() % (n-2) + off,  second = rand() % (n-2) + off
 *   HALF    a = rand() % n,                second = rand() % n / 2,
 *                                          plus n/2 when a >= n/2
 *
 * (PLAIN's second pick is biased by `off` too - @0x421cc9 jumps into the
 * `add edx,edi` that HALF also uses, which is the one place cl's cross-jump
 * makes the two look different in a listing and they are not.)
 *
 * HALF always lands both picks in the SAME HALF of the keyboard, which is what
 * the option set calls `HRANDOM`. INNER's `n-2` drops two lanes from the draw
 * arithmetically - the same exclusion the veto below does by id, done cheaply
 * for a lane order that keeps the two at the end.
 *
 * ---- the rejections ------------------------------------------------------
 *
 * A draw is rejected when the two lane indices are equal, when their TRACKS are
 * equal, when either lane's control id is vetoed (see ez2_note_order_locked),
 * or when either repeats the previous step's lane. Each rejection decrements a
 * retry counter rather than looping forever, and a step gives up rather than
 * blocking. The shuffle runs at most EZ2_ORDER_STEPS steps per invocation.
 *
 * ---- AND THE OPTION VALUES ARE NOW READ ----------------------------------
 *
 * The ninth pass closed the mapping the paragraph here used to say was open.
 * `g_37dcecc` is the note-order option value and it indexes the effector's
 * icon table at `songSelect+0xbfee8` (loaded @0x437fc7..0x4380d5, read back
 * @0x43858e), so the ICONS name the values:
 *
 *     0 RANDOM_OFF   1 RANDOM   2 SRANDOM   3 PS   4 FR   5 MRANDOM
 *     6 HRANDOM      7 MIRROR   8 MIRROR_A  9 KEY  10 SP
 *
 * The commit @0x448b52 dispatches on `value - 1` (table @0x448e6c) and each
 * arm records one EFFECT ID in `g_effector[id]` @0x4184e0; the in-game replay
 * @0x424711 walks those flags and hands the id to the transform dispatcher
 * @0x422f20, which is where each id becomes an actual permutation. So the
 * chain is  value -> icon name -> effect id -> transform, and it closes.
 *
 * HRANDOM IS NOT `HALF`. The earlier guess tied HALF to the name by its
 * same-half property; the dispatcher says otherwise. HALF and INNER are both
 * reached only from value 4, `FR`, and only in the modes whose arm sets the
 * flag (@0x448b89) - so `FR` is the side-constrained random and `HRANDOM` is
 * an ordinary windowed one. The guess is recorded here because it was wrong
 * for a plausible reason.
 *
 * ---- what each option does ----------------------------------------------
 *
 *   RANDOM   3  0x421c30(veto)      whole chart, 16 swaps
 *   FR       3  0x421c30(veto)      as RANDOM but HALF (modes 4,8) or
 *                                   INNER (modes 3,7); PLAIN elsewhere, which
 *                                   makes it a no-op difference on modes 5,9
 *                                   even though their arm sets the flag
 *   MRANDOM  5  0x421c30(no veto)   as RANDOM, scratch and pedal included
 *   SRANDOM  4  0x4219c0(veto)      per WINDOW of ticks_per_measure/4
 *   HRANDOM 23  0x4219c0(no veto)   same window, scratch and pedal included
 *   PS      29  0x421750(veto)      per WINDOW of ticks_per_measure*8
 *   MIRROR  22  by mode             modes 5,9: the whole row incl. scratch
 *                                   (0x4226f0); modes 3,7: KEY then SP
 *                                   (0x422410 + 0x422870); else a plain
 *                                   reverse of the lane range (0x421df0)
 *   MIRROR_A 31 0x4221b0            mirror the ids {6,7,10..14,15,17}
 *   KEY     25  0x422410            mirror the KEY ids {6,7,10..14} only
 *   SP      26  0x422870            mirror the ids {15,16,17}
 *
 * ---- SWITCH and effect id 30 - both read 2026-08-13, and the hypothesis
 *      tying them together was WRONG on both ends ---------------------------
 *
 * SWITCH is NOT a note-order option, and it is SCRATCHMIX-ONLY - the
 * turntable mode, played entirely on the turntables. Its state is
 * `g_1b2e7d0`: toggled 0/1 by input control 9 at @0x43b4dc, which sits
 * INSIDE ScratchMix's own effector key handler (the 0x43ad10 ring), so no
 * other mode's menu can turn it on; drawn by its own icon pair at
 * +0xbff18/+0xbff1c and a dedicated ScratchMix HUD indicator (@0x467b47);
 * reset at slot setup (@0x430b50). Its one gameplay consumer is
 * @0x45d200 - a GFMainGameDirector method (the ScratchMix game director,
 * vftable 0x48d47c), whose single call site is @0x45f48d in that class -
 * so the remap cannot run anywhere else either. With the flag set, the
 * TURNTABLE INPUT IS REPLACED BY THE PEDAL: pedal ids 17/25 are processed
 * through the turntable's own latch machinery and turntable ids 15/23 go
 * dead. An input remap for a mode whose every lane is a turntable, nothing
 * else; it never touches the effect-flag array. The port's rebindable keys
 * (keyconf.h) subsume it - bind the scratch channel to whatever you like -
 * so it is recorded here rather than implemented as an option.
 *
 * Effect id 30 (`0x421750` without the veto - an eight-measure-window
 * shuffle over scratch and pedal too) is CONSUMED but SET BY NOTHING in
 * this build. The in-game apply walk hands it to the dispatcher
 * (@0x4247d5), and two HUD chains display it - with H-RANDOM's icon
 * (@0x467b00/@0x4513d9), so the game itself files it as an H-RANDOM
 * flavour. But every setter call with id 30 is a batch CLEAR, and the only
 * generic setter in the binary - the in-game Effector panel's option-cycler
 * widgets (@0x41ca30/@0x41cac0, entries carrying an effect id per value) -
 * iterates a list that is never filled: the Effector's ctor @0x41cfb0
 * builds no widgets and nothing else writes its widget count. Vestigial,
 * exactly like FR's arm on the two modes whose ring skips value 4. Not
 * implemented, and now for the right reason: not "unread" but "unreachable".
 *
 * The two-player forms are read but unreachable here. `KEY` uses a fixed
 * permutation instead of a mirror when the second player's list reaches 7
 * entries, and `MIRROR_A` when it reaches 9; both are transcribed below and
 * neither can fire on a 1P lane map. The port is 1P throughout.
 */
#ifndef EZ2_NOTEORDER_H
#define EZ2_NOTEORDER_H

#include "chart.h"
#include "gds.h"
#include "mode.h"
#include "rng.h"

#ifdef __cplusplus
extern "C" {
#endif

/* At most this many swap steps per invocation - `cmp eax,0x10` @0x421dbc. */
#define EZ2_ORDER_STEPS 16

typedef enum ez2_note_order {
    EZ2_ORDER_OFF = 0,
    EZ2_ORDER_PLAIN,   /* both picks over the full lane range */
    EZ2_ORDER_INNER,   /* both picks over n-2, excluding two lanes */
    EZ2_ORDER_HALF     /* both picks in the same half - `HRANDOM` */
} ez2_note_order;

/* A lane's two facts, as the original's 16-byte record holds them: the control
 * id at field +0 (what the veto tests) and the track at field +8 (what the
 * swap moves). Build one with ez2_lane_map_build. */
typedef struct ez2_lane_map {
    int count;
    int track[EZ2_MAX_LANES];
    int control[EZ2_MAX_LANES];
} ez2_lane_map;

/* Fill from a mode's lane set. `ez2_mode_lanes` knows tracks and not control
 * ids, so this leaves every id -1 - which is never vetoed AND is in none of
 * the mirrors' id sets, so the four mirror options become no-ops on a map
 * built this way. Build from the `.gds` instead wherever one is available.
 * Returns the lane count, or 0 for a mode with none. */
int ez2_lane_map_build(ez2_mode m, ez2_lane_map *out);

/* Fill from a parsed `.gds` descriptor, which carries BOTH facts the original
 * holds per lane: `SongTrack` is the track (TrackEntry +8) and `Key` is the
 * control id (TrackEntry +0) that the veto and the mirrors test. This is the
 * map the transforms are written against. Returns the lane count. */
int ez2_lane_map_from_gds(const ez2_gds *g, int player, ez2_lane_map *out);

/* Is this control id barred from the shuffle?
 *
 * @0x421490 is a membership test over ids 15..25 that returns 1 for exactly
 * {15, 17, 23, 25}, and pickTwoLanes RETRIES when it returns 1 - so it vetoes
 * rather than selects. Those four fall into two pairs eight apart, which is
 * the 1P/2P symmetry of a per-player id space, and four barred controls
 * splitting 2+2 across the players is scratch and pedal.
 *
 * THAT LAST STEP IS INFERENCE - the id-to-control table has not been read. A
 * caller who knows a lane is scratch or pedal should rely on that instead;
 * this function encodes the ids the binary actually tests. A negative id is
 * never vetoed, which is what an unmapped lane gets. */
int ez2_note_order_locked(int control_id);

/* THE WINDOWED SHUFFLES' HOLD VETO, and it differs in all THREE director
 * families (PORT-DELTAS findings 13/14, ../../src/maingameslots.cpp). The
 * candidate record is the lane's last type-1 note STRICTLY before the slice
 * start (begin mode 3 -> EzChart::findBefore @0x411d90 - which settles the
 * deltas' open question: the record precedes the slice, so Catch's test is
 * live); s/w are its tick and RAW width (note.length, biased by 6):
 *
 *     EZ2DJ       w >= 6 && start >= s && start <= s+w+8   (8 ticks of slack)
 *     ScratchMix  w >= 6 && start >= s && start <= s+w     (none)
 *     Ez2Catch    w >  6 &&               start <  s+w     (no lower bound,
 *                                          and a width-6 record is swappable)
 *
 * Keep them apart - a lane freed eight ticks earlier changes which swaps are
 * legal, and that is observable in a replay. Returns 1 when the lane must not
 * be swapped at `start`. */
int ez2_order_hold_veto(const ez2_chart *c, int track,
                        unsigned int start, ez2_mode mode);

/* THE ONE LANE THE SHUFFLE WILL NOT TOUCH.
 *
 * @0x421d0b reads `[this+0x7c0]` under the flag `[this+0x7bc]` and rejects a
 * draw when EITHER lane equals it. An earlier reading of this file called it
 * "the previous step's lanes" - it is not: only one value is read, it is a
 * MEMBER rather than a local, and nothing in the shuffle writes it. What does
 * write it is @0x430565/@0x43057a, the lane-swap option: that function looks
 * up the lanes whose control ids are 15 and 23, exchanges their tracks, and
 * records WHICH LANE the scratch ended up on. So the random options refuse to
 * move a lane the player has already relocated by hand.
 *
 * The port has no lane-swap option yet, so this is normally inactive - but it
 * is the correct shape, and a shuffle that also excluded the last pick would
 * consume a different number of rand() draws, which is exactly the kind of
 * divergence this module exists to avoid. */
typedef struct ez2_order_state {
    int have_lock;   /* `[this+0x7bc]` - the lane-swap option is on */
    int locked;      /* `[this+0x7c0]` - the lane it put the scratch on */
} ez2_order_state;

#define EZ2_ORDER_STATE_INIT { 0, -1 }

/* Draw one usable pair of LANE INDICES under `strat`. Returns 1 and writes
 * both indices, or 0 if `retries` draws were all rejected. Does not touch the chart -
 * exposed separately because it is the part that must match the game's rand()
 * sequence call for call, and so is what a differential test drives. */
int ez2_note_order_pick(const ez2_lane_map *lanes, ez2_note_order strat,
                        ez2_rng *rng, const ez2_order_state *st,
                        int retries, int *a, int *b);

/* Swap every note of tracks `ta` and `tb` whose tick is in [lo, hi]. */
void ez2_note_order_swap(ez2_chart *c, int ta, int tb,
                         unsigned int lo, unsigned int hi);

/* One invocation: up to EZ2_ORDER_STEPS pick-and-swap steps over [lo, hi].
 * Updates `st`. Returns how many swaps were actually made. */
int ez2_note_order_apply(ez2_chart *c, const ez2_lane_map *lanes,
                         ez2_note_order strat, ez2_rng *rng,
                         ez2_order_state *st,
                         unsigned int lo, unsigned int hi);

/* ------------------------------------------------------------------ options
 *
 * The menu values, numbered as the game numbers them: `g_37dcecc` indexes the
 * icon table directly, so these ARE the icon names in the icon order. */
typedef enum ez2_order_option {
    EZ2_OPT_NONE     = 0,
    EZ2_OPT_RANDOM   = 1,
    EZ2_OPT_SRANDOM  = 2,
    EZ2_OPT_PS       = 3,
    EZ2_OPT_FR       = 4,
    EZ2_OPT_MRANDOM  = 5,
    EZ2_OPT_HRANDOM  = 6,
    EZ2_OPT_MIRROR   = 7,
    EZ2_OPT_MIRROR_A = 8,
    EZ2_OPT_KEY      = 9,
    EZ2_OPT_SP       = 10,
    EZ2_OPT_COUNT    = 11
} ez2_order_option;

/* "RANDOM", "MIRROR_A", ... - the icon stem, uppercase. NONE gives "OFF". */
const char      *ez2_order_option_name(ez2_order_option o);
/* Parse one, ignoring case and accepting `-`/`_` interchangeably.
 * EZ2_OPT_NONE for "off"/"none"/""; -1 for anything unrecognised. */
int              ez2_order_option_parse(const char *s);

/* The effect id the option's arm records - ids 3,4,5,22,23,25,26,29,31, the
 * numbers the dispatcher @0x422f20 switches on. 0 for EZ2_OPT_NONE. Exposed
 * because it is the join between the menu and the transforms, and because two
 * distinct options (RANDOM and FR) share id 3. */
int              ez2_order_option_effect(ez2_order_option o);

/* Does this option shuffle at random (and so consume `rng`), or is it a fixed
 * permutation? The four mirrors are fixed; everything else draws. */
int              ez2_order_option_is_random(ez2_order_option o);

/* Apply one option to a whole chart. `mode` selects the per-mode variants -
 * FR's strategy and MIRROR's three shapes - and `rng` may be null for the
 * fixed options. Returns the number of track swaps performed, or -1 on a bad
 * argument. The chart is modified in place. */
int ez2_note_order_apply_option(ez2_chart *c, const ez2_lane_map *lanes,
                                ez2_order_option opt, ez2_mode mode,
                                ez2_rng *rng);

/* ------------------------------------------------- which options a mode has
 *
 * THE MENU IS PER MODE, and it is not a filter - it is a CYCLE. Each mode's
 * effector key handler (thirteen of them, reached through the jump table at
 * 0x448e00 on the mode index) increments the value and then rewrites it
 * through its own skip list, so the values a mode can reach are whatever its
 * ring visits. A 5-key mode's ring is four long; RadioMix's is all eleven.
 *
 * This is what makes the FR discrepancy a non-issue rather than a bug. The
 * option arm @0x448b89 sets the HALF flag for modes 4, 5, 8 AND 9, while the
 * reader @0x421c75 only routes 4 and 8 to it - so 5 and 9 looked like they
 * silently got PLAIN. They do, and it never happens: SpaceMix and 14RadioMix
 * are exactly the two modes whose ring SKIPS value 4. Every mode that can
 * select FR gets a real strategy from it. */

/* Can `mode` select `opt` at all? */
int ez2_order_option_available(ez2_mode mode, ez2_order_option opt);

/* The next value the mode's cycler would produce - one press of the button.
 * Wraps, so repeated calls enumerate the ring. */
ez2_order_option ez2_order_option_next(ez2_mode mode, ez2_order_option opt);

/* The pick strategy `opt` uses on `mode` - EZ2_ORDER_OFF for a fixed option.
 * Split out because the mode dependence is the surprising part: FR is the
 * only option that is not PLAIN, and only on four of the thirteen modes. */
ez2_note_order ez2_order_option_strategy(ez2_order_option opt, ez2_mode mode);

/* ------------------------------------------------------------- the mirrors
 *
 * Each collects the lanes whose control id is in its set, IN LANE ORDER, and
 * reverses that sequence by swapping tracks pairwise. A lane whose id is in no
 * set is left alone, which is why a lane map with no ids makes them no-ops. */

/* Mirror the lanes whose control id is in `ids`, over the whole chart.
 * Returns the number of swaps. This is the shape of 0x422410 / 0x422870 /
 * 0x4221b0 with the id set factored out. */
int ez2_note_order_mirror_ids(ez2_chart *c, const ez2_lane_map *lanes,
                              const int *ids, int nids);

/* Reverse the whole lane range - 0x421df0, which works by lane POSITION and
 * so needs no control ids at all. */
int ez2_note_order_mirror_lanes(ez2_chart *c, const ez2_lane_map *lanes);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_NOTEORDER_H */

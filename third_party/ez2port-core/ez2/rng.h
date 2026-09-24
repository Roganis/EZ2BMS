/* The game's random number generator.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * IT IS IN THE "MUST BE EXACT" COLUMN (../../docs/PORTING.md 4d): "the RNG and
 * anything it feeds". A different sequence means a different random-option
 * chart, which a player notices in a replay.
 *
 * AND IT IS NOT A CUSTOM LCG. `rand` @0x47928f and `srand` @0x479282 are the
 * statically-linked MSVC 7.1 CRT's, annotated as such in ../../src/library.cpp.
 * So reproducing the game means reproducing Microsoft's generator exactly:
 *
 *     seed = seed * 214013 + 2531011          (mod 2^32)
 *     return (seed >> 16) & 0x7fff            (0..32767)
 *
 * The host's own rand() will NOT do. glibc's is a different algorithm with a
 * different period, and even where the recurrence matched, RAND_MAX does not.
 *
 * ---- what consumes it, read from the binary -------------------------------
 *
 * 66 call sites. The ones inside the exact column:
 *
 *   EZ2DJMainGameDirector::pickTwoLanes  @0x421680  (src/maingameslots.cpp)
 *   GFMainGameDirector::pickTwoLanes     @0x45e6b0  (src/maingameslots.cpp)
 *   CatchMainGameDirector::m46e3e0       @0x46e3e0  (STUB - the third one)
 *   SlotOwner::randomizeHits             @0x422a60  (src/playerslot.cpp)
 *   InGame::pickDistinct                 @0x433cf0  (src/ingame.cpp)
 *
 * The rest are panel and lane animation (`Panel::resetLanes` @0x427680,
 * `GFPanel::m4644c0` @0x4644c0 and friends) and land in the free column.
 *
 * EVERY ONE OF THEM REDUCES WITH `% n`. Reproduce that, modulo bias and all -
 * a "better" reduction is a different chart.
 *
 * ---- and the seeding is wall-clock, which bounds what "exact" can mean -----
 *
 * `srand` has exactly TWO call sites:
 *
 *   EZ2AC::EZ2AC       @0x414ea0 - once, at application construction
 *   InGame::pickDistinct @0x433cf0 - `srand(time(0))` on EVERY CALL, before
 *                                    picking its eight distinct values
 *
 * So the game's sequence is seeded from the wall clock at one-second
 * granularity and cannot be replayed from a recording that did not capture the
 * seed. What the port can guarantee - and what this module exists to
 * guarantee - is that GIVEN THE SAME SEED the sequence is identical, which is
 * exactly what a differential run against the real game needs: force the seed
 * on both sides and the two must agree call for call.
 */
#ifndef EZ2_RNG_H
#define EZ2_RNG_H

#ifdef __cplusplus
extern "C" {
#endif

/* What the CRT's rand() can return, inclusive. Not the host's RAND_MAX. */
#define EZ2_RAND_MAX 0x7fff

/* The generator, explicit rather than global, so a caller can hold several -
 * and so a test can. The game has exactly one (the CRT's), which
 * ez2_rand()/ez2_srand() below provide. */
typedef struct ez2_rng {
    unsigned int seed;
} ez2_rng;

/* MSVC's CRT starts at seed 1 when srand() was never called. */
#define EZ2_RNG_INIT { 1u }

void         ez2_rng_seed(ez2_rng *r, unsigned int seed);
int          ez2_rng_next(ez2_rng *r);          /* 0 .. EZ2_RAND_MAX */

/* `rand() % n`, with the game's bias intact. n <= 0 returns 0. */
int          ez2_rng_below(ez2_rng *r, int n);

/* The process-wide generator, mirroring the CRT's. Use these where the
 * original calls rand()/srand() directly. */
void         ez2_srand(unsigned int seed);
int          ez2_rand(void);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_RNG_H */

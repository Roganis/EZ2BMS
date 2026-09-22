/* The game's random number generator - MSVC 7.1's CRT rand(), reproduced.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "rng.h"

void ez2_rng_seed(ez2_rng *r, unsigned int seed)
{
    r->seed = seed;
}

int ez2_rng_next(ez2_rng *r)
{
    /* The multiplier and addend are Microsoft's, and the shift discards the
     * low 16 bits precisely because they are the worst ones - which is also
     * why the result only spans 15 bits. All three are part of the observable
     * behaviour, not implementation detail. */
    r->seed = r->seed * 214013u + 2531011u;
    return (int)((r->seed >> 16) & 0x7fffu);
}

int ez2_rng_below(ez2_rng *r, int n)
{
    if (n <= 0)
        return 0;
    /* `rand() % n`, exactly as every call site in the binary writes it. The
     * modulo bias is real (32768 is not a multiple of, say, 7) and it is part
     * of what the game does. Do not "fix" it. */
    return ez2_rng_next(r) % n;
}

/* The process-wide one. MSVC's CRT starts at seed 1 before any srand(). */
static ez2_rng g_rng = EZ2_RNG_INIT;

void ez2_srand(unsigned int seed)
{
    ez2_rng_seed(&g_rng, seed);
}

int ez2_rand(void)
{
    return ez2_rng_next(&g_rng);
}

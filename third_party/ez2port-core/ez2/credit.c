/* The machine's credit counter. See credit.h for the addresses.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "credit.h"

#include <string.h>

void ez2_credit_init(ez2_credit *c, int need, int have)
{
    memset(c, 0, sizeof *c);
    c->need = need < 0 ? 0 : need;
    c->have = have < 0 ? 0 : have;
    c->shown = c->have;
    c->coin_counts = 1;
    c->service_counts = 1;
}

void ez2_credit_coin(ez2_credit *c)
{
    /* serviceCoins @0x418760: `if (getState(3) == 2 && testMode2) have += 1`
     * and the change is what raises g_coinInserted / g_coinShown. */
    if (!c->coin_counts)
        return;
    c->have += 1;
    c->total_coin += 1;
    c->inserted = 1;
}

void ez2_credit_service(ez2_credit *c)
{
    /* `if (getState(2) == 2 && testMode1) { have += 1; g_serviceCoin += 1;
     * g_coinInserted = 1; }` - the same counter, so a SERVICE press is a coin
     * for every rule that follows. */
    if (!c->service_counts)
        return;
    c->have += 1;
    c->service_coin += 1;
    c->inserted = 1;
}

int ez2_credit_consume(ez2_credit *c)
{
    /* Obj40C180::consume @0x418890 (../../src/accessors.cpp:605), verbatim:
     * the need is tested first, so free play neither checks nor deducts. */
    int n = c->need;

    if (n != 0) {
        int h = c->have;

        if (h >= n)
            c->have = h - n;
        else
            return 0;
    }
    return 1;
}

int ez2_credit_enough(const ez2_credit *c)
{
    return c->have >= c->need;
}

int ez2_credit_count(const ez2_credit *c)
{
    return c->need ? c->have / c->need : 0;
}

int ez2_credit_tick(ez2_credit *c)
{
    int sound = 0;

    /* ShowCredit::update2 @0x44fb40 (../../src/showcredit.cpp:246): the
     * early return at need == 0 is why free play never hears a coin. */
    if (c->need == 0)
        return 0;
    if (c->shown < c->have)
        sound = (c->have % c->need == 0) ? 2 : 1;
    if (c->have / c->need >= 19)
        c->have = 0;
    c->shown = c->have;
    return sound;
}

int ez2_credit_take_inserted(ez2_credit *c)
{
    int was = c->inserted;

    c->inserted = 0;
    return was;
}

void ez2_credit_enter_test(ez2_credit *c)
{
    /* TestModeDirector ctor @0x4766e0: `testMode1 = testMode2 = 0; have = 0`. */
    c->coin_counts = 0;
    c->service_counts = 0;
    c->have = 0;
    c->shown = 0;
}

void ez2_credit_leave_test(ez2_credit *c)
{
    /* ~TestModeDirector @0x4761e0 latches both back to 1. */
    c->coin_counts = 1;
    c->service_counts = 1;
}

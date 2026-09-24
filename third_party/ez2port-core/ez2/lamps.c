/* The cabinet's lamps. See lamps.h for where every constant comes from.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * Every function here is a transcription of one matched function, named in the
 * comment above it. Where the original's shape exists only to satisfy the
 * compiler - the branchless `on ? K : -1`, the table read written out twice -
 * it is written plainly instead: this build has no byte to match. Where the
 * shape carries MEANING - the claim rule, the two scratch slots sharing one
 * channel, `setFlags`' 7 - it is reproduced exactly.
 */
#include "lamps.h"

#include <string.h>

/* Bit i of an output word - g_bit @0x488234, which the original keeps as a
 * 32-byte .rdata table and indexes with the channel modulo 8. */
static int bit_of(int channel)
{
    return 1 << (channel & 7);
}

static int in_range(int channel)
{
    return channel >= 0 && channel < EZ2_LAMP_CHANNELS;
}

/* ---- the model ---------------------------------------------------------- */

void ez2_lamps_init(ez2_lamps *l)
{
    int i;

    if (!l)
        return;
    memset(l, 0, sizeof(*l));
    /* bindButtons @0x418c90 creates all 26 with channel -1: nothing is routed
     * until a screen asks for it. */
    for (i = 0; i < EZ2_LAMP_SLOTS; i++) {
        l->channel[i] = -1;
        l->state[i]   = EZ2_LAMP_UP;
    }
}

/* resetFlags @0x40c8f0 */
void ez2_lamps_clear(ez2_lamps *l)
{
    if (!l)
        return;
    l->port[0] = 0;
    l->port[1] = 0;
    l->port[2] = 0;
    l->port[3] = 0;
}

/* resetInputState @0x40c820, lamp half. The four setBit calls are the
 * original's own - and it really is bits 6 and 7 of words 2 and 3, i.e.
 * channels 0x16/0x17/0x1e/0x1f, which no other function in the game touches. */
void ez2_lamps_reset(ez2_lamps *l)
{
    if (!l)
        return;
    ez2_lamps_clear(l);
    l->port[2] |= 0x40;
    l->port[2] |= 0x80;
    l->port[3] |= 0x40;
    l->port[3] |= 0x80;
}

/* setOutput @0x40c780 */
void ez2_lamps_set(ez2_lamps *l, int channel, int on)
{
    if (!l || !in_range(channel))
        return;
    if (on)
        l->port[channel / 8] |= bit_of(channel);
    else
        l->port[channel / 8] &= ~bit_of(channel);
}

int ez2_lamps_get(const ez2_lamps *l, int channel)
{
    if (!l || !in_range(channel))
        return 0;
    return (l->port[channel / 8] & bit_of(channel)) != 0;
}

/* setFlags @0x40c7d0 */
void ez2_lamps_set_all(ez2_lamps *l, int on)
{
    int v = on ? 7 : 0;

    if (!l)
        return;
    l->port[0] = v;
    l->port[1] = v;
    l->port[2] = v;
    l->port[3] = v;
}

/* The five routing functions, as one table. Each row is the original's
 * argument list read straight off the reconstruction, so the repeats are here
 * too: m418a50 gives slots 0x0f and 0x10 the SAME channel 0x15, because the
 * turntable's two directions share one lamp, and m418af0 does it again for
 * 0x17/0x18 onto 0x1d. */
typedef struct route {
    signed char slot;
    signed char channel;
} route;

static const route g_route_key67[] = {          /* m4189e0 @0x4189e0 */
    { 0x06, 0x0a }, { 0x07, 0x0b }, { 0x08, 0x0c }, { 0x09, 0x0d }
};
static const route g_route_p1[] = {             /* m418a50 @0x418a50 */
    { 0x0a, 0x10 }, { 0x0b, 0x11 }, { 0x0c, 0x12 }, { 0x0d, 0x13 },
    { 0x0e, 0x14 }, { 0x0f, 0x15 }, { 0x10, 0x15 }
};
static const route g_route_p2[] = {             /* m418af0 @0x418af0 */
    { 0x12, 0x18 }, { 0x13, 0x19 }, { 0x14, 0x1a }, { 0x15, 0x1b },
    { 0x16, 0x1c }, { 0x17, 0x1d }, { 0x18, 0x1d }
};
static const route g_route_p1_keys[] = {        /* m418b90 @0x418b90 */
    { 0x0a, 0x10 }, { 0x0b, 0x11 }, { 0x0c, 0x12 }, { 0x0d, 0x13 },
    { 0x0e, 0x14 }
};
static const route g_route_p2_keys[] = {        /* routeOutputs @0x418c10 */
    { 0x12, 0x18 }, { 0x13, 0x19 }, { 0x14, 0x1a }, { 0x15, 0x1b },
    { 0x16, 0x1c }
};

static const route *route_group(int group, int *count)
{
    switch (group) {
    case EZ2_LAMP_ROUTE_KEY67:
        *count = (int)(sizeof(g_route_key67) / sizeof(g_route_key67[0]));
        return g_route_key67;
    case EZ2_LAMP_ROUTE_P1:
        *count = (int)(sizeof(g_route_p1) / sizeof(g_route_p1[0]));
        return g_route_p1;
    case EZ2_LAMP_ROUTE_P2:
        *count = (int)(sizeof(g_route_p2) / sizeof(g_route_p2[0]));
        return g_route_p2;
    case EZ2_LAMP_ROUTE_P1_KEYS:
        *count = (int)(sizeof(g_route_p1_keys) / sizeof(g_route_p1_keys[0]));
        return g_route_p1_keys;
    case EZ2_LAMP_ROUTE_P2_KEYS:
        *count = (int)(sizeof(g_route_p2_keys) / sizeof(g_route_p2_keys[0]));
        return g_route_p2_keys;
    default:
        *count = 0;
        return 0;
    }
}

/* setChannel @0x40c230, applied over a group. */
void ez2_lamps_route(ez2_lamps *l, int group, int on)
{
    const route *r;
    int n, i;

    if (!l)
        return;
    r = route_group(group, &n);
    for (i = 0; i < n; i++) {
        if (r[i].slot >= 0 && r[i].slot < EZ2_LAMP_SLOTS)
            l->channel[(int)r[i].slot] = on ? r[i].channel : -1;
    }
}

/* The four-state press tracker, from tick @0x40cc90 and m40c6f0 @0x40c6f0 -
 * which run the identical machine over two different sources. */
void ez2_lamps_track(ez2_lamps *l, int slot, int down)
{
    int s;

    if (!l || slot < 0 || slot >= EZ2_LAMP_SLOTS)
        return;
    s = l->state[slot];
    if (down)
        l->state[slot] = (signed char)((s == EZ2_LAMP_UP || s == EZ2_LAMP_RELEASED)
                                       ? EZ2_LAMP_PRESSED : EZ2_LAMP_HELD);
    else
        l->state[slot] = (signed char)((s == EZ2_LAMP_PRESSED || s == EZ2_LAMP_HELD)
                                       ? EZ2_LAMP_RELEASED : EZ2_LAMP_UP);
}

/* applyOutputs @0x40c940.
 *
 * The claim array is the load-bearing part and it is easy to simplify away: a
 * slot in state 2/3 drives its channel AND claims it, so a later slot on the
 * same channel cannot pull it down; a slot in state 0/1 releases the channel
 * only while nothing has claimed it, and does NOT claim it itself. That
 * asymmetry is what makes the turntable work - slots 0x0f and 0x10 share
 * channel 0x15, and either direction alone must light it. */
void ez2_lamps_apply(ez2_lamps *l)
{
    int claimed[EZ2_LAMP_CHANNELS];
    int i;

    if (!l)
        return;
    memset(claimed, 0, sizeof(claimed));

    for (i = 0; i < EZ2_LAMP_SLOTS; i++) {
        int c = l->channel[i];
        int k;

        if (c == -1)
            continue;
        if (!in_range(c))
            continue;

        k = l->state[i];
        if (k == EZ2_LAMP_PRESSED || k == EZ2_LAMP_HELD) {
            if (!claimed[c]) {
                l->port[c / 8] |= bit_of(c);
                claimed[c] = 1;
            }
        } else if (k == EZ2_LAMP_UP || k == EZ2_LAMP_RELEASED) {
            if (!claimed[c])
                l->port[c / 8] &= ~bit_of(c);
        }
    }
}

/* ---- what the screens do ------------------------------------------------ */

/* BattleMode::setPlayerLamps @0x41bd20.
 *
 * Three shapes over g_modeIndex, and the odd-looking `mode != 4 && mode == 8`
 * in the first arm is the original's own test, kept because it is what decides
 * that mode 8 - and only mode 8 - also lights the four 0xa..0xd lamps. */
void ez2_lamps_player(ez2_lamps *l, int mode, int p1, int p2, int on)
{
    if (!l)
        return;

    if (mode == 4 || mode == 5 || mode == 8 || mode == 9) {
        /* Both rows, occupied or not. */
        ez2_lamps_set(l, EZ2_LAMP_P1_1, on);
        ez2_lamps_set(l, EZ2_LAMP_P1_2, on);
        ez2_lamps_set(l, EZ2_LAMP_P1_3, on);
        ez2_lamps_set(l, EZ2_LAMP_P1_4, on);
        ez2_lamps_set(l, EZ2_LAMP_P1_5, on);
        ez2_lamps_set(l, EZ2_LAMP_P2_1, on);
        ez2_lamps_set(l, EZ2_LAMP_P2_2, on);
        ez2_lamps_set(l, EZ2_LAMP_P2_3, on);
        ez2_lamps_set(l, EZ2_LAMP_P2_4, on);
        ez2_lamps_set(l, EZ2_LAMP_P2_5, on);
        if (mode != 4 && mode == 8) {
            ez2_lamps_set(l, EZ2_LAMP_EFFECT1, on);
            ez2_lamps_set(l, EZ2_LAMP_EFFECT2, on);
            ez2_lamps_set(l, EZ2_LAMP_EFFECT3, on);
            ez2_lamps_set(l, EZ2_LAMP_EFFECT4, on);
        }
        ez2_lamps_set(l, EZ2_LAMP_P1_TT, on);
        ez2_lamps_set(l, EZ2_LAMP_P2_TT, on);
    } else if (mode == 0 || mode == 1 || mode == 2 ||
               mode == 6 || mode == 10 || mode == 11) {
        /* A row only for a seat with a player in it, and mode 0 holds the
         * turntable lamp back. */
        if (p1) {
            ez2_lamps_set(l, EZ2_LAMP_P1_1, on);
            ez2_lamps_set(l, EZ2_LAMP_P1_2, on);
            ez2_lamps_set(l, EZ2_LAMP_P1_3, on);
            ez2_lamps_set(l, EZ2_LAMP_P1_4, on);
            ez2_lamps_set(l, EZ2_LAMP_P1_5, on);
            if (mode != 0)
                ez2_lamps_set(l, EZ2_LAMP_P1_TT, on);
        }
        if (p2) {
            ez2_lamps_set(l, EZ2_LAMP_P2_1, on);
            ez2_lamps_set(l, EZ2_LAMP_P2_2, on);
            ez2_lamps_set(l, EZ2_LAMP_P2_3, on);
            ez2_lamps_set(l, EZ2_LAMP_P2_4, on);
            ez2_lamps_set(l, EZ2_LAMP_P2_5, on);
            if (mode != 0)
                ez2_lamps_set(l, EZ2_LAMP_P2_TT, on);
        }
    } else if (mode == 3 || mode == 7) {
        /* Seven keys a side: the five, plus two of the shared bank. */
        if (p1) {
            ez2_lamps_set(l, EZ2_LAMP_P1_1, on);
            ez2_lamps_set(l, EZ2_LAMP_P1_2, on);
            ez2_lamps_set(l, EZ2_LAMP_P1_3, on);
            ez2_lamps_set(l, EZ2_LAMP_P1_4, on);
            ez2_lamps_set(l, EZ2_LAMP_P1_5, on);
            ez2_lamps_set(l, EZ2_LAMP_EFFECT1, on);
            ez2_lamps_set(l, EZ2_LAMP_EFFECT2, on);
            ez2_lamps_set(l, EZ2_LAMP_P1_TT, on);
        }
        if (p2) {
            ez2_lamps_set(l, EZ2_LAMP_P2_1, on);
            ez2_lamps_set(l, EZ2_LAMP_P2_2, on);
            ez2_lamps_set(l, EZ2_LAMP_P2_3, on);
            ez2_lamps_set(l, EZ2_LAMP_P2_4, on);
            ez2_lamps_set(l, EZ2_LAMP_P2_5, on);
            ez2_lamps_set(l, EZ2_LAMP_EFFECT3, on);
            ez2_lamps_set(l, EZ2_LAMP_EFFECT4, on);
            ez2_lamps_set(l, EZ2_LAMP_P2_TT, on);
        }
    }
    /* Anything else: the original falls through and leaves them alone. */
}

/* blinkAlternateLamps @0x44b330 */
void ez2_lamps_blink(ez2_lamps *l, int p1, int p2)
{
    if (!l)
        return;

    if (l->blink_phase++ % 30 < 15) {
        if (p1) {
            ez2_lamps_set(l, EZ2_LAMP_P1_1, 1);
            ez2_lamps_set(l, EZ2_LAMP_P1_3, 1);
            ez2_lamps_set(l, EZ2_LAMP_P1_5, 1);
        }
        if (p2) {
            ez2_lamps_set(l, EZ2_LAMP_P2_1, 1);
            ez2_lamps_set(l, EZ2_LAMP_P2_3, 1);
            ez2_lamps_set(l, EZ2_LAMP_P2_5, 1);
        }
    } else {
        ez2_lamps_set(l, EZ2_LAMP_P1_1, 0);
        ez2_lamps_set(l, EZ2_LAMP_P1_3, 0);
        ez2_lamps_set(l, EZ2_LAMP_P1_5, 0);
        ez2_lamps_set(l, EZ2_LAMP_P2_1, 0);
        ez2_lamps_set(l, EZ2_LAMP_P2_3, 0);
        ez2_lamps_set(l, EZ2_LAMP_P2_5, 0);
    }
    /* Held down throughout, on both arms. */
    ez2_lamps_set(l, EZ2_LAMP_EFFECT1, 0);
    ez2_lamps_set(l, EZ2_LAMP_EFFECT2, 0);
    ez2_lamps_set(l, EZ2_LAMP_EFFECT3, 0);
    ez2_lamps_set(l, EZ2_LAMP_EFFECT4, 0);
}

/* SongSelectDirector::update2 @0x446540's lamp preamble.
 *
 * Note what differs from blinkAlternateLamps above, because it is easy to
 * assume they are one function: the counter is SIXTY, not thirty; the duty is
 * thirty on, not fifteen; there is no 0xa..0xd bank; and the four both-bank
 * modes light each row unconditionally. The OFF arm drops both rows whatever
 * the mode - the original does not re-test there. */
void ez2_lamps_select_blink(ez2_lamps *l, int both_banks, int p1, int p2)
{
    if (!l)
        return;

    if (l->select_phase++ % 60 < 30) {
        if (both_banks || p1) {
            ez2_lamps_set(l, EZ2_LAMP_P1_1, 1);
            ez2_lamps_set(l, EZ2_LAMP_P1_3, 1);
            ez2_lamps_set(l, EZ2_LAMP_P1_5, 1);
        }
        if (both_banks || p2) {
            ez2_lamps_set(l, EZ2_LAMP_P2_1, 1);
            ez2_lamps_set(l, EZ2_LAMP_P2_3, 1);
            ez2_lamps_set(l, EZ2_LAMP_P2_5, 1);
        }
    } else {
        ez2_lamps_set(l, EZ2_LAMP_P1_1, 0);
        ez2_lamps_set(l, EZ2_LAMP_P1_3, 0);
        ez2_lamps_set(l, EZ2_LAMP_P1_5, 0);
        ez2_lamps_set(l, EZ2_LAMP_P2_1, 0);
        ez2_lamps_set(l, EZ2_LAMP_P2_3, 0);
        ez2_lamps_set(l, EZ2_LAMP_P2_5, 0);
    }
}

void ez2_lamps_title(ez2_lamps *l, int seated)
{
    static const int keys[12] = {
        EZ2_LAMP_P1_1, EZ2_LAMP_P1_2, EZ2_LAMP_P1_3, EZ2_LAMP_P1_4, EZ2_LAMP_P1_5, EZ2_LAMP_P1_TT,
        EZ2_LAMP_P2_1, EZ2_LAMP_P2_2, EZ2_LAMP_P2_3, EZ2_LAMP_P2_4, EZ2_LAMP_P2_5, EZ2_LAMP_P2_TT
    };
    int i, on;

    if (!l)
        return;
    if (seated) {
        /* `m_step++; if (m_step >= 0) all off; if (m_step > 5) all on;
         * if (m_step > 10) m_step = 0;` - the later block wins its frames. */
        l->title_phase++;
        if (l->title_phase > 10)
            l->title_phase = 0;
        on = l->title_phase > 5;
        for (i = 0; i < 4; i++)
            ez2_lamps_set(l, EZ2_LAMP_EFFECT1 + i, on);
        for (i = 0; i < 12; i++)
            ez2_lamps_set(l, keys[i], on);
        return;
    }
    /* the m_step >= 0 block, and the step never moves */
    l->title_phase = 0;
    for (i = 0; i < 4; i++)
        ez2_lamps_set(l, EZ2_LAMP_EFFECT1 + i, 1);
    for (i = 0; i < 12; i++)
        ez2_lamps_set(l, keys[i], 0);
}

/* BattleMode::update2 @0x41c660: the counter is incremented, wrapped at 60 and
 * only then tested, so the on-phase is 0..0x27 of the NEW value - forty ticks
 * lit, twenty dark. */
void ez2_lamps_battle_pulse(ez2_lamps *l, int mode, int p1, int p2)
{
    if (!l)
        return;
    l->battle_phase += 1;
    if (l->battle_phase >= 0x3c)
        l->battle_phase = 0;
    ez2_lamps_player(l, mode, p1, p2, l->battle_phase < 0x28);
}

/* updateStartLamps @0x44b2c0 / TitleDirector::updateTitleStartLamps @0x44e780 */
void ez2_lamps_start(ez2_lamps *l, int enough_credit, int p1_joined, int p2_joined)
{
    if (!l)
        return;
    if (enough_credit) {
        ez2_lamps_set(l, EZ2_LAMP_P1_START, p1_joined == 0);
        ez2_lamps_set(l, EZ2_LAMP_P2_START, p2_joined == 0);
    } else {
        ez2_lamps_set(l, EZ2_LAMP_P1_START, 0);
        ez2_lamps_set(l, EZ2_LAMP_P2_START, 0);
    }
}

/* ---- reading it out ----------------------------------------------------- */

int ez2_lamps_port(const ez2_lamps *l, int i)
{
    if (!l || i < 0 || i >= EZ2_LAMP_PORTS)
        return 0;
    return l->port[i] & 0xff;
}

/* 2EZConfig's names, at the channel each one decodes to. The eleven channels
 * with no entry have no light on them - four of those are the bits
 * resetInputState raises and nothing reads. */
static const char *const g_lamp_names[EZ2_LAMP_CHANNELS] = {
    "Red Lamp L", "Red Lamp R", "Blue Lamp L", "Blue Lamp R", "Neons",
    0, 0, 0,
    "P1 Start", "P2 Start", "Effector 1", "Effector 2", "Effector 3",
    "Effector 4", 0, 0,
    "P1 1", "P1 2", "P1 3", "P1 4", "P1 5", "P1 Turntable", 0, 0,
    "P2 1", "P2 2", "P2 3", "P2 4", "P2 5", "P2 Turntable", 0, 0
};

const char *ez2_lamp_name(int channel)
{
    if (!in_range(channel))
        return 0;
    return g_lamp_names[channel];
}

static int ieq(const char *a, const char *b)
{
    while (*a && *b) {
        int x = (*a >= 'A' && *a <= 'Z') ? *a + 32 : *a;
        int y = (*b >= 'A' && *b <= 'Z') ? *b + 32 : *b;

        if (x != y)
            return 0;
        a++;
        b++;
    }
    return *a == 0 && *b == 0;
}

int ez2_lamp_from_name(const char *name)
{
    int i;

    if (!name)
        return -1;
    for (i = 0; i < EZ2_LAMP_CHANNELS; i++) {
        if (g_lamp_names[i] && ieq(g_lamp_names[i], name))
            return i;
    }
    return -1;
}

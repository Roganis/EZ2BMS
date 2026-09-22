/* The note-order options. See noteorder.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "noteorder.h"

#include <stdlib.h>
#include <string.h>

int ez2_lane_map_from_gds(const ez2_gds *g, int player, ez2_lane_map *out)
{
    int i, n;

    if (!g || !out || player < 0 || player >= EZ2_GDS_MAX_SLOTS)
        return 0;
    memset(out, 0, sizeof *out);
    n = g->slots[player].count;
    if (n > EZ2_MAX_LANES)
        n = EZ2_MAX_LANES;
    for (i = 0; i < n; i++) {
        out->track[i]   = g->slots[player].lanes[i].track;
        out->control[i] = g->slots[player].lanes[i].key;
    }
    out->count = n;
    return n;
}

int ez2_lane_map_build(ez2_mode m, ez2_lane_map *out)
{
    int i, n;

    if (!out)
        return 0;
    memset(out, 0, sizeof *out);
    n = ez2_mode_lanes(m, out->track, EZ2_MAX_LANES);
    out->count = n;
    for (i = 0; i < n; i++)
        out->control[i] = -1;      /* unmapped - never vetoed */
    return n;
}

int ez2_note_order_locked(int control_id)
{
    /* @0x421490's byte-index table, exactly: ids 15..25, 1 for four of them,
     * 0 for the rest and for anything outside the range. */
    switch (control_id) {
    case 15: case 17: case 23: case 25:
        return 1;
    default:
        return 0;
    }
}

int ez2_note_order_pick(const ez2_lane_map *lanes, ez2_note_order strat,
                        ez2_rng *rng, const ez2_order_state *st,
                        int retries, int *a, int *b)
{
    int n, try_;

    if (!lanes || !rng || !a || !b || strat == EZ2_ORDER_OFF)
        return 0;
    n = lanes->count;
    if (n < 2)
        return 0;

    for (try_ = 0; try_ < retries; try_++) {
        int x, y;

        switch (strat) {
        case EZ2_ORDER_INNER:
            /* rand() % (n-2) twice. With n == 2 there is nothing to draw. */
            if (n - 2 < 1)
                return 0;
            x = ez2_rng_below(rng, n - 2);
            y = ez2_rng_below(rng, n - 2);
            break;
        case EZ2_ORDER_HALF:
            /* The second pick is drawn from the lower half and pushed into
             * the upper one exactly when the first is already there, so both
             * always land in the same half. */
            x = ez2_rng_below(rng, n);
            y = ez2_rng_below(rng, n) / 2;
            if (x >= n / 2)
                y += n / 2;
            break;
        default:
            x = ez2_rng_below(rng, n);
            y = ez2_rng_below(rng, n);
            break;
        }

        if (x < 0 || x >= n || y < 0 || y >= n)
            continue;
        if (x == y)
            continue;
        if (lanes->track[x] == lanes->track[y])
            continue;
        if (ez2_note_order_locked(lanes->control[x]) ||
            ez2_note_order_locked(lanes->control[y]))
            continue;
        if (st && st->have_lock && (st->locked == x || st->locked == y))
            continue;

        *a = x;
        *b = y;
        return 1;
    }
    return 0;
}

void ez2_note_order_swap(ez2_chart *c, int ta, int tb,
                         unsigned int lo, unsigned int hi)
{
    ez2_track *A, *B;
    int i;

    if (!c || ta == tb)
        return;
    if (ta < 0 || tb < 0 || ta >= c->track_count || tb >= c->track_count)
        return;

    A = &c->tracks[ta];
    B = &c->tracks[tb];

    /* The original does this as three moves through track 21 as scratch, which
     * exchanges the two windows WHOLESALE - a note whose counterpart track is
     * empty at that tick still moves. Swapping matched pairs in place would
     * silently drop exactly those, so build both tracks anew:
     *
     *     newA = A[tick < lo] ++ B[window] ++ A[tick > hi]
     *
     * and the mirror for B. Notes are stored tick-ordered, and every note of
     * the middle run lies inside [lo, hi], so each result is ordered by
     * construction with no merge needed. */
    {
        int awin = 0, bwin = 0, na, nb, k;
        ez2_note *newA, *newB;

        for (i = 0; i < A->note_count; i++)
            awin += (A->notes[i].tick >= lo && A->notes[i].tick <= hi);
        for (i = 0; i < B->note_count; i++)
            bwin += (B->notes[i].tick >= lo && B->notes[i].tick <= hi);
        if (awin == 0 && bwin == 0)
            return;

        na = A->note_count - awin + bwin;
        nb = B->note_count - bwin + awin;

        /* Never shrink to nothing: a zero-size malloc may return null, which
         * is indistinguishable here from a real failure. */
        newA = (ez2_note *)malloc((na ? (size_t)na : 1) * sizeof *newA);
        newB = (ez2_note *)malloc((nb ? (size_t)nb : 1) * sizeof *newB);
        if (!newA || !newB) {      /* leave the chart untouched */
            free(newA);
            free(newB);
            return;
        }

        k = 0;
        for (i = 0; i < A->note_count; i++)
            if (A->notes[i].tick < lo) newA[k++] = A->notes[i];
        for (i = 0; i < B->note_count; i++)
            if (B->notes[i].tick >= lo && B->notes[i].tick <= hi)
                newA[k++] = B->notes[i];
        for (i = 0; i < A->note_count; i++)
            if (A->notes[i].tick > hi) newA[k++] = A->notes[i];

        k = 0;
        for (i = 0; i < B->note_count; i++)
            if (B->notes[i].tick < lo) newB[k++] = B->notes[i];
        for (i = 0; i < A->note_count; i++)
            if (A->notes[i].tick >= lo && A->notes[i].tick <= hi)
                newB[k++] = A->notes[i];
        for (i = 0; i < B->note_count; i++)
            if (B->notes[i].tick > hi) newB[k++] = B->notes[i];

        free(A->notes);
        free(B->notes);
        A->notes = newA; A->note_count = na;
        B->notes = newB; B->note_count = nb;
    }
}

int ez2_note_order_apply(ez2_chart *c, const ez2_lane_map *lanes,
                         ez2_note_order strat, ez2_rng *rng,
                         ez2_order_state *st, unsigned int lo, unsigned int hi)
{
    int step, swaps = 0;

    if (!c || !lanes || !rng || strat == EZ2_ORDER_OFF)
        return 0;

    for (step = 0; step < EZ2_ORDER_STEPS; step++) {
        int a, b;

        if (!ez2_note_order_pick(lanes, strat, rng, st, EZ2_ORDER_STEPS,
                                 &a, &b))
            break;
        ez2_note_order_swap(c, lanes->track[a], lanes->track[b], lo, hi);
        swaps++;
    }
    return swaps;
}

/* ====================================================================== the
 * options: names, ids, and the transforms each one selects.
 * ====================================================================== */

static const struct {
    const char *name;
    int         effect;      /* the id 0x422f20 dispatches on */
    int         random;
} g_options[EZ2_OPT_COUNT] = {
    { "OFF",       0,  0 },
    { "RANDOM",    3,  1 },
    { "SRANDOM",   4,  1 },
    { "PS",       29,  1 },
    { "FR",        3,  1 },
    { "MRANDOM",   5,  1 },
    { "HRANDOM",  23,  1 },
    { "MIRROR",   22,  0 },
    { "MIRROR_A", 31,  0 },
    { "KEY",      25,  0 },
    { "SP",       26,  0 }
};

const char *ez2_order_option_name(ez2_order_option o)
{
    if (o < 0 || o >= EZ2_OPT_COUNT)
        return "?";
    return g_options[o].name;
}

int ez2_order_option_effect(ez2_order_option o)
{
    if (o < 0 || o >= EZ2_OPT_COUNT)
        return 0;
    return g_options[o].effect;
}

int ez2_order_option_is_random(ez2_order_option o)
{
    if (o < 0 || o >= EZ2_OPT_COUNT)
        return 0;
    return g_options[o].random;
}

int ez2_order_option_parse(const char *s)
{
    int i, j;

    if (!s || !*s)
        return EZ2_OPT_NONE;
    for (i = 0; i < EZ2_OPT_COUNT; i++) {
        const char *a = g_options[i].name;
        for (j = 0;; j++) {
            int x = (unsigned char)a[j], y = (unsigned char)s[j];
            if (x >= 'a' && x <= 'z') x -= 32;
            if (y >= 'a' && y <= 'z') y -= 32;
            if (x == '_') x = '-';
            if (y == '_') y = '-';
            if (x != y)
                break;
            if (x == 0)
                return i;
        }
    }
    if (!strcmp(s, "none") || !strcmp(s, "NONE"))
        return EZ2_OPT_NONE;
    return -1;
}

/* Each mode's cycler, transcribed as a REWRITE TABLE: after `value + 1`, a
 * value listed here is replaced by its partner. `-1` ends a list. The address
 * is the mode's `mov eax, ds:0x37dcecc` site inside its effector key handler;
 * the handlers themselves are the arms of the jump table at 0x448e00.
 *
 * The wrap is written as an ordinary entry (11 -> 0) because that is what the
 * code does - there is no separate bound. Where a mode rewrites a RANGE the
 * entries are listed one by one, which is also how the original tests them. */
typedef struct { int from, to; } order_hop;

static const order_hop HOP_5KEY[]    = { {4,7},{5,7},{6,7},{8,0},{9,0},{10,0},{11,0},{-1,-1} };
static const order_hop HOP_RUBY[]    = { {4,5},{8,9},{11,0},{-1,-1} };
static const order_hop HOP_STREET[]  = { {4,5},{8,9},{11,0},{-1,-1} };
static const order_hop HOP_ALL[]     = { {11,0},{-1,-1} };            /* 7Street, Radio */
static const order_hop HOP_CLUB[]    = { {8,9},{10,0},{11,0},{-1,-1} };
static const order_hop HOP_SPACE[]   = { {4,5},{8,9},{10,0},{11,0},{-1,-1} };
static const order_hop HOP_5RADIO[]  = { {4,5},{8,9},{11,0},{-1,-1} };
static const order_hop HOP_14RADIO[] = { {4,5},{8,9},{10,0},{11,0},{-1,-1} };
static const order_hop HOP_CATCH[]   = { {3,7},{4,7},{5,7},{6,7},{8,0},{9,0},{10,0},{11,0},{-1,-1} };
static const order_hop HOP_SCRATCH[] = { {3,7},{4,7},{5,7},{6,7},{8,0},{9,0},{10,0},{11,0},{-1,-1} };
static const order_hop HOP_CV2[]     = { {2,0},{-1,-1} };             /* `cmp eax,2; jl keep` */

static const order_hop *mode_hops(ez2_mode m)
{
    switch (m) {
    case EZ2_MODE_5KEY:      return HOP_5KEY;      /* @0x440652 */
    case EZ2_MODE_RUBY:      return HOP_RUBY;      /* @0x43bfe5 */
    case EZ2_MODE_STREET:    return HOP_STREET;    /* @0x43ca41 */
    case EZ2_MODE_7STREET:   return HOP_ALL;       /* @0x442ecc */
    case EZ2_MODE_CLUB:      return HOP_CLUB;      /* @0x441072 */
    case EZ2_MODE_SPACE:     return HOP_SPACE;     /* @0x441acc */
    case EZ2_MODE_5RADIO:    return HOP_5RADIO;    /* @0x43e0b4 */
    case EZ2_MODE_RADIO:     return HOP_ALL;       /* @0x43d3e9 */
    case EZ2_MODE_10RADIO:   return HOP_CLUB;      /* @0x43ecba - same ring */
    case EZ2_MODE_14RADIO:   return HOP_14RADIO;   /* @0x43f77a */
    case EZ2_MODE_CATCH:     return HOP_CATCH;     /* @0x43a8f3 */
    case EZ2_MODE_SCRATCH:   return HOP_SCRATCH;   /* @0x43b490 */
    case EZ2_MODE_CV2:       return HOP_CV2;       /* @0x4424e7 */
    default:                 return HOP_ALL;       /* Andromeda is not in the
                                                    * table; give it the full
                                                    * ring rather than none */
    }
}

ez2_order_option ez2_order_option_next(ez2_mode mode, ez2_order_option opt)
{
    const order_hop *h = mode_hops(mode);
    int v = (int)opt + 1;
    int i;

    for (i = 0; h[i].from >= 0; i++)
        if (h[i].from == v)
            return (ez2_order_option)h[i].to;
    if (v < 0 || v >= EZ2_OPT_COUNT)
        return EZ2_OPT_NONE;
    return (ez2_order_option)v;
}

int ez2_order_option_available(ez2_mode mode, ez2_order_option opt)
{
    ez2_order_option v = EZ2_OPT_NONE;
    int i;

    if (opt == EZ2_OPT_NONE)
        return 1;
    /* Walk the ring from OFF. It is short - eleven at most - and walking it is
     * what makes this agree with the cycler by construction rather than by a
     * second table that could drift from it. */
    for (i = 0; i < EZ2_OPT_COUNT + 1; i++) {
        v = ez2_order_option_next(mode, v);
        if (v == opt)
            return 1;
        if (v == EZ2_OPT_NONE)
            break;
    }
    return 0;
}

/* Only FR departs from PLAIN, and only where its arm set the flag: @0x421c75
 * routes modes 4 and 8 to the HALF test and everything else to the INNER one,
 * while the SETTER @0x448b89 sets the HALF flag for 4, 5, 8 AND 9. Modes 5 and
 * 9 therefore fall to a flag their arm never sets and get PLAIN - read as-is
 * and not reconciled; see the roadmap. */
ez2_note_order ez2_order_option_strategy(ez2_order_option opt, ez2_mode mode)
{
    switch (opt) {
    case EZ2_OPT_FR:
        if (mode == EZ2_MODE_CLUB || mode == EZ2_MODE_10RADIO)
            return EZ2_ORDER_HALF;
        if (mode == EZ2_MODE_7STREET || mode == EZ2_MODE_RADIO)
            return EZ2_ORDER_INNER;
        return EZ2_ORDER_PLAIN;
    case EZ2_OPT_RANDOM:
    case EZ2_OPT_MRANDOM:
    case EZ2_OPT_SRANDOM:
    case EZ2_OPT_HRANDOM:
    case EZ2_OPT_PS:
        return EZ2_ORDER_PLAIN;
    default:
        return EZ2_ORDER_OFF;
    }
}

/* ------------------------------------------------------------- the mirrors */

/* The id sets, exactly as the transforms test them. Player 1's block and
 * player 2's are separate lists in the original and stay separate here; a
 * 10- or 14-key mode gives ONE player lanes from both, which is what makes
 * the "wide" variants below a single mirror across the pair rather than a
 * two-player special case. */
static const int KEY_IDS_L[]    = { 10, 11, 12, 13, 14, 6, 7 };
static const int KEY_IDS_R[]    = { 18, 19, 20, 21, 22, 8, 9 };
static const int MIRA_IDS_L[]   = { 10, 11, 12, 13, 14, 6, 7, 15, 17 };
static const int MIRA_IDS_R[]   = { 18, 19, 20, 21, 22, 8, 9, 23, 25 };
static const int SP_IDS[]       = { 15, 16, 17, 23, 24, 25 };
/* 0x4226f0's two lists - keys plus the turntable pair on each side. */
static const int WIDE_IDS_L[]   = { 10, 11, 12, 13, 14, 6, 7, 15, 16 };
static const int WIDE_IDS_R[]   = { 18, 19, 20, 21, 22, 8, 9, 23, 24 };

#define NELEMS(a) ((int)(sizeof (a) / sizeof (a)[0]))

static int id_in(const int *ids, int n, int id)
{
    int i;
    for (i = 0; i < n; i++)
        if (ids[i] == id)
            return 1;
    return 0;
}

/* Collect the TRACKS of the lanes whose control id is in `ids`, in lane order.
 * Returns the count. */
static int collect(const ez2_lane_map *L, const int *ids, int nids, int *out)
{
    int i, n = 0;

    for (i = 0; i < L->count; i++)
        if (id_in(ids, nids, L->control[i]))
            out[n++] = L->track[i];
    return n;
}

static int swap_whole(ez2_chart *c, int ta, int tb)
{
    if (ta == tb)
        return 0;
    ez2_note_order_swap(c, ta, tb, 0, ~0u);
    return 1;
}

static int mirror_within(ez2_chart *c, const int *list, int n)
{
    int i, swaps = 0;

    for (i = 0; i < n / 2; i++)
        swaps += swap_whole(c, list[i], list[n - 1 - i]);
    return swaps;
}

/* L[i] <-> R[nl-1-i], the "wide" row mirror. The original indexes R by nl and
 * never checks nr - it cannot go wrong there because a mode that reaches this
 * path has both sides populated and equal. A port must not read off the end,
 * so the pair is skipped when it would. */
static int mirror_across(ez2_chart *c, const int *L, int nl,
                         const int *R, int nr)
{
    int i, swaps = 0;

    for (i = 0; i < nl; i++) {
        int j = nl - 1 - i;
        if (j < 0 || j >= nr)
            continue;
        swaps += swap_whole(c, L[i], R[j]);
    }
    return swaps;
}

static int mirror_pairs(ez2_chart *c, const int *list, int n,
                        const int (*pairs)[2], int npairs)
{
    int i, swaps = 0;

    for (i = 0; i < npairs; i++) {
        int a = pairs[i][0], b = pairs[i][1];
        if (a >= n || b >= n)
            continue;
        swaps += swap_whole(c, list[a], list[b]);
    }
    return swaps;
}

int ez2_note_order_mirror_ids(ez2_chart *c, const ez2_lane_map *lanes,
                              const int *ids, int nids)
{
    int list[EZ2_MAX_LANES] = {0}, n;

    if (!c || !lanes || !ids)
        return 0;
    n = collect(lanes, ids, nids, list);
    return mirror_within(c, list, n);
}

int ez2_note_order_mirror_lanes(ez2_chart *c, const ez2_lane_map *lanes)
{
    int i, swaps = 0;

    if (!c || !lanes)
        return 0;
    for (i = 0; i < lanes->count / 2; i++)
        swaps += swap_whole(c, lanes->track[i],
                            lanes->track[lanes->count - 1 - i]);
    return swaps;
}

/* KEY, effect id 25 - @0x422410. */
static int mirror_key(ez2_chart *c, const ez2_lane_map *lanes, ez2_mode mode)
{
    /* @0x4225da: when the right-hand list is full (7), a fixed permutation
     * replaces the mirror. Unreachable on a 1P map; transcribed as read. */
    static const int R7[][2] = { {0,2}, {3,6}, {4,5} };
    int L[EZ2_MAX_LANES] = {0}, R[EZ2_MAX_LANES] = {0}, nl, nr, swaps;

    nl = collect(lanes, KEY_IDS_L, NELEMS(KEY_IDS_L), L);
    nr = collect(lanes, KEY_IDS_R, NELEMS(KEY_IDS_R), R);

    if (mode == EZ2_MODE_CLUB || mode == EZ2_MODE_SPACE ||
        mode == EZ2_MODE_10RADIO || mode == EZ2_MODE_14RADIO)
        return mirror_across(c, L, nl, R, nr);   /* one wide row */

    swaps = mirror_within(c, L, nl);
    if (nr >= 7)
        swaps += mirror_pairs(c, R, nr, R7, NELEMS(R7));
    else
        swaps += mirror_within(c, R, nr);
    return swaps;
}

/* MIRROR_A, effect id 31 - @0x4221b0. Keys plus scratch and pedal, each
 * side mirrored within itself, with no mode dependence at all. */
static int mirror_alt(ez2_chart *c, const ez2_lane_map *lanes)
{
    static const int R9[][2] = { {1,3}, {6,4}, {8,5}, {7,0} };
    int L[EZ2_MAX_LANES] = {0}, R[EZ2_MAX_LANES] = {0}, nl, nr, swaps;

    nl = collect(lanes, MIRA_IDS_L, NELEMS(MIRA_IDS_L), L);
    nr = collect(lanes, MIRA_IDS_R, NELEMS(MIRA_IDS_R), R);

    swaps = mirror_within(c, L, nl);
    if (nr >= 9)
        swaps += mirror_pairs(c, R, nr, R9, NELEMS(R9));
    else
        swaps += mirror_within(c, R, nr);
    return swaps;
}

/* MIRROR, effect id 22 - three shapes, picked by mode @0x423260. */
static int mirror_main(ez2_chart *c, const ez2_lane_map *lanes, ez2_mode mode)
{
    if (mode == EZ2_MODE_SPACE || mode == EZ2_MODE_14RADIO) {
        /* @0x4226f0: the whole row INCLUDING the turntables, mirrored across
         * the two id blocks. The original pushes a 2P turntable id twice -
         * its first test already accepts 23/24 and a second one accepts them
         * again - which lengthens the right list by one per turntable lane
         * and shifts the pairing. That is transcribed rather than tidied. */
        int L[EZ2_MAX_LANES] = {0}, R[2 * EZ2_MAX_LANES] = {0}, nl, nr, i;

        nl = collect(lanes, WIDE_IDS_L, NELEMS(WIDE_IDS_L), L);
        nr = 0;
        for (i = 0; i < lanes->count; i++) {
            int id = lanes->control[i];
            if (id_in(WIDE_IDS_R, NELEMS(WIDE_IDS_R), id))
                R[nr++] = lanes->track[i];
            if (id == 23 || id == 24)
                R[nr++] = lanes->track[i];
        }
        return mirror_across(c, L, nl, R, nr);
    }
    if (mode == EZ2_MODE_7STREET || mode == EZ2_MODE_RADIO)
        return mirror_key(c, lanes, mode) +
               ez2_note_order_mirror_ids(c, lanes, SP_IDS, NELEMS(SP_IDS));
    return ez2_note_order_mirror_lanes(c, lanes);
}

/* ------------------------------------------------------- the windowed randoms
 *
 * `SRANDOM`/`HRANDOM` @0x4219c0 and `PS` @0x421750 are the same function with
 * a different window: `ticks_per_measure / 4` (a beat) and `ticks_per_measure
 * * 8` (eight measures). Each window gets SIX pick-and-swap tries - the whole-
 * chart form's sixteen is its own constant - and the window's upper bound is
 * `min(start + step, end)`, INCLUSIVE, so a note landing exactly on a boundary
 * is inside both windows. Reproduced, not rounded off.
 *
 * TWO SEPARATE HOLD TESTS GUARD A SWAP, and an earlier version of this file
 * conflated them into one "stretch". Both are now reproduced from the
 * reconstructions in ../../src/maingameslots.cpp (PORT-DELTAS findings 13/14):
 *
 * 1. THE VETO. Each candidate lane's LAST type-1 record strictly before the
 *    slice start (`begin(h, start, 3, 1, ...)` -> EzChart::findBefore) is
 *    tested, and the pair is REFUSED when the slice start still falls inside
 *    that record's span. The rule differs in all THREE director families, and
 *    the deltas file says to keep them apart - a lane freed earlier changes
 *    which swaps are legal, which is observable in a replay:
 *
 *        EZ2DJ      (m421750/m4219c0)  w >= 6 && start >= s && start <= s+w+8
 *        ScratchMix (m45e770/m45e9f0)  w >= 6 && start >= s && start <= s+w
 *        Ez2Catch   (m46df00/m46e170)  w >  6 &&               start <  s+w
 *
 *    (s/w = the record's tick and RAW width - the port's note.length, biased
 *    by 6, so the comparisons transcribe directly. findBefore is strictly
 *    `tick < start`, which settles finding 14's open question: the record CAN
 *    precede the slice, so Catch's lower-bound-free test is live, not
 *    vacuous.)
 *
 * 2. THE STRETCH. Once a pair passes, m45e5a0/m46ce70 look for the FIRST hold
 *    (w > 6, all modes) STARTING inside [start, cur]; if either lane has one,
 *    the slice's end becomes that hold's last tick, `s + w - 1` - of the
 *    WIDER hold when both lanes have one - so the swap never cuts it in two.
 *    Three details the old stretch got wrong: a stop past `limit` REJECTS the
 *    swap rather than clamping; the mutated `cur` PERSISTS - later tries in
 *    the slice use it, and the next slice's end is `stop + step`; and the
 *    window can SHRINK, since `cur = stop` is unconditional. */
#define EZ2_ORDER_WINDOW_TRIES 6

/* Test 1: the per-mode veto. `track` is a chart track index. Public so the
 * three rules' boundary cells can be pinned by test_noteorder.c - the +8
 * slack is exactly one tick of legality, easy to lose in an edit. */
int ez2_order_hold_veto(const ez2_chart *c, int track, unsigned int start,
                        ez2_mode mode)
{
    const ez2_track *t;
    const ez2_note *rec = NULL;
    unsigned int s, w;
    int i;

    if (track < 0 || track >= c->track_count)
        return 0;
    t = &c->tracks[track];
    for (i = 0; i < t->note_count; i++) {
        if (t->notes[i].type != EZ2_NOTE_NOTE)
            continue;
        if (t->notes[i].tick >= start)
            break;
        rec = &t->notes[i];
    }
    if (!rec)
        return 0;
    s = rec->tick;
    w = rec->length;

    if (mode == EZ2_MODE_CATCH)
        return w > 6 && start < s + w;
    if (mode == EZ2_MODE_SCRATCH)
        return w >= 6 && start >= s && start <= s + w;
    return w >= 6 && start >= s && start <= s + w + 8;
}

/* Test 2: the first hold STARTING in [start, hi] (m45e5a0's walk: findFrom,
 * then forward while in range, first record wider than 6). Returns its raw
 * width and writes its last tick to *stop; 0 if the lane has none. */
static unsigned int hold_in_window(const ez2_chart *c, int track,
                                   unsigned int start, unsigned int hi,
                                   unsigned int *stop)
{
    const ez2_track *t;
    int i;

    if (track < 0 || track >= c->track_count)
        return 0;
    t = &c->tracks[track];
    for (i = 0; i < t->note_count; i++) {
        if (t->notes[i].type != EZ2_NOTE_NOTE)
            continue;
        if (t->notes[i].tick < start)
            continue;
        if (t->notes[i].tick > hi)
            break;
        if (t->notes[i].length > 6) {
            *stop = t->notes[i].tick + t->notes[i].length - 1;
            return t->notes[i].length;
        }
    }
    return 0;
}

/* The ScratchMix/Catch tail (m45e4e0 @0x45e4e0 / m46cdc0 @0x46cdc0): after
 * the slicing loop, every hold in the window wider than 0x1e is SHORTENED by
 * 0x12. The EZ2DJ pair has no such call - a mode difference the deltas file
 * says to keep. Runs unconditionally once the shuffle ran, over the ORIGINAL
 * un-advanced window. */
static void trim_wide_holds(ez2_chart *c, const ez2_lane_map *lanes,
                            unsigned int start, unsigned int limit)
{
    int li, i;

    for (li = 0; li < lanes->count; li++) {
        int track = lanes->track[li];
        ez2_track *t;

        if (track < 0 || track >= c->track_count)
            continue;
        t = &c->tracks[track];
        for (i = 0; i < t->note_count; i++) {
            if (t->notes[i].type != EZ2_NOTE_NOTE)
                continue;
            if (t->notes[i].tick < start)
                continue;
            if (t->notes[i].tick > limit)
                break;
            if (t->notes[i].length >= 0x1e)
                t->notes[i].length = (unsigned short)(t->notes[i].length - 0x12);
        }
    }
}

/* pickTwoLanes gives up after 0x20 draws (@0x421719) and writes its `lo` to
 * both outputs, which the caller then discards because the two tracks match. */
#define EZ2_ORDER_PICK_TRIES 32

static int apply_windowed(ez2_chart *c, const ez2_lane_map *lanes,
                          ez2_note_order strat, ez2_rng *rng,
                          unsigned int step, ez2_mode mode)
{
    unsigned int start, cur, limit;
    int swaps = 0;

    if (step == 0)
        step = 1;
    limit = c->total_ticks;

    /* The slice end is a RUNNING cursor, not min(start+step, limit) per
     * slice: a stretch (or shrink) to a hold's last tick carries into the
     * next slice's end as `stop + step`. Reproduced from m421750's tail
     * (`cur += step` from wherever the tries left it). */
    cur = (step < limit) ? step : limit;

    for (start = 0; start < limit;
         start += step, cur += step, cur = (cur > limit) ? limit : cur) {
        int try_;

        for (try_ = 0; try_ < EZ2_ORDER_WINDOW_TRIES; try_++) {
            int a, b, ta, tb;
            unsigned int wa, wb, sa, sb, stop;

            /* No previous-lane memory here: that test lives in the whole-chart
             * form @0x421d0b and pickTwoLanes has none. */
            if (!ez2_note_order_pick(lanes, strat, rng, NULL,
                                     EZ2_ORDER_PICK_TRIES, &a, &b))
                continue;
            ta = lanes->track[a];
            tb = lanes->track[b];
            if (ta == tb)
                continue;

            /* Test 1: either lane still inside a hold at the slice start. */
            if (ez2_order_hold_veto(c, ta, start, mode) ||
                ez2_order_hold_veto(c, tb, start, mode))
                continue;

            /* Test 2: a hold starting inside the slice pins the slice's end
             * to its last tick - the WIDER lane's when both have one - and a
             * stop past the limit rejects the swap outright. */
            wa = hold_in_window(c, ta, start, cur, &sa);
            wb = hold_in_window(c, tb, start, cur, &sb);
            if (wa || wb) {
                stop = wa ? sa : sb;
                if (wb && wb > wa)
                    stop = sb;
                if (stop > limit)
                    continue;
                cur = stop;
            }

            ez2_note_order_swap(c, ta, tb, start, cur);
            swaps++;
        }
    }

    /* The ScratchMix/Catch directors' tail call; EZ2DJ has none. */
    if (mode == EZ2_MODE_SCRATCH || mode == EZ2_MODE_CATCH)
        trim_wide_holds(c, lanes, 0, limit);

    return swaps;
}

int ez2_note_order_apply_option(ez2_chart *c, const ez2_lane_map *lanes,
                                ez2_order_option opt, ez2_mode mode,
                                ez2_rng *rng)
{
    ez2_note_order strat;

    if (!c || !lanes || opt < 0 || opt >= EZ2_OPT_COUNT)
        return -1;
    if (opt == EZ2_OPT_NONE)
        return 0;

    switch (opt) {
    case EZ2_OPT_MIRROR:   return mirror_main(c, lanes, mode);
    case EZ2_OPT_MIRROR_A: return mirror_alt(c, lanes);
    case EZ2_OPT_KEY:      return mirror_key(c, lanes, mode);
    case EZ2_OPT_SP:       return ez2_note_order_mirror_ids(c, lanes, SP_IDS,
                                                            NELEMS(SP_IDS));
    default:               break;
    }

    if (!rng)
        return -1;
    strat = ez2_order_option_strategy(opt, mode);

    /* THE VETO IS THE ONLY THING THAT SEPARATES THREE OF THESE PAIRS. Each
     * transform takes a flag that pickTwoLanes tests before consulting
     * @0x421490, and the dispatcher passes 1 for RANDOM/FR (`id == 3`
     * @0x4234a3), SRANDOM (id 4) and PS (id 29), and 0 for MRANDOM (id 5) and
     * HRANDOM (id 23). Dropping the veto here is done by blanking the control
     * ids, which is the same thing one level up: with no id, no lane is
     * barred, so scratch and pedal join the shuffle. */
    ez2_lane_map open;
    const ez2_lane_map *use = lanes;

    if (opt == EZ2_OPT_MRANDOM || opt == EZ2_OPT_HRANDOM) {
        int i;
        open = *lanes;
        for (i = 0; i < open.count; i++)
            open.control[i] = -1;
        use = &open;
    }

    switch (opt) {
    case EZ2_OPT_SRANDOM:
    case EZ2_OPT_HRANDOM:
        return apply_windowed(c, use, strat, rng,
                              c->ticks_per_measure / 4, mode);
    case EZ2_OPT_PS:
        return apply_windowed(c, use, strat, rng,
                              c->ticks_per_measure * 8, mode);
    default: {
        /* RANDOM, FR and MRANDOM: sixteen swaps over the WHOLE chart. */
        ez2_order_state st = EZ2_ORDER_STATE_INIT;
        return ez2_note_order_apply(c, use, strat, rng, &st, 0, ~0u);
    }
    }
}

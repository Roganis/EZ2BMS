/* See playeropts.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "playeropts.h"

#include "noteorder.h"

void ez2_player_opts_defaults(ez2_player_opts *o)
{
    if (!o)
        return;
    /* Every one of these is what PlayOpts held before this struct existed.
     * They are not chosen here; they are transcribed, so that a player who
     * touches nothing gets the run the port has always given. */
    o->speed_index    = -1;          /* the mode's default */
    o->speed_pct      = -1;          /* the mode's default */
    o->order          = EZ2_OPT_NONE;
    o->order_seed     = 0;
    o->order_seed_set = 0;
    o->note_style     = 0;           /* the default NoteAniTexture */
    o->black          = 0;
}

void ez2_player_opts_unset(ez2_player_opts *o)
{
    if (!o)
        return;
    /* -1 in every field, `order` included. See the header: EZ2_OPT_NONE is
     * zero and is a CHOICE, so it cannot double as "did not choose". */
    o->speed_index    = -1;
    o->speed_pct      = -1;
    o->order          = -1;
    o->order_seed     = 0;
    o->order_seed_set = -1;
    o->note_style     = -1;
    o->black          = -1;
}

void ez2_player_opts_resolve(ez2_player_opts *o, const ez2_player_opts *from)
{
    if (!o || !from)
        return;

    /* THE TWO SPEEDS TRAVEL TOGETHER. They are one dial read two ways - the
     * index is CV2Mix's step and the percent is every other mode's - so a
     * player who set either has set the dial, and inheriting the other half
     * from 1P would leave 2P holding two contradictory answers for the mode
     * that reads the one they did not set. */
    if (o->speed_index < 0 && o->speed_pct < 0) {
        o->speed_index = from->speed_index;
        o->speed_pct   = from->speed_pct;
    }

    if (o->order < 0) {
        o->order          = from->order;
        o->order_seed     = from->order_seed;
        o->order_seed_set = from->order_seed_set > 0;
    } else if (o->order_seed_set < 0) {
        /* THEIR OWN ARRANGEMENT, SO NOT 1P'S SEED. Two players on RANDOM
         * from one seed shuffle identically, which is not what either of
         * them asked for by picking it separately. */
        o->order_seed_set = 0;
        o->order_seed     = 0;
    }

    if (o->note_style < 0)
        o->note_style = from->note_style;
    if (o->black < 0)
        o->black = from->black;
}

int ez2_player_opts_equal(const ez2_player_opts *a, const ez2_player_opts *b)
{
    if (a == b)
        return 1;
    if (!a || !b)
        return 0;

    /* Field by field rather than memcmp: a struct compared by its bytes is a
     * comparison that goes wrong the day someone adds a member and the
     * padding between them stops being zero. This has to be RIGHT, because
     * saying "equal" wrongly means one player silently plays on the other's
     * settings. */
    if (a->speed_index != b->speed_index) return 0;
    if (a->speed_pct   != b->speed_pct)   return 0;
    if (a->order       != b->order)       return 0;
    if (a->note_style  != b->note_style)  return 0;
    if (a->black       != b->black)       return 0;

    /* THE SEED ONLY MATTERS WHEN AN ORDER ACTUALLY SHUFFLES. With the option
     * off, one side having a seed and the other not is a difference that
     * changes nothing - and treating it as one would load a second skin and
     * split the scroll for no reason on the commonest two-player run there
     * is. */
    if (a->order != EZ2_OPT_NONE) {
        if (a->order_seed_set != b->order_seed_set) return 0;
        if (a->order_seed_set && a->order_seed != b->order_seed) return 0;
    }
    return 1;
}

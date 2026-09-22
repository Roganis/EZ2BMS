/* What ONE player chose - the options that are theirs, not the machine's.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * ---- why this exists -----------------------------------------------------
 *
 * The play loop already has a per-player axis: `lane_player[lane]` says which
 * side owns a lane, and scoring has used it since duo existed - a hit goes to
 * `sc` or `sc2` by it. What has never been on that axis is the OPTIONS. The
 * note speed, the arrangement, the skin and the black panel were one each,
 * held in `PlayOpts` and in two file-scope globals (`g_scroll`, `g_skin`), so
 * a two-player credit ran both sides at whatever one of them picked.
 *
 * That is wrong on a cabinet in an obvious way - two people do not want the
 * same note speed - and it is the reason the card reader's own design has an
 * open question about it (`../cardreader/`, INTEGRATION-QUESTIONS #2: "if
 * these genuinely are scalars, two-card battle login cannot restore both
 * players' options"). Rather than answer that question about the ORIGINAL,
 * the port gives each player their own set.
 *
 * ---- this is an EXTENSION, and the fidelity rule that keeps it honest ----
 *
 * The original has one of each of these. The port is a reconstruction, so a
 * divergence needs a rule that makes it provably safe, and it is this:
 *
 *     WHEN BOTH PLAYERS' OPTIONS ARE EQUAL, THE PORT MUST BEHAVE EXACTLY AS
 *     IT DID WHEN THERE WAS ONLY ONE SET.
 *
 * `ez2_player_opts_equal` is what the play loop asks. When it says yes, one
 * skin is loaded and one scroll is computed, and every code path is the one
 * that ran before - so one-player runs and matched-options duo runs are
 * unchanged, and `play_autoplay`'s AUTOPLAY PERFECT still proves it. The
 * second skin and the second scroll exist only when the two sides actually
 * differ, which is also where the extra texture memory gets spent.
 *
 * ---- what is here, and what is deliberately not -------------------------
 *
 * Here: everything a player picks that changes what THEY see or how their
 * notes arrive. Not here: anything about the machine or the session - the
 * screen mode, the audio backend, the mode, the song, the tier. Those are one
 * per cabinet or one per credit, and putting them here would say they are
 * negotiable per side when they are not.
 *
 * ---- and they deliberately do NOT persist ---------------------------------
 *
 * None of this is written to `settings.ini`, and that is the faithful
 * behaviour rather than an omission: on the cabinet a player's options last
 * exactly one credit, and the next person to sit down starts from the mode's
 * defaults. Saving them would make one player's speed the machine's speed.
 *
 * The mechanism that DOES carry a set between visits is the CARD - it is the
 * whole point of one - and that is where restoring these belongs, per card
 * rather than per cabinet (`../cardreader/`). This struct is the shape such a
 * restore would write into, which is the other reason it exists.
 */
#ifndef EZ2_PLAYEROPTS_H
#define EZ2_PLAYEROPTS_H

#ifdef __cplusplus
extern "C" {
#endif

/* The two sides. `EZ2_PLAYERS` is the array bound everywhere; the game is a
 * two-player cabinet and always was. */
#define EZ2_PLAYERS 2

typedef struct ez2_player_opts {
    /* THE DIAL. `speed_index` is CV2Mix's own 0..20 step (ez2/speed.h);
     * `speed_pct` is the percentage every other mode uses. -1 in both means
     * "the mode's default", which is what a player who never touched it
     * gets. They are kept separate rather than resolved here because which
     * one applies is a property of the MODE, and this struct does not know
     * the mode. */
    int      speed_index;
    int      speed_pct;

    /* THE ARRANGEMENT, and the seed its shuffle draws from. A session plays
     * several charts and the option is the player's, not the chart's, so it
     * travels here. `order_seed_set` distinguishes "seed 0" from "no seed
     * given", which decides whether a run is repeatable. */
    int      order;
    unsigned order_seed;
    int      order_seed_set;

    /* WHAT THEIR LANE LOOKS LIKE. `note_style` is the NoteAniTexture index
     * (0 = the default); `black` selects the `_Black_` panel spelling. Both
     * feed ez2_skin_load_ex, which is why two players wanting different ones
     * costs a second skin. */
    int      note_style;
    /* g_37dcee8, 0..3 - the auto-assist counter (auto scratch / pedal /
     * both), stepped on FX3 in RubyMix and on FX4 in 7StreetMix, StreetMix,
     * ClubMix and SpaceMix (docs/PORT-DELTAS.md, song-select behaviour 2).
     * update2 @0x446540:1323-1367 publishes it as g_1b2f050 / g_1b2ef80 /
     * g_1b2efbc and g_1b5f178, which gate the name entry (RankingDirector
     * ctor:269), the PLACE plate (m450690) and Result_Eff's cell 3. */
    int      auto_assist;
    int      black;
} ez2_player_opts;

/* What a player who has chosen nothing gets - and it must be exactly what the
 * port did before any of this existed. */
void ez2_player_opts_defaults(ez2_player_opts *o);

/* NOTHING CHOSEN AT ALL, which is NOT the same as the defaults above.
 *
 * The defaults are player one's: a full, valid set - no arrangement, the
 * ordinary panel, the mode's own speed - which is what somebody who never
 * touches a thing plays on. Player two's starting point has to say something
 * weaker: "this side has not chosen, so it FOLLOWS the other one". A field
 * left at the default is indistinguishable from a field the player set to the
 * default, and the difference matters: 2P sitting down and picking MIRROR must
 * not be read as 2P choosing nothing, and 2P choosing nothing must not read as
 * 2P demanding EZ2_OPT_NONE while 1P plays RANDOM.
 *
 * So every field here is the sentinel -1, including `order` (EZ2_OPT_NONE is
 * zero and is a real choice) and `order_seed_set`. A set in this state is not
 * playable; `ez2_player_opts_resolve` is what makes it one. */
void ez2_player_opts_unset(ez2_player_opts *o);

/* Fill in everything this player never chose from `from`, and leave what they
 * did choose alone. Idempotent, and a no-op on a set with nothing unset.
 *
 * THIS IS WHAT MAKES THE EQUALITY RULE MEAN ANYTHING. `ez2_player_opts_equal`
 * compares fields, so an unresolved 2P - all sentinels - differs from a 1P who
 * picked a speed, and the play loop would split the field for two people
 * playing identically. Resolve first, compare second: a 2P who opened no panel
 * comes out byte-identical to 1P, `equal` says so, and the single-skin path
 * that predates per-player options is the one that runs.
 *
 * The seed travels with the arrangement rather than on its own - inheriting
 * 1P's seed onto a 2P who picked their OWN arrangement would make one player's
 * shuffle silently repeat the other's. */
void ez2_player_opts_resolve(ez2_player_opts *o, const ez2_player_opts *from);

/* Are these two sets the same in every way that would make the field differ?
 *
 * THE PLAY LOOP BRANCHES ON THIS, so it is the whole fidelity guarantee: yes
 * means one skin, one scroll, and the code path that predates per-player
 * options. It compares every field that reaches the field or the arithmetic,
 * INCLUDING the seed - two sides shuffled from different seeds see different
 * charts and cannot share anything. */
int ez2_player_opts_equal(const ez2_player_opts *a, const ez2_player_opts *b);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_PLAYEROPTS_H */

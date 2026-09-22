/* `.gds` - the per-mode descriptor, and the authority on LANE ORDER.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * LANE ORDER IS DATA, NOT CODE - see ../../docs/gds-slots.md. Each mode ships
 * a plain-text (unencrypted) `.gds` under `system/<mode>/`, and its `[SlotN]`
 * section lists that player's lanes IN ORDER:
 *
 *     [Slot1]
 *     NumberOfTrack=7
 *     Track1 =
 *     {
 *         Key=15,16
 *         SongTrack=10
 *     }
 *     ...
 *
 * `loadSlotSection` @0x420f60 reads those entries SEQUENTIALLY into the
 * per-player TrackList at `director + 0x380 + player*0x1c4`, where the array
 * index IS the lane. The `N` in `TrackN` is consumed as a token and never used
 * as an index, so **file order is lane order** - a file whose labels ran
 * 1,3,2 would still be read 1,3,2.
 *
 * WHY THIS IS PARSED AND NOT TABULATED. `ez2/mode.c` derives lane SETS
 * empirically from the chart library and gets them right, but it sorts them
 * ascending - which puts the scratch in the middle of the row on every mode
 * instead of at lane 0. The right fix is not a corrected table: the file ships
 * with the game the user already supplies, so reading it is both correct by
 * construction and keeps the bring-your-own-exe rule intact
 * (../../docs/DISTRIBUTION.md). A hardcoded order would be a copy of the
 * game's data AND a thing to keep in sync.
 *
 * This parser is deliberately tolerant where the game's tokenizer is strict:
 * it does not reject a file the game would, because a port that refuses to
 * start on a slightly odd descriptor is worse than one that plays it.
 *
 * AND IT MATCHES KEYS BY NAME, WHICH THE GAME DOES NOT. Not one of
 * `NumberOfSlot`, `NumberOfTrack`, `SongTrack`, `Key`, `MaxBaseStage` appears
 * anywhere in the binary - searched in both cases and as UTF-16 - so the
 * original's tokenizer reads this file positionally and never compares a key
 * string. Name matching is a port convention. It describes the shipped files
 * correctly and is more robust to reordering than position is, but nothing
 * here should be read as a reconstruction of how the game parses.
 */
#ifndef EZ2_GDS_H
#define EZ2_GDS_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define EZ2_GDS_MAX_TRACKS 27   /* what TrackList::items holds */
#define EZ2_GDS_MAX_SLOTS  4    /* two players ship; the field is a count */

/* One lane. Its index in ez2_gds_slot::lanes is the lane number. */
typedef struct ez2_gds_lane {
    int key;      /* input channel, or -1 - TrackEntry.key  */
    int key2;     /* a second channel for the same lane, or -1 - TrackEntry.f4.
                   * Two keys means the turntable: up and down on one lane. */
    int track;    /* the chart track this lane plays - TrackEntry.handle */
} ez2_gds_lane;

typedef struct ez2_gds_slot {
    int          declared;                    /* NumberOfTrack, as written */
    int          count;                       /* how many entries were read */
    ez2_gds_lane lanes[EZ2_GDS_MAX_TRACKS];
} ez2_gds_slot;

typedef struct ez2_gds {
    int          slot_count;                  /* [General] NumberOfSlot */
    int          slots_seen;                  /* how many [SlotN] parsed */

    /* [General] again - HOW MANY STAGES A SESSION PLAYS. The four Radio modes
     * say 4; every other descriptor in the shipped tree says 3, and that
     * matches the bounds the original's runners hardcode (`cmp esi,4` in the
     * four Radio runners, `cmp 3` in runClubMix). 0 when the file is silent.
     *
     * NOTE the whole parser matches keys BY NAME and the game does not - none
     * of these key strings exist in the binary. Reading them is a port
     * convention that happens to describe the shipped files correctly, not a
     * reconstruction of the game's tokenizer. See the header comment. */
    int          max_base_stage;              /* MaxBaseStage */
    int          max_bonus_stage;             /* MaxBonusStage - 0 everywhere */
    int          use_chain_play;              /* UseChainPlay - 0 everywhere */

    ez2_gds_slot slots[EZ2_GDS_MAX_SLOTS];
} ez2_gds;

/* Parse `.gds` text. Returns 0 on success. The text is NOT encrypted - pass
 * the file's bytes straight in. */
int ez2_gds_parse(const char *text, size_t n, ez2_gds *out);

/* Find and parse a mode's descriptor under an asset root.
 *
 * The game builds the path itself in `EZ2AC::loadModeGds` @0x4150d0 - matched,
 * ../../src/moderunner.cpp - as
 *
 *     sprintf(name, "System\\%s\\%s.gds", modeName, modeName)
 *
 * i.e. the directory and the file share the mode's name. On the shipped data
 * the two do NOT share a spelling (`system/streetmix/STREETMix.gds`), which
 * Windows does not care about and a case-sensitive filesystem does - so this
 * matches the directory case-insensitively and then takes the one `.gds`
 * inside it rather than trusting the file's casing. Modes that live under
 * `system/CV2Mix/` are found there too.
 *
 * Returns 0 on success, EZ2_GDS_ERR_NOT_FOUND if no descriptor is there.
 * Callers should fall back to ez2_mode_lanes() rather than refusing to run:
 * an unknown lane ORDER is worse than the old behaviour, not fatal. */
int ez2_gds_load_for_mode(const char *root, const char *mode_name,
                          ez2_gds *out);

/* The player-1 input channels, read off the shipped descriptors - the numbers
 * in `Key=`. Feed one to ez2_gds_lane_for_key() to get its lane.
 *
 * Player 2's block is the same shape shifted: keys 18..22 and scratch 23,24. */
#define EZ2_GDS_KEY_1        10
#define EZ2_GDS_KEY_2        11
#define EZ2_GDS_KEY_3        12
#define EZ2_GDS_KEY_4        13
#define EZ2_GDS_KEY_5        14
#define EZ2_GDS_KEY_6         6      /* the 6th/7th keys sit BELOW the others */
#define EZ2_GDS_KEY_7         7
#define EZ2_GDS_SCRATCH_UP   15
#define EZ2_GDS_SCRATCH_DOWN 16
#define EZ2_GDS_PEDAL        17

/* The lane->track list for one player, in lane order, written into `tracks`.
 * Returns the number of lanes, or 0 if that slot does not exist. This is the
 * `.gds`-backed replacement for ez2_mode_lanes(). */
int ez2_gds_lanes(const ez2_gds *g, int player, int *tracks, int max);

/* Which lane a given input channel drives, or -1. Both key columns are
 * searched, so a scratch channel resolves to its shared lane. */
int ez2_gds_lane_for_key(const ez2_gds *g, int player, int key);

enum ez2_gds_err {
    EZ2_GDS_OK      =  0,
    EZ2_GDS_ERR_ARG = -1,
    EZ2_GDS_ERR_NO_SLOT = -2,  /* parsed, but no [SlotN] section was found */
    EZ2_GDS_ERR_NOT_FOUND = -3 /* no descriptor for that mode under the root */
};

#ifdef __cplusplus
}
#endif

#endif /* EZ2_GDS_H */

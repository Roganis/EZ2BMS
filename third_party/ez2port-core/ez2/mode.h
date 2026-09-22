/* EZ2AC modes, the fixed 64-track chart layout, and which tracks a mode plays.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * A `.ez` always has 64 tracks in a fixed ROLE layout, and a mode plays a
 * subset of them as its lanes. Everything else is auto-played backing audio.
 * Getting the subset wrong does not crash anything - the notes just become
 * backing audio and the chart quietly loses lanes - so the sets here are
 * verified against every chart in the library rather than trusted. See
 * tools/ez2lanes and ../../docs/PORTING.md section 14.
 *
 * Sources:
 *   the mode roster    a 0x20-stride name table at 0x487278, scanned by
 *                      @0x414e50, which stores the matched index at
 *                      0x1b2e548. That index is the authoritative ordering -
 *                      per-mode switches all over the binary use it. Read out
 *                      of the binary and confirmed: 13 entries, 0..12.
 *   the track roles    ../../../EZ2REWRITE/reverse-engineering/modes-and-lanes.md
 *   the lane sets      the same, then re-verified here across 12,361 charts.
 */
#ifndef EZ2_MODE_H
#define EZ2_MODE_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* The roster, in the table's own order. */
typedef enum ez2_mode {
    EZ2_MODE_5KEY       = 0,   /* "5KeyMix"    - 5 keys, nothing else */
    EZ2_MODE_RUBY       = 1,   /* "RubyMix"    - Street's layout, its own mode */
    EZ2_MODE_STREET     = 2,   /* "StreetMix"  - 5-key standard */
    EZ2_MODE_7STREET    = 3,   /* "7StreetMix" */
    EZ2_MODE_CLUB       = 4,   /* "ClubMix"    - 10 key */
    EZ2_MODE_SPACE      = 5,   /* "SpaceMix"   - 14 key */
    EZ2_MODE_5RADIO     = 6,   /* "5RadioMix"  */
    EZ2_MODE_RADIO      = 7,   /* "RadioMix"   - the classic, and it is 7-KEY */
    EZ2_MODE_10RADIO    = 8,   /* "10RadioMix" */
    EZ2_MODE_14RADIO    = 9,   /* "14RadioMix" */
    EZ2_MODE_CATCH      = 10,  /* "EZ2CATCH"   - filenames say "catch" */
    EZ2_MODE_SCRATCH    = 11,  /* "ScratchMix" */
    EZ2_MODE_CV2        = 12,  /* "CV2Mix"     - its own playfield */
    EZ2_MODE_ANDROMEDA  = 13,  /* NOT in the table; a handful of charts */
    EZ2_MODE_COUNT      = 14,
    EZ2_MODE_UNKNOWN    = -1
} ez2_mode;

/* Difficulty tier, from the filename suffix. Radio modes use the suffix for a
 * STAGE number instead (-r1, -rd2, ...), so a radio chart has no tier. */
typedef enum ez2_tier {
    EZ2_TIER_NM = 0,   /* no suffix */
    EZ2_TIER_HD,       /* -hd  */
    EZ2_TIER_SHD,      /* -shd */
    EZ2_TIER_EX,       /* -ex  */
    EZ2_TIER_NONE      /* a radio stage, or something unrecognised */
} ez2_tier;

/* What a chart's filename says. The game builds these with "%s%dp-%s.ez", so
 * the mode name is everything before the "<digit>p-", which is what this
 * splits on. */
typedef struct ez2_chart_id {
    ez2_mode mode;
    int      players;          /* the digit before the 'p' */
    ez2_tier tier;
    char     mode_name[32];    /* as spelled in the filename */
    char     song[128];        /* the token between "Np-" and the extension */
    char     stem[128];        /* `song` with a recognised TIER suffix removed */
    char     suffix[32];       /* the trailing "-..." segment, if any */
} ez2_chart_id;

/* Parse a chart path or bare filename. Returns 0 if it does not look like one;
 * `out` is filled as far as it got either way. */
int ez2_chart_id_parse(const char *path, ez2_chart_id *out);

const char *ez2_mode_name(ez2_mode m);

/* HOW MANY PLAY-FIELD STYLES a mode offers - the count the song select's
 * ctor @0x435390 puts in f_c09e0, which is what its style stepper clamps
 * against and how many STYLE_<mode><n>.pvi files the tree ships. The pedal
 * cycles the style while the option panel is up (update2 @0x446540 bumps
 * g_37dcf1c and sounds SkinChange), and the chosen one lands in g_1b2e7c8
 * for the panel loader. Styles are 0-based here and 1-based in the
 * filename, as the game has them. 0 for a mode with no styles. */
int ez2_mode_style_count(ez2_mode m);

/* The mode a name refers to, matched ignoring case, or EZ2_MODE_UNKNOWN.
 * Accepts BOTH spellings a mode goes by: the table's (`EZ2CATCH`) and the
 * filename's (`catch`), which are not the same word for that one mode. */
ez2_mode    ez2_mode_from_name(const char *name);

/* The spelling a mode's CHART FILES use, which is not always the one its song
 * table uses: EZ2CATCH's charts are `catch1p-...`. Everything that builds a
 * chart filename wants this; everything that names the mode to a person wants
 * ez2_mode_name.
 *
 * There are in fact THREE spellings in play for that one mode - `EZ2CATCH` in
 * the table, `catch` in filenames, and `ez2catch` for its system directory -
 * and each is used somewhere the others are not. The directory is resolved by
 * ez2_gds_load_for_mode retrying the canonical name; this covers the files. */
const char *ez2_mode_file_name(ez2_mode m);

/* CV2MIX IS NOT A MODE, IT IS A CONTAINER OF TEN, and a CV2 song says which
 * one it plays in through its song-table `kind` byte - not through the variant
 * tag in its name. The byte indexes a ten-entry table at 0x48f520, which
 * @0x424372 reads as `submode[g_1b2ebc8 << 5]` after the selection at
 * @0x439444 lifts it out of the chosen song's record (+0x264).
 *
 * The tags correlate but do NOT decide: `5o` and `5s` charts both occur with
 * kind 7 (StreetMix1st), so a mapping built from the names gets those wrong.
 *
 * Returns null outside 0..9. The name is the one `ez2_gds_load_for_mode` wants
 * - it finds these under `system/CV2Mix/`. */
const char *ez2_cv2_submode(int kind);
#define EZ2_CV2_SUBMODES 10
const char *ez2_tier_name(ez2_tier t);

/* ---- the fixed 64-track layout ------------------------------------------ */

typedef enum ez2_track_role {
    EZ2_TRACK_CONTROL = 0,  /* track 0: tempo and measure events */
    EZ2_TRACK_BACKING,      /* auto-played keysounds */
    EZ2_TRACK_KEY_1P,       /* tracks 3-7   */
    EZ2_TRACK_EFFECTOR_1P,  /* tracks 8-9   (EF1, EF2) */
    EZ2_TRACK_SCRATCH_1P,   /* track 10     */
    EZ2_TRACK_PEDAL_1P,     /* track 11     */
    EZ2_TRACK_EFFECTOR_2P,  /* tracks 12-13 (EF3, EF4) */
    EZ2_TRACK_KEY_2P,       /* tracks 14-18 */
    EZ2_TRACK_SCRATCH_2P,   /* track 19     */
    EZ2_TRACK_PEDAL_2P,     /* track 20     */
    EZ2_TRACK_LIGHTS        /* track 21: cabinet lighting */
} ez2_track_role;

ez2_track_role ez2_track_role_of(int track);
const char    *ez2_track_role_name(int track);

/* ---- lanes -------------------------------------------------------------- */

#define EZ2_MAX_LANES 18

/* The tracks a mode plays, in lane order. Writes at most EZ2_MAX_LANES entries
 * and returns how many. Returns 0 for a mode with no lane set.
 *
 * THE SET IS VERIFIED; THE ORDER IS NOT. Which track sits in which visual
 * column comes from KEZPlayer's note spawn, which is not reconstructed. The
 * order below is the sensible one (left to right, 1P before 2P) and is good
 * enough to play a chart, but do not treat a lane INDEX as authoritative
 * until that function is decoded. */
int ez2_mode_lanes(ez2_mode m, int *tracks, int max);

/* Is `track` a lane in this mode? */
int ez2_mode_uses_track(ez2_mode m, int track);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_MODE_H */

/* EZ2AC modes, track roles and lane sets.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "mode.h"
#include "util.h"

#include <string.h>

/* Spelled as the 0x487278 table spells them; matched case-insensitively
 * because the filenames are lower-case. "catch" is the filename form of
 * EZ2CATCH - the game special-cases it, and so does this. */
static const struct { const char *name; ez2_mode mode; } kModeNames[] = {
    { "5KeyMix",     EZ2_MODE_5KEY },
    { "RubyMix",     EZ2_MODE_RUBY },
    { "StreetMix",   EZ2_MODE_STREET },
    { "7StreetMix",  EZ2_MODE_7STREET },
    { "ClubMix",     EZ2_MODE_CLUB },
    { "SpaceMix",    EZ2_MODE_SPACE },
    { "5RadioMix",   EZ2_MODE_5RADIO },
    { "RadioMix",    EZ2_MODE_RADIO },
    { "10RadioMix",  EZ2_MODE_10RADIO },
    { "14RadioMix",  EZ2_MODE_14RADIO },
    { "EZ2CATCH",    EZ2_MODE_CATCH },
    { "catch",       EZ2_MODE_CATCH },
    { "ScratchMix",  EZ2_MODE_SCRATCH },
    { "CV2Mix",      EZ2_MODE_CV2 },
    { "AndromedaMix",EZ2_MODE_ANDROMEDA }
};
#define MODE_NAME_COUNT ((int)(sizeof kModeNames / sizeof kModeNames[0]))

/* f_c09e0, straight off the ctor's switch @0x435390. The pairs are the
   original's own fall-through: a keys mode and its radio twin share a
   count. */
int ez2_mode_style_count(ez2_mode m)
{
    switch (m) {
    case EZ2_MODE_5KEY:                          return 0x15;  /* 21 */
    case EZ2_MODE_RUBY:                          return 0x0c;  /* 12 */
    case EZ2_MODE_STREET:   case EZ2_MODE_5RADIO:  return 0x16;  /* 22 */
    case EZ2_MODE_7STREET:  case EZ2_MODE_RADIO:   return 0x12;  /* 18 */
    case EZ2_MODE_CLUB:     case EZ2_MODE_10RADIO: return 0x0f;  /* 15 */
    case EZ2_MODE_SPACE:    case EZ2_MODE_14RADIO: return 0x0e;  /* 14 */
    case EZ2_MODE_CATCH:                         return 0x0a;  /* 10 */
    case EZ2_MODE_SCRATCH:                       return 0x09;  /*  9 */
    case EZ2_MODE_CV2:                           return 0x02;  /*  2 */
    default:                                     return 0;
    }
}

const char *ez2_mode_name(ez2_mode m)
{
    switch (m) {
    case EZ2_MODE_5KEY:      return "5KeyMix";
    case EZ2_MODE_RUBY:      return "RubyMix";
    case EZ2_MODE_STREET:    return "StreetMix";
    case EZ2_MODE_7STREET:   return "7StreetMix";
    case EZ2_MODE_CLUB:      return "ClubMix";
    case EZ2_MODE_SPACE:     return "SpaceMix";
    case EZ2_MODE_5RADIO:    return "5RadioMix";
    case EZ2_MODE_RADIO:     return "RadioMix";
    case EZ2_MODE_10RADIO:   return "10RadioMix";
    case EZ2_MODE_14RADIO:   return "14RadioMix";
    case EZ2_MODE_CATCH:     return "EZ2CATCH";
    case EZ2_MODE_SCRATCH:   return "ScratchMix";
    case EZ2_MODE_CV2:       return "CV2Mix";
    case EZ2_MODE_ANDROMEDA: return "AndromedaMix";
    default:                 return "?";
    }
}

const char *ez2_mode_file_name(ez2_mode m)
{
    /* Only one mode differs, and the game special-cases it too - kModeNames
     * carries both spellings for exactly this reason. */
    return (m == EZ2_MODE_CATCH) ? "catch" : ez2_mode_name(m);
}

/* The table at 0x48f520, in its own order - the `kind` byte indexes it
 * directly. Index 6 (the two-player 7-street layout) and 9 have no songs in
 * the shipped table; they are listed because the byte could name them. */
static const char *const kCv2Sub[EZ2_CV2_SUBMODES] = {
    "5KeyMix",       /* 0 */
    "StreetMix",     /* 1 */
    "7StreetMix",    /* 2 */
    "ClubMix",       /* 3 */
    "SpaceMix",      /* 4 */
    "AndromedaMix",  /* 5 */
    "7StreetMix2p",  /* 6 - @0x42439b special-cases this one */
    "StreetMix1st",  /* 7 */
    "Ez2catch",      /* 8 */
    "ScratchMix"     /* 9 */
};

const char *ez2_cv2_submode(int kind)
{
    if (kind < 0 || kind >= EZ2_CV2_SUBMODES)
        return 0;
    return kCv2Sub[kind];
}

const char *ez2_tier_name(ez2_tier t)
{
    switch (t) {
    case EZ2_TIER_NM:  return "NM";
    case EZ2_TIER_HD:  return "HD";
    case EZ2_TIER_SHD: return "SHD";
    case EZ2_TIER_EX:  return "EX";
    default:           return "-";
    }
}

ez2_mode ez2_mode_from_name(const char *name)
{
    int i;

    if (name == 0)
        return EZ2_MODE_UNKNOWN;
    for (i = 0; i < MODE_NAME_COUNT; i++)
        if (ez2_ci_equal(name, kModeNames[i].name))
            return kModeNames[i].mode;
    return EZ2_MODE_UNKNOWN;
}


int ez2_chart_id_parse(const char *path, ez2_chart_id *out)
{
    const char *base = path, *p, *split = 0;
    size_t n;
    int i;

    memset(out, 0, sizeof *out);
    out->mode = EZ2_MODE_UNKNOWN;
    out->tier = EZ2_TIER_NONE;

    for (p = path; *p; p++)
        if (*p == '/' || *p == '\\')
            base = p + 1;

    /* The game builds these with "%s%dp-%s.ez", so the mode name is whatever
     * precedes the first "<digit>p-". Splitting there rather than matching a
     * prefix list is what keeps "RadioMix" from swallowing "10RadioMix". */
    for (p = base; p[0] && p[1] && p[2]; p++) {
        if (p[0] >= '0' && p[0] <= '9' && (p[1] == 'p' || p[1] == 'P') &&
            p[2] == '-') {
            split = p;
            break;
        }
    }
    if (!split)
        return 0;

    n = (size_t)(split - base);
    if (n == 0 || n >= sizeof out->mode_name)
        return 0;
    memcpy(out->mode_name, base, n);
    out->mode_name[n] = 0;
    out->players = split[0] - '0';

    for (i = 0; i < MODE_NAME_COUNT; i++)
        if (ez2_ci_equal(out->mode_name, kModeNames[i].name)) {
            out->mode = kModeNames[i].mode;
            break;
        }

    /* Everything after "Np-", minus the extension. */
    {
        const char *rest = split + 3;
        const char *dot = 0, *q, *dash = 0;
        size_t len;

        for (q = rest; *q; q++)
            if (*q == '.')
                dot = q;
        len = dot ? (size_t)(dot - rest) : strlen(rest);
        if (len >= sizeof out->song)
            len = sizeof out->song - 1;
        memcpy(out->song, rest, len);
        out->song[len] = 0;

        for (q = out->song; *q; q++)
            if (*q == '-')
                dash = q;

        /* The stem is the song WITHOUT its tier suffix, and it exists because
         * `song` deliberately keeps the whole token. Anything keyed by song
         * plus tier - the ranking file is the one - needs the two separated,
         * or it builds `babydance-hd` + `-hd.bin`. */
        memcpy(out->stem, out->song, len + 1);

        if (!dash) {
            out->tier = EZ2_TIER_NM;   /* no suffix at all is Normal */
        } else {
            size_t sl = strlen(dash + 1);
            if (sl < sizeof out->suffix) {
                memcpy(out->suffix, dash + 1, sl + 1);
                if (ez2_ci_equal(out->suffix, "hd"))       out->tier = EZ2_TIER_HD;
                else if (ez2_ci_equal(out->suffix, "shd")) out->tier = EZ2_TIER_SHD;
                else if (ez2_ci_equal(out->suffix, "ex"))  out->tier = EZ2_TIER_EX;
                /* Only a TIER suffix comes off the stem. A radio stage's
                 * `-r1` or a CV2 variant's `-5o1` is part of the name. */
                if (out->tier != EZ2_TIER_NONE)
                    out->stem[(size_t)(dash - out->song)] = 0;
                /* Anything else - -r1, -rd2, -gc, -zn - is a radio stage or a
                 * variant tag, and leaves the tier as NONE. */
            }
        }
    }
    return out->mode != EZ2_MODE_UNKNOWN;
}

/* ---- track roles -------------------------------------------------------- */

ez2_track_role ez2_track_role_of(int track)
{
    if (track == 0)                    return EZ2_TRACK_CONTROL;
    if (track >= 3  && track <= 7)     return EZ2_TRACK_KEY_1P;
    if (track >= 8  && track <= 9)     return EZ2_TRACK_EFFECTOR_1P;
    if (track == 10)                   return EZ2_TRACK_SCRATCH_1P;
    if (track == 11)                   return EZ2_TRACK_PEDAL_1P;
    if (track >= 12 && track <= 13)    return EZ2_TRACK_EFFECTOR_2P;
    if (track >= 14 && track <= 18)    return EZ2_TRACK_KEY_2P;
    if (track == 19)                   return EZ2_TRACK_SCRATCH_2P;
    if (track == 20)                   return EZ2_TRACK_PEDAL_2P;
    if (track == 21)                   return EZ2_TRACK_LIGHTS;
    return EZ2_TRACK_BACKING;          /* 1-2 and 22+ */
}

const char *ez2_track_role_name(int track)
{
    switch (ez2_track_role_of(track)) {
    case EZ2_TRACK_CONTROL:      return "control";
    case EZ2_TRACK_KEY_1P:       return "1P key";
    case EZ2_TRACK_EFFECTOR_1P:  return "1P effector";
    case EZ2_TRACK_SCRATCH_1P:   return "1P scratch";
    case EZ2_TRACK_PEDAL_1P:     return "1P pedal";
    case EZ2_TRACK_EFFECTOR_2P:  return "2P effector";
    case EZ2_TRACK_KEY_2P:       return "2P key";
    case EZ2_TRACK_SCRATCH_2P:   return "2P scratch";
    case EZ2_TRACK_PEDAL_2P:     return "2P pedal";
    case EZ2_TRACK_LIGHTS:       return "lights";
    default:                     return "backing";
    }
}

/* ---- lane sets ---------------------------------------------------------- */

/* Left to right, 1P before 2P. The SETS are verified against the whole
 * library by tools/ez2lanes; the ORDER within a set is not - see mode.h. */

/* 5 keys and nothing else. */
static const int kLanes5Key[]    = { 3, 4, 5, 6, 7 };
/* 5-key standard: keys, scratch, pedal. Ruby and 5Radio share it. */
static const int kLanesStreet[]  = { 3, 4, 5, 6, 7, 10, 11 };
/* 7-key: the two 1P effectors become keys 6 and 7. RadioMix is this one. */
static const int kLanes7Street[] = { 3, 4, 5, 6, 7, 8, 9, 10, 11 };
/* 10-key. THE RIGHT HAND IS TRACKS 12-16 - the two 2P effectors and 2P keys
 * 1-3 - NOT 14-18. 2P keys 4 and 5 are never used in club, and a 14-18
 * mapping silently drops every EF3/EF4 note into the backing audio. */
static const int kLanesClub[]    = { 3, 4, 5, 6, 7, 12, 13, 14, 15, 16, 10, 19, 11 };
/* 14-key: every key track, both effector pairs, both scratches, no pedal. */
static const int kLanesSpace[]   = { 3, 4, 5, 6, 7, 8, 9, 12, 13,
                                     14, 15, 16, 17, 18, 10, 19 };
/* Catch is club without the second scratch. */
static const int kLanesCatch[]   = { 3, 4, 5, 6, 7, 12, 13, 14, 15, 16, 10, 11 };
/* 16-key: the space set plus both pedals. */
static const int kLanesAndro[]   = { 3, 4, 5, 6, 7, 8, 9, 12, 13,
                                     14, 15, 16, 17, 18, 10, 19, 11, 20 };

#define LANESET(a) { a, (int)(sizeof (a) / sizeof (a)[0]) }

static const struct { const int *tracks; int count; } kLaneSets[EZ2_MODE_COUNT] = {
    LANESET(kLanes5Key),      /* 5KeyMix    */
    LANESET(kLanesStreet),    /* RubyMix    */
    LANESET(kLanesStreet),    /* StreetMix  */
    LANESET(kLanes7Street),   /* 7StreetMix */
    LANESET(kLanesClub),      /* ClubMix    */
    LANESET(kLanesSpace),     /* SpaceMix   */
    LANESET(kLanesStreet),    /* 5RadioMix  */
    LANESET(kLanes7Street),   /* RadioMix - 7-key, not 5 */
    LANESET(kLanesClub),      /* 10RadioMix */
    LANESET(kLanesSpace),     /* 14RadioMix */
    LANESET(kLanesCatch),     /* EZ2CATCH   */
    LANESET(kLanes5Key),      /* ScratchMix */
    { 0, 0 },                 /* CV2Mix - its own playfield, not modelled */
    LANESET(kLanesAndro)      /* AndromedaMix */
};

#undef LANESET

int ez2_mode_lanes(ez2_mode m, int *tracks, int max)
{
    int n, i;

    if (m < 0 || m >= EZ2_MODE_COUNT || kLaneSets[m].tracks == 0)
        return 0;
    n = kLaneSets[m].count;
    if (n > max)
        n = max;
    for (i = 0; i < n; i++)
        tracks[i] = kLaneSets[m].tracks[i];
    return n;
}

int ez2_mode_uses_track(ez2_mode m, int track)
{
    int i;

    if (m < 0 || m >= EZ2_MODE_COUNT || kLaneSets[m].tracks == 0)
        return 0;
    for (i = 0; i < kLaneSets[m].count; i++)
        if (kLaneSets[m].tracks[i] == track)
            return 1;
    return 0;
}

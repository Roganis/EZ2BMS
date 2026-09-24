/* EZ2AC `.ez` charts - the EZFF format.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * THIS IS IN THE "MUST BE EXACT" COLUMN (../../docs/PORTING.md section 4d).
 * Chart interpretation is the game; a port may draw it however it likes but
 * must read it identically. So this file follows the decomp's own MATCHED code
 * rather than the prior RE wherever the two differ - and they do differ.
 *
 * Sources, in order of authority:
 *   ../../src/note.cpp        NoteConvert @0x410ef0 - MATCHED. The record
 *                             layout and the full type table come from here.
 *   ../../wip/loadez-411460.cpp   EzChart::loadEZ - decoded, gives the file
 *                             and track header layouts.
 *   ../../../EZ2REWRITE/reverse-engineering/file-formats.md  the prior RE,
 *                             which supplied the version/record-size table and
 *                             the velocity/pan semantics.
 *
 * A `.ez` on disk is ENCRYPTED. Decrypt it with ez2_decrypt and the EZ2_KEY_EZ
 * table first; what this parses is the plaintext, which begins "EZFF".
 */
#ifndef EZ2_CHART_H
#define EZ2_CHART_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define EZ2_CHART_NAME 65      /* 64 stored bytes plus a terminator */

/* On-disk record types, straight from the switch in NoteConvert @0x410ef0.
 * The prior RE documented only the first four; the matched code has eight
 * plus an open-ended tail, and a parser that stops at 4 mis-strides nothing
 * (records are fixed width) but silently drops events. */
typedef enum ez2_note_type {
    EZ2_NOTE_NONE   = 0,
    EZ2_NOTE_NOTE   = 1,   /* a playable note or hold */
    EZ2_NOTE_VOLUME = 2,   /* u8 payload */
    EZ2_NOTE_BPM    = 3,   /* f32 payload */
    EZ2_NOTE_BEATS  = 4,   /* u8 payload - beats per measure */
    EZ2_NOTE_MARK   = 5,   /* no payload */
    EZ2_NOTE_T6     = 6,   /* u32 payload */
    EZ2_NOTE_T7     = 7,   /* u32 payload */
    EZ2_NOTE_OTHER  = 8    /* >= 8: two u32 payloads */
} ez2_note_type;

typedef struct ez2_note {
    unsigned int   tick;
    unsigned char  type;        /* ez2_note_type, as stored */

    /* type 1 only. Defaults are velocity 127 (full) and pan 64 (centre). */
    unsigned short key_index;   /* indexes the sibling .ezi's sample list */
    unsigned char  velocity;
    unsigned char  pan;         /* 0 = hard left, 64 = centre, 127 = hard right */
    unsigned char  unknown;
    unsigned short length;      /* see ez2_note_hold_ticks */

    float          bpm;         /* type 3 */
    unsigned char  value;       /* types 2 and 4 */
    unsigned int   raw[2];      /* types >= 6 */
} ez2_note;

/* A hold's duration in ticks, or 0 for a tap.
 *
 * `length` is biased by 6: 0 or 6 is a tap, anything greater is a hold of
 * `length - 6`. Getting this wrong is a known footgun - see the note on
 * record widths in chart.c. */
unsigned int ez2_note_hold_ticks(const ez2_note *n);

typedef struct ez2_track {
    char       name[EZ2_CHART_NAME];
    unsigned int ticks;
    int        note_count;
    ez2_note  *notes;
} ez2_track;

typedef struct ez2_chart {
    int          version;           /* 4..8 */
    char         name[EZ2_CHART_NAME];
    char         name2[EZ2_CHART_NAME];
    unsigned int ticks_per_measure; /* 192 in every modern chart */
    float        bpm;               /* initial */
    float        bpm2;
    unsigned int total_ticks;
    int          track_count;       /* 64 in every modern chart */
    ez2_track   *tracks;
} ez2_chart;

/* Parse decrypted EZFF bytes. Returns 0 or a negative ez2_chart_err. */
int  ez2_chart_parse(const unsigned char *data, size_t n, ez2_chart *out);
void ez2_chart_free(ez2_chart *c);

/* Bytes per note record for a given chart version.
 * 5 fixed bytes plus a per-version payload: v4 = 5, v5/v6 = 6, v7/v8 = 8. */
int  ez2_chart_record_size(int version);

enum ez2_chart_err {
    EZ2_CHART_OK        =  0,
    EZ2_CHART_ERR_SHORT = -1,
    EZ2_CHART_ERR_MAGIC = -2,   /* not "EZFF" - did you forget to decrypt? */
    EZ2_CHART_ERR_VER   = -3,   /* version outside 4..8 */
    EZ2_CHART_ERR_TRACK = -4,   /* a track header is not "EZTR" */
    EZ2_CHART_ERR_TRUNC = -5,
    EZ2_CHART_ERR_COUNT = -6,
    EZ2_CHART_ERR_MEM   = -7
};

const char *ez2_chart_strerror(int err);


/* ---- the tempo map --------------------------------------------------------
 *
 * A chart's BPM is not one number: a disk record of type 3 becomes a runtime
 * type 5 and calls `setSpeed` @0x40f5c0 as the pump walks past it, so the step
 * rate changes mid-song. Converting a tick to a time therefore means walking
 * the BPM changes and integrating, not multiplying.
 *
 * This lived in THREE copies - ez2play, ez2judge and ez2render each built
 * their own - which is how two of them ended up returning milliseconds and the
 * third seconds. Same arithmetic, three chances to fix a bug in one place and
 * not the others.
 *
 * TICKS HERE ARE THE CHART'S, `ticks_per_measure` to the measure. They are not
 * the judgement's 1/192-beat ticks (see ez2_tick_ms in score.h) and not the
 * `.scr`'s 60 Hz frames. Three tick units, one word. */
typedef struct ez2_tempo_point {
    unsigned int tick;
    float        bpm;
} ez2_tempo_point;

typedef struct ez2_tempo {
    int              count;
    ez2_tempo_point *points;      /* tick-ordered, always at least one */
} ez2_tempo;

/* Build from a chart's BPM records, plus an implicit point at tick 0 carrying
 * the header BPM. Returns 0, or a negative ez2_chart_err. Caller must free. */
int  ez2_tempo_build(const ez2_chart *c, ez2_tempo *out);
void ez2_tempo_free(ez2_tempo *t);

/* When `tick` happens, in seconds and in milliseconds. `ticks_per_measure` is
 * the chart's; 0 means the 192 default. */
double ez2_tempo_seconds(const ez2_tempo *t, unsigned int tick,
                         unsigned int ticks_per_measure);
double ez2_tempo_ms(const ez2_tempo *t, unsigned int tick,
                    unsigned int ticks_per_measure);

/* The inverse: the chart tick reached at `ms` (fractional ticks truncated,
 * negative times clamp to 0). What a caller with a millisecond clock hands
 * to the hold state machine, which the game runs in song ticks. */
unsigned int ez2_tempo_tick_at_ms(const ez2_tempo *t, double ms,
                                  unsigned int ticks_per_measure);

/* The same, FRACTIONAL - what the scroll wants. Quantising the cursor to
 * whole ticks would step the field 1.6px at a time (ez2/scroll.h), which is
 * visible judder at any speed. Negative times extrapolate backwards through
 * the first segment's tempo instead of clamping to 0, so a lead-in shows the
 * chart's opening notes above the line rather than stacked on it. */
double ez2_tempo_tick_at_ms_f(const ez2_tempo *t, double ms,
                              unsigned int ticks_per_measure);

/* The BPM in force at `tick`, and the slowest anywhere in the chart - the
 * latter is what bounds a judgement window, since a tick is worth the most
 * milliseconds where the chart is slowest. */
float ez2_tempo_bpm_at(const ez2_tempo *t, unsigned int tick);
float ez2_tempo_slowest(const ez2_tempo *t);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_CHART_H */

/* EZ2AC `.ez` charts - the EZFF format.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "chart.h"
#include "util.h"

#include <stdlib.h>
#include <string.h>

/* File header, 0x96 bytes. Layout from wip/loadez-411460.cpp, which reads a
 * 0x96-byte block and stores exactly these fields.
 *
 *   0x00 "EZFF"   0x04 u8       0x05 version   0x06 name[0x40]
 *   0x46 name2[0x40]            0x86 u16 ticks-per-measure
 *   0x88 f32 bpm  0x8c u16 track count         0x8e u32 total ticks
 *   0x92 f32 bpm2
 *
 * The prior RE describes a single 64-byte name at 0x06 and then jumps to 0x86,
 * leaving 0x46..0x85 unaccounted. The decomp shows it is a SECOND 64-byte
 * name, copied to a second field of the chart object. */
#define HDR_SIZE      0x96
#define HDR_VERSION   0x05
#define HDR_NAME      0x06
#define HDR_NAME2     0x46
#define HDR_TPM       0x86
#define HDR_BPM       0x88
#define HDR_TRACKS    0x8c
#define HDR_TOTAL     0x8e
#define HDR_BPM2      0x92

/* Track header, 0x4e bytes: "EZTR", u16 0, name[0x40], u32 ticks, u32 size. */
#define TRK_SIZE      0x4e
#define TRK_NAME      0x06
#define TRK_TICKS     0x46
#define TRK_BYTES     0x4a

const char *ez2_chart_strerror(int err)
{
    switch (err) {
    case EZ2_CHART_OK:        return "ok";
    case EZ2_CHART_ERR_SHORT: return "too short";
    case EZ2_CHART_ERR_MAGIC: return "not EZFF (is it still encrypted?)";
    case EZ2_CHART_ERR_VER:   return "unsupported chart version";
    case EZ2_CHART_ERR_TRACK: return "track header is not EZTR";
    case EZ2_CHART_ERR_TRUNC: return "track data runs past the end of the file";
    case EZ2_CHART_ERR_COUNT: return "implausible track count";
    case EZ2_CHART_ERR_MEM:   return "out of memory";
    default:                  return "unknown error";
    }
}

static float rdf(const unsigned char *p)
{
    unsigned int u = ez2_rd32(p);
    float f;
    memcpy(&f, &u, sizeof f);
    return f;
}

static void copy_name(char *dst, const unsigned char *src)
{
    memcpy(dst, src, EZ2_CHART_NAME - 1);
    dst[EZ2_CHART_NAME - 1] = 0;
}

/* 5 fixed bytes (u32 tick + u8 type) plus a per-version payload.
 *
 * THE v7 WIDENING IS THE FOOTGUN IN THIS FORMAT. v4-v6 store the key index as
 * a u8 at +5 and the length as a u16 at +9; v7/v8 widened the key index to a
 * u16 (songs outgrew 256 samples), which pushed the length to +10. Reading a
 * v8 chart with the v6 offsets picks up the length byte shifted into the high
 * half - 6 becomes 0x0600 = 1536 - so EVERY note reads as an endless hold.
 * Branch on the version, never on the record size alone. */
int ez2_chart_record_size(int version)
{
    switch (version) {
    case 4:  return 5 + 5;
    case 5:
    case 6:  return 5 + 6;
    case 7:
    case 8:  return 5 + 8;
    default: return 0;
    }
}

unsigned int ez2_note_hold_ticks(const ez2_note *n)
{
    if (n->type != EZ2_NOTE_NOTE || n->length <= 6)
        return 0;
    return n->length - 6u;
}

/* Decode one record. The type table is the switch in NoteConvert @0x410ef0
 * (src/note.cpp, MATCHED) - which is why types 5, 6, 7 and the >= 8 tail are
 * here at all; the prior RE stops at 4. */
static void read_note(const unsigned char *p, int version, ez2_note *n)
{
    int wide = (version >= 7);

    memset(n, 0, sizeof *n);
    n->tick = ez2_rd32(p);
    n->type = p[4];

    switch (n->type) {
    case EZ2_NOTE_NOTE:
        if (wide) {
            n->key_index = (unsigned short)ez2_rd16(p + 5);
            n->velocity  = p[7];
            n->pan       = p[8];
            n->unknown   = p[9];
            n->length    = (unsigned short)ez2_rd16(p + 10);
        } else {
            n->key_index = p[5];
            n->velocity  = p[6];
            n->pan       = p[7];
            n->unknown   = p[8];
            n->length    = (unsigned short)ez2_rd16(p + 9);
        }
        break;

    case EZ2_NOTE_VOLUME:
    case EZ2_NOTE_BEATS:
        n->value = p[5];
        break;

    case EZ2_NOTE_BPM:
        n->bpm    = rdf(p + 5);
        n->raw[0] = ez2_rd32(p + 5);
        break;

    case EZ2_NOTE_MARK:
        break;

    default:
        /* Types 6, 7 and everything from 8 up carry raw words. The matched
         * converter reads one u32 for 6 and 7 and two for >= 8; reading both
         * here is harmless because the record is fixed width and the second
         * is simply ignored by callers that do not want it. */
        n->raw[0] = ez2_rd32(p + 5);
        n->raw[1] = ez2_rd32(p + 9);
        break;
    }
}

void ez2_chart_free(ez2_chart *c)
{
    int i;
    if (c == 0 || c->tracks == 0)
        return;
    for (i = 0; i < c->track_count; i++)
        free(c->tracks[i].notes);
    free(c->tracks);
    c->tracks = 0;
    c->track_count = 0;
}

int ez2_chart_parse(const unsigned char *data, size_t n, ez2_chart *out)
{
    size_t o = HDR_SIZE;
    int rec, i, rc;

    memset(out, 0, sizeof *out);

    if (n < HDR_SIZE)
        return EZ2_CHART_ERR_SHORT;
    if (memcmp(data, "EZFF", 4) != 0)
        return EZ2_CHART_ERR_MAGIC;

    out->version = data[HDR_VERSION];
    rec = ez2_chart_record_size(out->version);
    if (rec == 0)
        return EZ2_CHART_ERR_VER;

    copy_name(out->name,  data + HDR_NAME);
    copy_name(out->name2, data + HDR_NAME2);
    out->ticks_per_measure = ez2_rd16(data + HDR_TPM);
    out->bpm               = rdf(data + HDR_BPM);
    out->track_count       = (int)ez2_rd16(data + HDR_TRACKS);
    out->total_ticks       = ez2_rd32(data + HDR_TOTAL);
    out->bpm2              = rdf(data + HDR_BPM2);

    /* The engine's own table is 96 tracks wide (g_tracks[96] in
     * wip/loadez-411460.cpp) even though every shipped chart declares 64. */
    if (out->track_count < 0 || out->track_count > 96)
        return EZ2_CHART_ERR_COUNT;
    if (out->track_count == 0)
        return EZ2_CHART_OK;

    out->tracks = (ez2_track *)calloc((size_t)out->track_count,
                                      sizeof *out->tracks);
    if (out->tracks == 0)
        return EZ2_CHART_ERR_MEM;

    for (i = 0; i < out->track_count; i++) {
        ez2_track *t = &out->tracks[i];
        unsigned int bytes;
        int j, count;

        if (o + TRK_SIZE > n) { rc = EZ2_CHART_ERR_TRUNC; goto fail; }
        if (memcmp(data + o, "EZTR", 4) != 0) { rc = EZ2_CHART_ERR_TRACK; goto fail; }

        copy_name(t->name, data + o + TRK_NAME);
        t->ticks = ez2_rd32(data + o + TRK_TICKS);
        bytes    = ez2_rd32(data + o + TRK_BYTES);
        o += TRK_SIZE;

        if (bytes > n - o) { rc = EZ2_CHART_ERR_TRUNC; goto fail; }

        count = (int)(bytes / (unsigned int)rec);
        t->note_count = count;
        if (count) {
            t->notes = (ez2_note *)calloc((size_t)count, sizeof *t->notes);
            if (t->notes == 0) { rc = EZ2_CHART_ERR_MEM; goto fail; }
            for (j = 0; j < count; j++)
                read_note(data + o + (size_t)j * (size_t)rec, out->version,
                          &t->notes[j]);
        }
        o += bytes;
    }
    return EZ2_CHART_OK;

fail:
    ez2_chart_free(out);
    return rc;
}

/* ---- the tempo map. See chart.h. ---------------------------------------- */

static int cmp_tempo(const void *a, const void *b)
{
    unsigned x = ((const ez2_tempo_point *)a)->tick;
    unsigned y = ((const ez2_tempo_point *)b)->tick;
    return x < y ? -1 : (x > y ? 1 : 0);
}

int ez2_tempo_build(const ez2_chart *c, ez2_tempo *out)
{
    int cap = 64, t, j;

    if (c == 0 || out == 0)
        return EZ2_CHART_ERR_SHORT;   /* no chart is nothing to time */
    memset(out, 0, sizeof *out);

    out->points = (ez2_tempo_point *)malloc((size_t)cap * sizeof *out->points);
    if (out->points == 0)
        return EZ2_CHART_ERR_MEM;

    /* The header BPM holds from tick 0 until the first change - and a chart
     * with no changes at all is then simply a one-point map, which is what
     * lets every caller use the same walk. */
    out->points[0].tick = 0;
    out->points[0].bpm  = (c->bpm > 0.0f) ? c->bpm : 120.0f;
    out->count = 1;

    for (t = 0; t < c->track_count; t++)
        for (j = 0; j < c->tracks[t].note_count; j++) {
            const ez2_note *e = &c->tracks[t].notes[j];

            if (e->type != EZ2_NOTE_BPM || !(e->bpm > 0.0f) || e->bpm > 1000.0f)
                continue;
            if (out->count == cap) {
                ez2_tempo_point *big = (ez2_tempo_point *)realloc(
                    out->points, (size_t)cap * 2 * sizeof *out->points);
                if (big == 0) {
                    ez2_tempo_free(out);
                    return EZ2_CHART_ERR_MEM;
                }
                out->points = big;
                cap *= 2;
            }
            out->points[out->count].tick = e->tick;
            out->points[out->count].bpm  = e->bpm;
            out->count++;
        }

    qsort(out->points, (size_t)out->count, sizeof *out->points, cmp_tempo);
    return EZ2_CHART_OK;
}

void ez2_tempo_free(ez2_tempo *t)
{
    if (t == 0)
        return;
    free(t->points);
    t->points = 0;
    t->count = 0;
}

double ez2_tempo_seconds(const ez2_tempo *t, unsigned int tick,
                         unsigned int ticks_per_measure)
{
    double per_beat = (ticks_per_measure ? ticks_per_measure : 192) / 4.0;
    double sec = 0.0;
    int i;

    if (t == 0 || t->count <= 0)
        return 0.0;

    /* Integrate across the BPM changes: each segment contributes its own tick
     * length. Multiplying by one BPM is only right for a chart that has one. */
    for (i = 0; i < t->count; i++) {
        unsigned from = t->points[i].tick;
        unsigned to   = (i + 1 < t->count) ? t->points[i + 1].tick : tick;

        if (from >= tick)
            break;
        if (to > tick)
            to = tick;
        sec += (double)(to - from) * 60.0 /
               ((double)t->points[i].bpm * per_beat);
    }
    return sec;
}

double ez2_tempo_ms(const ez2_tempo *t, unsigned int tick,
                    unsigned int ticks_per_measure)
{
    return ez2_tempo_seconds(t, tick, ticks_per_measure) * 1000.0;
}

double ez2_tempo_tick_at_ms_f(const ez2_tempo *t, double ms,
                              unsigned int ticks_per_measure)
{
    double per_beat = (ticks_per_measure ? ticks_per_measure : 192) / 4.0;
    double sec = ms / 1000.0;
    double at = 0.0;
    int i;

    if (t == 0 || t->count <= 0)
        return 0.0;
    /* NEGATIVE TIMES EXTRAPOLATE BACKWARDS rather than clamping. The integer
     * form clamps because its caller hands ticks to the hold machine, which
     * has nothing to do before the chart starts; the scroll's caller is
     * drawing, and during the lead-in it needs the notes to be somewhere
     * above the line rather than all piled on it. */
    if (!(sec > 0.0)) {
        double tick_sec = 60.0 / ((double)t->points[0].bpm * per_beat);
        return (double)t->points[0].tick + sec / tick_sec;
    }

    /* Walk the same segments ez2_tempo_seconds integrates, and stop in the
     * one whose end lies past the time asked for. */
    for (i = 0; i < t->count; i++) {
        double tick_sec = 60.0 / ((double)t->points[i].bpm * per_beat);
        unsigned from = t->points[i].tick;

        if (i + 1 < t->count) {
            unsigned to = t->points[i + 1].tick;
            double seg = (double)(to - from) * tick_sec;
            if (at + seg > sec)
                return (double)from + (sec - at) / tick_sec;
            at += seg;
        } else {
            return (double)from + (sec - at) / tick_sec;
        }
    }
    return 0.0;
}

unsigned int ez2_tempo_tick_at_ms(const ez2_tempo *t, double ms,
                                  unsigned int ticks_per_measure)
{
    double f;

    if (t == 0 || t->count <= 0 || !(ms > 0.0))
        return 0;
    f = ez2_tempo_tick_at_ms_f(t, ms, ticks_per_measure);
    return f > 0.0 ? (unsigned int)f : 0;
}

float ez2_tempo_bpm_at(const ez2_tempo *t, unsigned int tick)
{
    float bpm = 120.0f;
    int i;

    if (t == 0 || t->count <= 0)
        return bpm;
    for (i = 0; i < t->count; i++) {
        if (i > 0 && t->points[i].tick > tick)
            break;
        bpm = t->points[i].bpm;
    }
    return bpm;
}

float ez2_tempo_slowest(const ez2_tempo *t)
{
    float slow;
    int i;

    if (t == 0 || t->count <= 0)
        return 120.0f;
    slow = t->points[0].bpm;
    for (i = 1; i < t->count; i++)
        if (t->points[i].bpm < slow)
            slow = t->points[i].bpm;
    return slow;
}

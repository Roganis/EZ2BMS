/* EZ2AC oracle-trace format - reader, writer and call-site attribution.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE and trace.h for the format.
 */
#include "trace.h"
#include "util.h"

#include <string.h>

/* ---- wire helpers -------------------------------------------------------- *
 *
 * Little-endian, byte-wise, no struct overlay - the same idiom as str.c's
 * rdf: floats go through a u32 and memcpy, which survives alignment and
 * strict aliasing on every host. */

static long rds32(const unsigned char *p)
{
    unsigned long u = ez2_rd32(p);
    /* portable u32 -> s32 without relying on implementation-defined casts */
    if (u >= 0x80000000ul)
        return (long)(u - 0x80000000ul) - 0x40000000l - 0x40000000l;
    return (long)u;
}

static float rdf32(const unsigned char *p)
{
    unsigned int u = (unsigned int)ez2_rd32(p);
    float f;
    memcpy(&f, &u, 4);
    return f;
}

static void wr32(unsigned char *p, unsigned long v)
{
    p[0] = (unsigned char)(v & 0xff);
    p[1] = (unsigned char)((v >> 8) & 0xff);
    p[2] = (unsigned char)((v >> 16) & 0xff);
    p[3] = (unsigned char)((v >> 24) & 0xff);
}

static void wrf32(unsigned char *p, float f)
{
    unsigned int u;
    memcpy(&u, &f, 4);
    wr32(p, u);
}

/* Record tags, read as little-endian u32 of the ASCII bytes. */
#define TAG_STAG 0x47415453ul   /* "STAG" */
#define TAG_EVNT 0x544e5645ul   /* "EVNT" */

/* Payload sizes, fixed per version-1 record. A version-2 record may be
 * LONGER (a reader skips what it does not know by the payload size); it may
 * never be shorter. */
#define STAGE_PAYLOAD (EZ2_TRACE_STAGE_WIRE - 8u)
#define STATE_WIRE    EZ2_TRACE_STATE_WIRE
#define EVENT_PAYLOAD (EZ2_TRACE_EVENT_WIRE - 8u)

/* ---- reading ------------------------------------------------------------- */

int ez2_trace_reader_init(ez2_trace_reader *r, const void *buf, size_t n)
{
    const unsigned char *p = (const unsigned char *)buf;

    r->p = r->end = NULL;
    if (!p || n < 8)
        return EZ2_TRACE_ERR;
    if (memcmp(p, EZ2_TRACE_MAGIC, 4) != 0)
        return EZ2_TRACE_ERR;
    if (ez2_rd32(p + 4) != EZ2_TRACE_VERSION)
        return EZ2_TRACE_ERR;
    r->p = p + 8;
    r->end = p + n;
    return 0;
}

static const unsigned char *rd_state(const unsigned char *p,
                                     ez2_trace_state *s)
{
    int g;

    s->combo     = rds32(p);      p += 4;
    s->max_combo = rds32(p);      p += 4;
    s->score     = rds32(p);      p += 4;
    s->gauge     = rdf32(p);      p += 4;
    s->counts[0] = 0;
    for (g = 1; g <= 5; g++) {
        s->counts[g] = rds32(p);
        p += 4;
    }
    s->f1c0     = rds32(p);       p += 4;
    s->audience = rdf32(p);       p += 4;
    return p;
}

int ez2_trace_next(ez2_trace_reader *r, ez2_trace_stage *stage,
                   ez2_trace_event *event)
{
    for (;;) {
        unsigned long tag, size;
        const unsigned char *p;

        if (!r->p)
            return EZ2_TRACE_ERR;
        if (r->p == r->end)
            return EZ2_TRACE_END;
        if ((size_t)(r->end - r->p) < 8)
            return EZ2_TRACE_ERR;

        tag = ez2_rd32(r->p);
        size = ez2_rd32(r->p + 4);
        p = r->p + 8;
        if ((size_t)(r->end - p) < size)
            return EZ2_TRACE_ERR;
        r->p = p + size;

        if (tag == TAG_STAG && size >= STAGE_PAYLOAD) {
            int g;

            stage->stage_id = ez2_rd32(p);       p += 4;
            stage->slot     = ez2_rd32(p);       p += 4;
            stage->rate[0] = 0.0f;
            for (g = 1; g <= 5; g++) {
                stage->rate[g] = rdf32(p);
                p += 4;
            }
            stage->audience_rate[0] = 0.0f;
            for (g = 1; g <= 5; g++) {
                stage->audience_rate[g] = rdf32(p);
                p += 4;
            }
            stage->f794         = rdf32(p);  p += 4;
            stage->fd18         = ez2_rd32(p);   p += 4;
            stage->note_count   = ez2_rd32(p);   p += 4;
            stage->cv2_flag     = ez2_rd32(p);   p += 4;
            stage->mode         = ez2_rd32(p);   p += 4;
            stage->alt_values   = ez2_rd32(p);   p += 4;
            stage->use_audience = ez2_rd32(p);   p += 4;
            stage->g_1b2e7d4    = ez2_rd32(p);   p += 4;
            stage->elem_count   = ez2_rd32(p);
            return EZ2_TRACE_STAGE;
        }
        if (tag == TAG_EVNT && size >= EVENT_PAYLOAD) {
            event->seq      = ez2_rd32(p);       p += 4;
            event->stage_id = ez2_rd32(p);       p += 4;
            event->slot     = ez2_rd32(p);       p += 4;
            event->ret_addr = ez2_rd32(p);       p += 4;
            event->grade    = rds32(p);      p += 4;
            event->count    = rds32(p);      p += 4;
            event->flag     = rds32(p);      p += 4;
            p = rd_state(p, &event->before);
            rd_state(p, &event->after);
            return EZ2_TRACE_EVENT;
        }
        /* Unknown tag, or a known tag from a build that shipped fewer
         * fields than this reader wants: skip it. */
    }
}

/* ---- writing ------------------------------------------------------------- */

int ez2_trace_write_header(FILE *f)
{
    unsigned char h[8];

    memcpy(h, EZ2_TRACE_MAGIC, 4);
    wr32(h + 4, EZ2_TRACE_VERSION);
    return fwrite(h, 1, 8, f) == 8 ? 0 : -1;
}

static unsigned char *wr_state(unsigned char *p, const ez2_trace_state *s)
{
    int g;

    wr32(p, (unsigned long)s->combo);      p += 4;
    wr32(p, (unsigned long)s->max_combo);  p += 4;
    wr32(p, (unsigned long)s->score);      p += 4;
    wrf32(p, s->gauge);                    p += 4;
    for (g = 1; g <= 5; g++) {
        wr32(p, (unsigned long)s->counts[g]);
        p += 4;
    }
    wr32(p, (unsigned long)s->f1c0);       p += 4;
    wrf32(p, s->audience);                 p += 4;
    return p;
}

int ez2_trace_write_stage(FILE *f, const ez2_trace_stage *s)
{
    unsigned char buf[8 + STAGE_PAYLOAD];
    unsigned char *p = buf;
    int g;

    wr32(p, TAG_STAG);           p += 4;
    wr32(p, STAGE_PAYLOAD);      p += 4;
    wr32(p, s->stage_id);        p += 4;
    wr32(p, s->slot);            p += 4;
    for (g = 1; g <= 5; g++) {
        wrf32(p, s->rate[g]);
        p += 4;
    }
    for (g = 1; g <= 5; g++) {
        wrf32(p, s->audience_rate[g]);
        p += 4;
    }
    wrf32(p, s->f794);           p += 4;
    wr32(p, s->fd18);            p += 4;
    wr32(p, s->note_count);      p += 4;
    wr32(p, s->cv2_flag);        p += 4;
    wr32(p, s->mode);            p += 4;
    wr32(p, s->alt_values);      p += 4;
    wr32(p, s->use_audience);    p += 4;
    wr32(p, s->g_1b2e7d4);       p += 4;
    wr32(p, s->elem_count);      p += 4;
    return fwrite(buf, 1, sizeof(buf), f) == sizeof(buf) ? 0 : -1;
}

int ez2_trace_write_event(FILE *f, const ez2_trace_event *e)
{
    unsigned char buf[8 + EVENT_PAYLOAD];
    unsigned char *p = buf;

    wr32(p, TAG_EVNT);                    p += 4;
    wr32(p, EVENT_PAYLOAD);               p += 4;
    wr32(p, e->seq);                      p += 4;
    wr32(p, e->stage_id);                 p += 4;
    wr32(p, e->slot);                     p += 4;
    wr32(p, e->ret_addr);                 p += 4;
    wr32(p, (unsigned long)e->grade);     p += 4;
    wr32(p, (unsigned long)e->count);     p += 4;
    wr32(p, (unsigned long)e->flag);      p += 4;
    p = wr_state(p, &e->before);
    wr_state(p, &e->after);
    return fwrite(buf, 1, sizeof(buf), f) == sizeof(buf) ? 0 : -1;
}

/* ---- attribution --------------------------------------------------------- */

const char *ez2_trace_caller_name(unsigned long ret_addr)
{
    /* Ranges are the enclosing functions' int3-bounded extents, taken from
     * the disassembly (docs/oracle-trace.md section 4, corrected). A return
     * address anywhere in the function attributes - the sink is called
     * through plain rel32 calls, so anything else in the range would mean
     * the trace itself is suspect. */
    if (ret_addr == 0x422c6aul)
        return "applyTracks @0x422bf0 (matched)";
    if (ret_addr >= 0x42f4e0ul && ret_addr <= 0x42f873ul)
        return "unread caller @0x42f4e0";
    if (ret_addr >= 0x42f880ul && ret_addr <= 0x42fbe2ul)
        return "hold pump @0x42f880";
    if (ret_addr >= 0x42fd90ul && ret_addr <= 0x4304fcul) {
        if (ret_addr == 0x4304ddul)
            return "keys commit @0x42fd90 (lane-swap variant)";
        return "keys commit @0x42fd90";
    }
    return "UNKNOWN caller";
}

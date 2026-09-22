/* EZ2AC `.scr` - the background scene timeline.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "scr.h"
#include "util.h"

#include <stdlib.h>
#include <string.h>

const char *ez2_scr_strerror(int err)
{
    switch (err) {
    case EZ2_SCR_OK:        return "ok";
    case EZ2_SCR_ERR_SHORT: return "too short";
    case EZ2_SCR_ERR_EMPTY: return "no .str references found";
    case EZ2_SCR_ERR_TYPE:  return "unknown record type";
    case EZ2_SCR_ERR_TRUNC: return "a section runs past the end of the file";
    case EZ2_SCR_ERR_MEM:   return "out of memory";
    default:                return "unknown error";
    }
}

static int lower(int c)
{
    return (c >= 'A' && c <= 'Z') ? c + ('a' - 'A') : c;
}

static int name_char(int c)
{
    return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
           (c >= '0' && c <= '9') || c == '_' || c == '-' || c == ' ' ||
           c == '.' || c == '&' || c == '\'' || c == '(' || c == ')' ||
           c == '+' || c == '!' || c == '~' || c == '@' || c == '#' ||
           c == '$' || c == '%' || c == '=' || c == '[' || c == ']';
}

/* Is the last extension of this name one a scene record can reference?
 * ".str" is the norm; ".bmp" occurs (bg/frantic/sdfdsfsdf.scr names
 * "back-tile.bmp" directly); no extension at all occurs too, in both the
 * legacy files and at least one SCR0 file (bg/rdm/old.error/rdm.scr names
 * "BACK"). Anything else is not a record, it is stray text. */
static int ext_ok(const unsigned char *d, size_t o, size_t len)
{
    size_t i;
    int dot = -1;

    for (i = 0; i < len; i++)
        if (d[o + i] == '.')
            dot = (int)i;
    if (dot < 0)
        return 1;                               /* bare stem */
    if (len - (size_t)dot != 4)
        return 0;
    return (lower(d[o + dot + 1]) == 's' && lower(d[o + dot + 2]) == 't' &&
            lower(d[o + dot + 3]) == 'r') ||
           (lower(d[o + dot + 1]) == 'b' && lower(d[o + dot + 2]) == 'm' &&
            lower(d[o + dot + 3]) == 'p');
}

/* Does a scene-record name start here? Returns its length, or 0. */
static size_t name_at(const unsigned char *d, size_t n, size_t o)
{
    size_t len = 0;

    while (o + len < n && len < EZ2_SCR_NAME && d[o + len] != 0) {
        if (!name_char(d[o + len]))
            return 0;
        len++;
    }
    if (o + len >= n || d[o + len] != 0)
        return 0;                               /* unterminated */
    if (len < 3)
        return 0;
    return ext_ok(d, o, len) ? len : 0;
}

/* ---- the structural walk, read off the parser @0x41b680 --------------------
 *
 * The engine's fix-up pass walks TEN sections, each `[u32 size][u32 count]`
 * followed by `count` records, and dispatches on the record's second word:
 *
 *     type 1      8 bytes, no name        falls straight to the next record
 *     type 2, 3   136 bytes, name at +8   strcat ".str", loadStr  @0x402de0
 *     type 4, 5   164 bytes, name at +36  strcat ".bmp", loadTex  @0x408d00
 *
 * Anything else is a hard error there (it logs and returns 0), and is here.
 *
 * VERIFIED, not inferred: walking every SCR0 file in the shipped tree this way
 * lands EXACTLY on the last byte in 294 of 294. A size-based heuristic cannot
 * make that claim, which is why this replaced one.
 *
 * The `size` word is the tool's, and the engine never checks it - it overwrites
 * the header with pointers instead. Just as well: it is computed with 144 for
 * a type-4/5 record where the engine advances 164, so it is short by exactly
 * 20 per such record in 23 of the library's 2,940 section headers. Do not
 * validate against it. */
static int rec_size(unsigned int type)
{
    switch (type) {
    case 1:            return 8;
    case 2: case 3:    return 8 + 128;
    case 4: case 5:    return 8 + 156;
    default:           return 0;         /* not a record type */
    }
}

/* Where the name sits inside a record, or 0 for one that carries none. */
static int rec_name_off(unsigned int type)
{
    switch (type) {
    case 2: case 3:    return 8;
    case 4: case 5:    return 36;        /* ebp = record + 0x24 @0x41b751 */
    default:           return 0;
    }
}

static int push_event(ez2_scr *out, int *cap, unsigned int tick,
                      unsigned int type, int section,
                      const unsigned char *name, size_t namelen)
{
    ez2_scr_event *e;

    if (out->count == *cap) {
        ez2_scr_event *bigger = (ez2_scr_event *)realloc(
            out->events, (size_t)*cap * 2 * sizeof *out->events);
        if (bigger == 0)
            return 0;
        out->events = bigger;
        *cap *= 2;
    }
    e = &out->events[out->count++];
    e->tick    = tick;
    e->type    = type;
    e->section = section;
    if (namelen >= EZ2_SCR_NAME)
        namelen = EZ2_SCR_NAME - 1;
    memcpy(e->name, name, namelen);
    e->name[namelen] = 0;
    return 1;
}

static int parse_sections(const unsigned char *d, size_t n, ez2_scr *out,
                          int *cap)
{
    size_t o = 12;                       /* `lea 0x6a0(%ecx),%esi; add $0xc` */
    int sec;

    for (sec = 0; sec < EZ2_SCR_SECTIONS; sec++) {
        unsigned int count;
        int i;

        if (o + 8 > n)
            return EZ2_SCR_ERR_SHORT;
        count = ez2_rd32(d + o + 4);         /* the size word at +0 is ignored */
        o += 8;
        if (count > 0x100000)
            return EZ2_SCR_ERR_TRUNC;
        out->section_count[sec] = (int)count;

        for (i = 0; i < (int)count; i++) {
            unsigned int tick, type;
            int size, noff;
            size_t len = 0;

            if (o + 8 > n)
                return EZ2_SCR_ERR_TRUNC;
            tick = ez2_rd32(d + o);
            type = ez2_rd32(d + o + 4);
            size = rec_size(type);
            if (size == 0)
                return EZ2_SCR_ERR_TYPE;
            if (o + (size_t)size > n)
                return EZ2_SCR_ERR_TRUNC;

            noff = rec_name_off(type);
            if (noff) {
                const unsigned char *nm = d + o + noff;
                size_t room = (size_t)size - (size_t)noff;
                while (len < room && nm[len] != 0)
                    len++;
                if (!push_event(out, cap, tick, type, sec, nm, len))
                    return EZ2_SCR_ERR_MEM;
            } else if (!push_event(out, cap, tick, type, sec,
                                   (const unsigned char *)"", 0)) {
                return EZ2_SCR_ERR_MEM;
            }
            o += (size_t)size;
        }
    }
    return EZ2_SCR_OK;
}

void ez2_scr_free(ez2_scr *s)
{
    if (s == 0)
        return;
    free(s->events);
    s->events = 0;
    s->count = 0;
}

int ez2_scr_parse(const unsigned char *data, size_t n, ez2_scr *out)
{
    size_t o;
    int cap = 64, rc;

    memset(out, 0, sizeof *out);
    if (n < 12)
        return EZ2_SCR_ERR_SHORT;

    out->has_magic = (memcmp(data, "SCR0", 4) == 0);

    out->events = (ez2_scr_event *)malloc((size_t)cap * sizeof *out->events);
    if (out->events == 0)
        return EZ2_SCR_ERR_MEM;

    if (out->has_magic) {
        rc = parse_sections(data, n, out, &cap);
        if (rc != EZ2_SCR_OK) {
            ez2_scr_free(out);
            return rc;
        }
        return EZ2_SCR_OK;               /* an empty scene is a valid scene */
    }

    /* THE HEADERLESS LEGACY FILES ONLY. Twelve of the library's 314 have no
     * magic and the section walk has nothing to anchor on, so they keep the
     * old heuristic: find a plausible name and read the two words in front of
     * it. It cannot report sections, and does not pretend to. */
    for (o = 8; o < n; o++) {
        size_t len = name_at(data, n, o);
        unsigned int type;

        if (len == 0)
            continue;

        /* The type word is the second check, and it is what lets the name rule
         * above stay loose enough for bare stems: a real record's type is a
         * small enum, while four bytes of ASCII read as a u32 never is. */
        type = ez2_rd32(data + o - 4);
        if (type > 255)
            continue;

        if (!push_event(out, &cap, ez2_rd32(data + o - 8), type, -1,
                        data + o, len)) {
            ez2_scr_free(out);
            return EZ2_SCR_ERR_MEM;
        }
        o += len;                /* a substring inside a name cannot re-match */
    }

    if (out->count == 0) {
        ez2_scr_free(out);
        return EZ2_SCR_ERR_EMPTY;
    }
    return EZ2_SCR_OK;
}

void ez2_scr_state_at(const ez2_scr *s, unsigned int tick, int *out)
{
    int i;

    if (out == 0)
        return;
    for (i = 0; i < EZ2_SCR_SECTIONS; i++)
        out[i] = -1;
    if (s == 0)
        return;

    /* One forward pass. The events are stored in section order and, within a
     * section, in the order the file lists them - which is the order the
     * cursor walks, so "the last one whose tick has arrived" is just the last
     * one seen. A type-1 record clears its section, exactly as @0x402890 does
     * to the player. */
    for (i = 0; i < s->count; i++) {
        const ez2_scr_event *e = &s->events[i];

        if (e->section < 0 || e->section >= EZ2_SCR_SECTIONS)
            continue;
        if (e->tick > tick)
            continue;
        out[e->section] = (e->type == EZ2_SCR_CONTROL) ? -1 : i;
    }
}

int ez2_scr_asset_name(const char *record_name, const char *ext,
                       char *out, size_t n)
{
    const char *dot;
    size_t stem, elen;

    if (record_name == 0 || ext == 0 || out == 0 || n == 0)
        return 0;

    dot = strchr(record_name, '.');
    stem = dot ? (size_t)(dot - record_name) : strlen(record_name);
    elen = strlen(ext);
    if (stem + elen + 1 > n)
        return 0;

    memcpy(out, record_name, stem);
    memcpy(out + stem, ext, elen + 1);
    return 1;
}

/* ---- the EZ2DJ 1st background format (header comment in scr.h) ----------- */

/* Copy a NUL-terminated name out of a fixed-size payload, defensively: the
 * engine strcpy()s and trusts the file; a port clamps at the payload edge. */
static void scr1_name(const unsigned char *p, size_t payload, char *out)
{
    size_t k;

    for (k = 0; k < payload && k < EZ2_SCR_NAME - 1 && p[k] != 0; k++)
        out[k] = (char)p[k];
    out[k] = 0;
}

static int scr1_walk(const unsigned char *d, size_t n, ez2_scr1 *out)
{
    size_t o;
    int frames, i, j;

    if (d == 0 || n < 4)
        return EZ2_SCR_ERR_SHORT;
    if (n >= 4 && memcmp(d, "SCR0", 4) == 0)
        return EZ2_SCR_ERR_SHORT;    /* the other parser's file */

    frames = (int)ez2_rd32(d);
    if (frames < 0 || (unsigned)frames > n / 12)
        return EZ2_SCR_ERR_TRUNC;    /* 12 = the smallest possible frame */
    o = 4;

    if (out != 0) {
        out->frame_count = frames;
        out->frames = (ez2_scr1_frame *)calloc(frames ? (size_t)frames : 1,
                                               sizeof *out->frames);
        if (out->frames == 0)
            return EZ2_SCR_ERR_MEM;
    }

    for (i = 0; i < frames; i++) {
        ez2_scr1_frame *fr = out ? &out->frames[i] : 0;

        if (o + 8 > n)
            goto trunc;
        if (fr != 0) {
            fr->a = (int)ez2_rd32(d + o);
            fr->b = (int)ez2_rd32(d + o + 4);
        }
        o += 8;

        for (j = 0; j < 3; j++) {
            int kind;

            if (o + 4 > n)
                goto trunc;
            kind = (int)ez2_rd32(d + o);
            o += 4;
            if (fr != 0)
                fr->sub[j].kind = kind;

            if (kind == 1 || kind == 2) {
                size_t payload = (kind == 1) ? 0x84 : 0x80;

                if (o + payload > n)
                    goto trunc;
                if (fr != 0)
                    scr1_name(d + o, payload, fr->sub[j].name);
                o += payload;
            } else if (kind == 3 || kind == 4 || kind == 6) {
                if (o + 8 + 0x80 > n)
                    goto trunc;
                if (fr != 0) {
                    memcpy(fr->sub[j].prefix, d + o, 8);
                    scr1_name(d + o + 8, 0x80, fr->sub[j].name);
                }
                o += 8 + 0x80;
            } else if (kind != 0 && kind != 5) {
                if (out != 0)
                    ez2_scr1_free(out);
                return EZ2_SCR_ERR_TYPE;
            }
        }
    }
    return EZ2_SCR_OK;

trunc:
    if (out != 0)
        ez2_scr1_free(out);
    return EZ2_SCR_ERR_TRUNC;
}

int ez2_scr1_parse(const unsigned char *data, size_t n, ez2_scr1 *out)
{
    if (out == 0)
        return EZ2_SCR_ERR_SHORT;
    memset(out, 0, sizeof *out);
    return scr1_walk(data, n, out);
}

void ez2_scr1_free(ez2_scr1 *s)
{
    if (s == 0)
        return;
    free(s->frames);
    s->frames = 0;
    s->frame_count = 0;
}

int ez2_scr1_sniff(const unsigned char *data, size_t n)
{
    return scr1_walk(data, n, 0) == EZ2_SCR_OK;
}

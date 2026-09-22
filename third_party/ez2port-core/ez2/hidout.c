/* HID output reports. See hidout.h for why the flat index has to match
 * 2EZConfig's.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * The descriptor format is HID 1.11 section 6.2.2. A short item is a prefix
 * byte - size in bits 0-1 (0, 1, 2 or 4 bytes of data), type in bits 2-3, tag
 * in bits 4-7 - followed by its data, little-endian. 0xFE introduces a long
 * item, which nothing in the wild emits and which is skipped here by its own
 * length byte rather than refused.
 *
 * Three things have to be tracked to get a bit offset right, and getting any
 * of them wrong puts a lamp at the wrong bit:
 *
 *   - the global state (usage page, logical range, report size and count, the
 *     report ID) with its Push/Pop stack;
 *   - a SEPARATE bit cursor per report ID and per report TYPE. Input, Output
 *     and Feature reports are three different byte streams that happen to
 *     share a descriptor, so an Input item must advance the input cursor and
 *     leave the output one alone;
 *   - constant items, which are padding. Windows' parser does not report them
 *     as controls, but they still occupy bits.
 */
#include "hidout.h"

#include <stdio.h>
#include <string.h>

/* ---- the global/local item state ---------------------------------------- */

#define MAX_USAGES 256
#define MAX_STACK  8

typedef struct global_state {
    unsigned short usage_page;
    int            logical_min;
    int            logical_max;
    unsigned int   report_size;
    unsigned int   report_count;
    unsigned char  report_id;
} global_state;

/* One report id's three bit cursors. */
typedef struct id_cursor {
    unsigned char  id;
    unsigned int   bits[3];    /* 0 = input, 1 = output, 2 = feature */
} id_cursor;

#define MAX_IDS 16

typedef struct parser {
    global_state g;
    global_state stack[MAX_STACK];
    int          depth;

    /* Locals, cleared after every main item. */
    unsigned int usages[MAX_USAGES];   /* full 32-bit: page in the high half */
    int          usage_count;
    int          usage_min, usage_max;
    int          have_range;

    id_cursor    ids[MAX_IDS];
    int          id_count;

    ez2_hid_outputs *out;
    /* Values are collected separately and appended after the buttons, which is
     * what makes the flat index match 2EZConfig's. */
    ez2_hid_out  values[EZ2_HID_MAX_OUT];
    int          value_count;
    int          truncated;
} parser;

static id_cursor *cursor_for(parser *p, unsigned char id)
{
    int i;

    for (i = 0; i < p->id_count; i++) {
        if (p->ids[i].id == id)
            return &p->ids[i];
    }
    if (p->id_count >= MAX_IDS)
        return &p->ids[0];      /* absurd descriptor; keep parsing, stay in range */
    p->ids[p->id_count].id = id;
    p->ids[p->id_count].bits[0] = 0;
    p->ids[p->id_count].bits[1] = 0;
    p->ids[p->id_count].bits[2] = 0;
    return &p->ids[p->id_count++];
}

/* Little-endian, and SIGNED when the tag calls for it. Logical Minimum is
 * signed by the spec; Logical Maximum is signed only when the minimum was
 * negative, which is the convention every parser follows and the one that
 * keeps an 0..255 range from reading as 0..-1. */
static unsigned int item_data(const unsigned char *p, int size)
{
    switch (size) {
    case 1:  return p[0];
    case 2:  return (unsigned int)p[0] | ((unsigned int)p[1] << 8);
    case 4:  return (unsigned int)p[0] | ((unsigned int)p[1] << 8) |
                    ((unsigned int)p[2] << 16) | ((unsigned int)p[3] << 24);
    default: return 0;
    }
}

static int item_signed(const unsigned char *p, int size)
{
    unsigned int v = item_data(p, size);

    if (size == 1 && (v & 0x80u))
        return (int)(v | 0xffffff00u);
    if (size == 2 && (v & 0x8000u))
        return (int)(v | 0xffff0000u);
    return (int)v;
}

/* ---- the main item ------------------------------------------------------ */

/* Which usage the i-th control of this main item carries. The spec's rule: a
 * usage range enumerates, a usage list is taken in order, and when the list
 * runs short every remaining control repeats the LAST usage given. */
static unsigned int usage_at(const parser *p, unsigned int i)
{
    if (p->have_range) {
        unsigned int u = (unsigned int)p->usage_min + i;

        if ((int)u > p->usage_max)
            u = (unsigned int)p->usage_max;
        return u;
    }
    if (p->usage_count == 0)
        return 0;
    if (i < (unsigned int)p->usage_count)
        return p->usages[i];
    return p->usages[p->usage_count - 1];
}

/* A usage item may carry its page in the high 16 bits (a 4-byte usage) or
 * inherit the current Usage Page (1- or 2-byte). */
static unsigned short usage_page_of(const parser *p, unsigned int usage)
{
    if (usage & 0xffff0000u)
        return (unsigned short)(usage >> 16);
    return p->g.usage_page;
}

static void main_item(parser *p, int tag, unsigned int flags)
{
    int type;               /* 0 input, 1 output, 2 feature */
    id_cursor *cur;
    unsigned int i;
    unsigned int offset;

    if (tag == 0x8)
        type = 0;
    else if (tag == 0x9)
        type = 1;
    else if (tag == 0xb)
        type = 2;
    else
        return;             /* Collection / End Collection: no bits */

    cur    = cursor_for(p, p->g.report_id);
    offset = cur->bits[type];
    cur->bits[type] += p->g.report_size * p->g.report_count;

    /* Constant means padding - it takes up bits, it is not a control. And an
     * ARRAY item (bit 1 clear) reports an index, not one control per usage;
     * neither is something a light binding can address, and Windows does not
     * offer them as outputs either. */
    if (type != 1)
        return;
    if (flags & 0x01)
        return;
    if (!(flags & 0x02))
        return;

    for (i = 0; i < p->g.report_count; i++) {
        unsigned int u = usage_at(p, i);
        ez2_hid_out e;

        memset(&e, 0, sizeof(e));
        e.usage_page  = usage_page_of(p, u);
        e.usage       = (unsigned short)(u & 0xffffu);
        e.report_id   = p->g.report_id;
        e.bit_offset  = (unsigned short)(offset + i * p->g.report_size);
        e.bit_size    = (unsigned char)p->g.report_size;
        e.logical_min = p->g.logical_min;
        e.logical_max = p->g.logical_max;
        /* Windows splits its two cap lists the same way: a one-bit control is
         * a button, anything wider is a value. */
        e.is_button   = (p->g.report_size == 1);

        if (e.is_button) {
            if (p->out->count >= EZ2_HID_MAX_OUT) {
                p->truncated = 1;
                continue;
            }
            p->out->out[p->out->count++] = e;
            p->out->button_count++;
        } else {
            if (p->value_count >= EZ2_HID_MAX_OUT) {
                p->truncated = 1;
                continue;
            }
            p->values[p->value_count++] = e;
        }
    }
}

/* ---- the walk ----------------------------------------------------------- */

int ez2_hid_parse(const unsigned char *desc, size_t n, ez2_hid_outputs *o)
{
    parser p;
    size_t at = 0;
    int i;

    if (!desc || !o)
        return EZ2_HID_ERR_ARG;

    memset(o, 0, sizeof(*o));
    memset(&p, 0, sizeof(p));
    p.out = o;
    /* The spec's defaults. */
    p.g.logical_min  = 0;
    p.g.logical_max  = 0;
    p.g.report_size  = 0;
    p.g.report_count = 0;
    p.g.report_id    = 0;

    while (at < n) {
        unsigned char prefix = desc[at];
        int size, type, tag;

        if (prefix == 0xfe) {                 /* long item */
            unsigned char dsize;

            if (at + 3 > n)
                return EZ2_HID_ERR_DESC;
            dsize = desc[at + 1];
            if (at + 3 + dsize > n)
                return EZ2_HID_ERR_DESC;
            at += 3 + dsize;
            continue;
        }

        size = prefix & 0x03;
        if (size == 3)
            size = 4;
        type = (prefix >> 2) & 0x03;
        tag  = (prefix >> 4) & 0x0f;

        if (at + 1 + (size_t)size > n)
            return EZ2_HID_ERR_DESC;
        at++;

        if (type == 0) {                      /* Main */
            main_item(&p, tag, item_data(desc + at, size));
            /* Locals do not survive a main item. */
            p.usage_count = 0;
            p.have_range  = 0;
        } else if (type == 1) {               /* Global */
            switch (tag) {
            case 0x0: p.g.usage_page   = (unsigned short)item_data(desc + at, size); break;
            case 0x1: p.g.logical_min  = item_signed(desc + at, size); break;
            case 0x2:
                p.g.logical_max = (p.g.logical_min < 0)
                                ? item_signed(desc + at, size)
                                : (int)item_data(desc + at, size);
                break;
            case 0x7: p.g.report_size  = item_data(desc + at, size); break;
            case 0x8:
                p.g.report_id = (unsigned char)item_data(desc + at, size);
                o->uses_ids   = 1;
                break;
            case 0x9: p.g.report_count = item_data(desc + at, size); break;
            case 0xa:                          /* Push */
                if (p.depth < MAX_STACK)
                    p.stack[p.depth++] = p.g;
                break;
            case 0xb:                          /* Pop */
                if (p.depth > 0)
                    p.g = p.stack[--p.depth];
                break;
            default: break;                    /* physical range, unit, exponent */
            }
        } else if (type == 2) {               /* Local */
            switch (tag) {
            case 0x0:
                if (p.usage_count < MAX_USAGES)
                    p.usages[p.usage_count++] = item_data(desc + at, size);
                break;
            case 0x1:
                p.usage_min  = (int)item_data(desc + at, size);
                p.have_range = 1;
                break;
            case 0x2:
                p.usage_max  = (int)item_data(desc + at, size);
                p.have_range = 1;
                break;
            default: break;                    /* designators, strings, delimiters */
            }
        }
        at += (size_t)size;
    }

    /* The values go after the buttons - that ordering IS the flat index. */
    for (i = 0; i < p.value_count; i++) {
        if (o->count >= EZ2_HID_MAX_OUT) {
            p.truncated = 1;
            break;
        }
        o->out[o->count++] = p.values[i];
    }
    o->truncated = p.truncated;

    /* One report entry per id that carries output bits, sized up from the
     * cursor. A report is whole bytes even when its last field is not. */
    for (i = 0; i < p.id_count; i++) {
        unsigned int bits = p.ids[i].bits[1];

        if (bits == 0)
            continue;
        if (o->report_count >= EZ2_HID_MAX_REPORTS)
            break;
        o->report[o->report_count].id   = p.ids[i].id;
        o->report[o->report_count].bits = (unsigned short)bits;
        o->report_count++;
    }

    return o->count;
}

/* ---- the live state ----------------------------------------------------- */

int ez2_hid_out_set(ez2_hid_outputs *o, int index, float value)
{
    if (!o || index < 0 || index >= o->count)
        return 0;
    if (value < 0.0f)
        value = 0.0f;
    if (value > 1.0f)
        value = 1.0f;
    o->value[index] = value;
    return 1;
}

void ez2_hid_out_clear(ez2_hid_outputs *o)
{
    int i;

    if (!o)
        return;
    for (i = 0; i < o->count; i++)
        o->value[i] = 0.0f;
}

/* Write `bits` bits of `v` at `off` in a little-endian bit stream - the order
 * HID packs fields in, least significant bit of the byte first. */
static void put_bits(unsigned char *buf, size_t bytes,
                     unsigned int off, unsigned int bits, unsigned int v)
{
    unsigned int i;

    for (i = 0; i < bits; i++) {
        unsigned int at = off + i;

        if (at / 8 >= bytes)
            return;
        if (v & (1u << i))
            buf[at / 8] |= (unsigned char)(1u << (at % 8));
        else
            buf[at / 8] &= (unsigned char)~(1u << (at % 8));
    }
}

int ez2_hid_out_report(const ez2_hid_outputs *o, int slot,
                       unsigned char *buf, size_t n)
{
    const ez2_hid_report *r;
    size_t payload, total, head;
    int i;

    if (!o || !buf || slot < 0 || slot >= o->report_count)
        return 0;

    r       = &o->report[slot];
    payload = ((size_t)r->bits + 7u) / 8u;
    head    = o->uses_ids ? 1u : 0u;
    total   = head + payload;
    if (total > n || total > EZ2_HID_MAX_REPORT_BYTES)
        return 0;

    memset(buf, 0, total);
    if (head)
        buf[0] = r->id;

    for (i = 0; i < o->count; i++) {
        const ez2_hid_out *e = &o->out[i];
        unsigned int raw;

        if (e->report_id != r->id)
            continue;

        if (e->is_button) {
            raw = (o->value[i] > 0.5f) ? 1u : 0u;
        } else {
            /* The same scaling deviceWriteOutput does: the 0..1 state across
             * the declared logical range, rounded and clamped. */
            int lo = e->logical_min, hi = e->logical_max;
            long span, v;

            if (hi <= lo) {
                raw = (unsigned int)lo;
            } else {
                span = (long)hi - (long)lo;
                v    = (long)lo + (long)(o->value[i] * (float)span + 0.5f);
                if (v > hi)
                    v = hi;
                if (v < lo)
                    v = lo;
                raw = (unsigned int)v;
            }
        }
        put_bits(buf + head, payload, e->bit_offset, e->bit_size, raw);
    }
    return (int)total;
}

/* ---- naming ------------------------------------------------------------- */

const char *ez2_hid_out_label(const ez2_hid_outputs *o, int index,
                              char *buf, size_t n)
{
    const ez2_hid_out *e;

    if (!buf || n == 0)
        return "";
    buf[0] = 0;
    if (!o || index < 0 || index >= o->count)
        return buf;

    e = &o->out[index];
    /* Two pages cover every lighting board worth binding: 0x09 Button, where
     * the usage IS the lamp number, and 0x08 LED. Anything else prints its
     * numbers, which is more useful than a wrong guess. */
    if (e->usage_page == 0x09)
        snprintf(buf, n, "Button %u", (unsigned)e->usage);
    else if (e->usage_page == 0x08)
        snprintf(buf, n, "LED 0x%02x", (unsigned)e->usage);
    else
        snprintf(buf, n, "Page 0x%02x usage 0x%02x",
                 (unsigned)e->usage_page, (unsigned)e->usage);
    return buf;
}

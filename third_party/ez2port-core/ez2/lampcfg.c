/* The light binding file. See lampcfg.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * Self-contained on purpose: no SDL, no hidapi, no device access. A binding is
 * text, and this parses it - which is what lets the whole thing be tested on a
 * machine with nothing plugged in.
 */
#include "lampcfg.h"
#include "util.h"

#include "cfgdir.h"

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void ez2_lampcfg_defaults(ez2_lampcfg *c)
{
    int i;

    if (!c)
        return;
    /* The WHOLE struct, not just the first byte of each name. Two binding sets
     * built the same way have to compare equal - a caller checking whether the
     * file on disk still matches what it has in hand should not be defeated by
     * whatever was on the stack behind a short device key. */
    memset(c, 0, sizeof(*c));
    for (i = 0; i < EZ2_LAMP_CHANNELS; i++) {
        c->light[i].device[0] = 0;
        c->light[i].output    = -1;
    }
}

int ez2_lampcfg_path(char *out, size_t n)
{
    return ez2_cfgfile("lights.ini", out, n);
}

int ez2_lampcfg_bind(ez2_lampcfg *c, int channel, const char *device, int output)
{
    size_t len;

    if (!c || channel < 0 || channel >= EZ2_LAMP_CHANNELS)
        return 0;
    if (!device || !device[0] || output < 0) {
        memset(c->light[channel].device, 0, sizeof(c->light[channel].device));
        c->light[channel].output = -1;
        return 1;
    }
    /* A device key is `vid:pid` with an optional `#n` - eleven characters at
     * the outside. Something longer is not a device key, and TRUNCATING it
     * would bind the lamp to whatever the prefix happens to name, which is the
     * silent-wrong-lamp failure again. Refuse it instead. */
    len = strlen(device);
    if (len + 1 > sizeof(c->light[channel].device))
        return 0;
    memset(c->light[channel].device, 0, sizeof(c->light[channel].device));
    memcpy(c->light[channel].device, device, len);
    c->light[channel].output = output;
    return 1;
}

int ez2_lampcfg_count(const ez2_lampcfg *c)
{
    int i, n = 0;

    if (!c)
        return 0;
    for (i = 0; i < EZ2_LAMP_CHANNELS; i++) {
        if (c->light[i].device[0] && c->light[i].output >= 0)
            n++;
    }
    return n;
}

/* ---- reading ------------------------------------------------------------ */

/* A light name may contain spaces ("P1 Turntable"), so the key is everything
 * left of the first '=' with its edges trimmed - not the first token. */
int ez2_lampcfg_parse(const char *text, size_t n, ez2_lampcfg *c, int *bad_line)
{
    size_t at = 0;
    int line = 0, bound = 0;

    if (bad_line)
        *bad_line = 0;
    if (!text || !c)
        return EZ2_LAMPCFG_ERR_ARG;

    while (at < n) {
        char buf[256];
        size_t len = 0;
        char *eq, *comma;
        int channel, output;

        while (at < n && text[at] != '\n') {
            if (len + 1 < sizeof(buf))
                buf[len++] = text[at];
            at++;
        }
        if (at < n)
            at++;                       /* the newline */
        buf[len] = 0;
        line++;

        /* A comment runs to the end of the line, and `;` is the ONLY marker.
         *
         * keys.ini takes `#` as well; this file cannot, because `#` is part of
         * the device key - `0810:e501#1` is the second board of that make, and
         * treating it as a comment silently binds the lamp to the first one.
         * That is exactly the failure this format is trying not to have: a
         * binding that reads fine and drives the wrong lamp. `;` is enough,
         * and no light name or device key contains one. */
        {
            char *h = strchr(buf, ';');

            if (h)
                *h = 0;
        }
        ez2_trim(buf);
        if (!buf[0])
            continue;
        if (buf[0] == '[')              /* the section header, and any other */
            continue;

        eq = strchr(buf, '=');
        if (!eq) {
            if (bad_line && !*bad_line)
                *bad_line = line;
            continue;
        }
        *eq = 0;
        ez2_trim(buf);

        channel = ez2_lamp_from_name(buf);
        if (channel < 0) {
            if (bad_line && !*bad_line)
                *bad_line = line;
            continue;
        }

        /* `<device>, <output>` - the device may not contain a comma, and does
         * not: it is `vid:pid` with an optional `#n`. */
        {
            char value[128];

            snprintf(value, sizeof(value), "%s", eq + 1);
            ez2_trim(value);
            comma = strrchr(value, ',');
            if (!comma) {
                if (bad_line && !*bad_line)
                    *bad_line = line;
                continue;
            }
            *comma = 0;
            ez2_trim(value);

            {
                char *end = 0;
                long v;
                char idx[64];

                snprintf(idx, sizeof(idx), "%s", comma + 1);
                ez2_trim(idx);
                v = strtol(idx, &end, 10);
                if (end == idx || (end && *end) || v < 0 || v > 0xffff) {
                    if (bad_line && !*bad_line)
                        *bad_line = line;
                    continue;
                }
                output = (int)v;
            }
            if (!value[0]) {
                if (bad_line && !*bad_line)
                    *bad_line = line;
                continue;
            }
            ez2_lampcfg_bind(c, channel, value, output);
            bound++;
        }
    }
    return bound;
}

int ez2_lampcfg_load(const char *path, ez2_lampcfg *c, int *bad_line)
{
    FILE *f;
    char *text;
    long size;
    int r;

    if (bad_line)
        *bad_line = 0;
    if (!path || !c)
        return EZ2_LAMPCFG_ERR_ARG;

    f = fopen(path, "rb");
    if (!f)
        return EZ2_LAMPCFG_ABSENT;
    if (fseek(f, 0, SEEK_END) != 0) {
        fclose(f);
        return EZ2_LAMPCFG_ERR_READ;
    }
    size = ftell(f);
    if (size < 0) {
        fclose(f);
        return EZ2_LAMPCFG_ERR_READ;
    }
    rewind(f);
    text = (char *)malloc((size_t)size + 1);
    if (!text) {
        fclose(f);
        return EZ2_LAMPCFG_ERR_READ;
    }
    if (size > 0 && fread(text, 1, (size_t)size, f) != (size_t)size) {
        free(text);
        fclose(f);
        return EZ2_LAMPCFG_ERR_READ;
    }
    fclose(f);
    text[size] = 0;

    r = ez2_lampcfg_parse(text, (size_t)size, c, bad_line);
    free(text);
    return r;
}

/* ---- writing ------------------------------------------------------------ */

/* Channel order, so the file reads the way the cabinet is laid out rather than
 * the way the enum happens to be numbered: the two starts, then each player's
 * row, then the shared bank, then the cabinet's own lamps. */
static const signed char g_write_order[] = {
    EZ2_LAMP_P1_START, EZ2_LAMP_P2_START,
    EZ2_LAMP_P1_1, EZ2_LAMP_P1_2, EZ2_LAMP_P1_3, EZ2_LAMP_P1_4, EZ2_LAMP_P1_5,
    EZ2_LAMP_P1_TT,
    EZ2_LAMP_P2_1, EZ2_LAMP_P2_2, EZ2_LAMP_P2_3, EZ2_LAMP_P2_4, EZ2_LAMP_P2_5,
    EZ2_LAMP_P2_TT,
    EZ2_LAMP_EFFECT1, EZ2_LAMP_EFFECT2, EZ2_LAMP_EFFECT3, EZ2_LAMP_EFFECT4,
    EZ2_LAMP_NEON,
    EZ2_LAMP_RED_L, EZ2_LAMP_RED_R, EZ2_LAMP_BLUE_L, EZ2_LAMP_BLUE_R
};

/* A tiny appender so the formatter can report the length it WOULD have needed
 * without writing past `n`, the way snprintf does. */
typedef struct sink {
    char  *out;
    size_t n;
    size_t at;
} sink;

static void emit(sink *s, const char *fmt, ...)
{
    va_list ap;
    char line[256];
    int len;

    va_start(ap, fmt);
    len = vsnprintf(line, sizeof(line), fmt, ap);
    va_end(ap);
    if (len < 0)
        return;
    if (s->out && s->at < s->n) {
        size_t room = s->n - s->at;
        size_t take = ((size_t)len < room - 1) ? (size_t)len : room - 1;

        memcpy(s->out + s->at, line, take);
        s->out[s->at + take] = 0;
    }
    s->at += (size_t)len;
}

int ez2_lampcfg_format(const ez2_lampcfg *c, char *out, size_t n)
{
    sink s;
    size_t i;

    if (!c)
        return 0;
    s.out = out;
    s.n   = n;
    s.at  = 0;
    if (out && n)
        out[0] = 0;

    emit(&s, "; ez2port light bindings - which output drives which lamp.\n");
    emit(&s, ";\n");
    emit(&s, "; <light name> = <vid:pid>[#n], <output index>\n");
    emit(&s, ";\n");
    emit(&s, "; The names and the output numbering are 2EZConfig's, so a\n");
    emit(&s, "; binding worked out there carries over unchanged. `ez2lights\n");
    emit(&s, "; --list` prints every board it finds and every output on it.\n");
    emit(&s, "\n[Lights]\n");

    for (i = 0; i < sizeof(g_write_order) / sizeof(g_write_order[0]); i++) {
        int ch = g_write_order[i];
        const ez2_lampbind *b = &c->light[ch];
        const char *name = ez2_lamp_name(ch);

        if (!name)
            continue;
        if (b->device[0] && b->output >= 0)
            emit(&s, "%-13s= %s, %d\n", name, b->device, b->output);
        else
            emit(&s, ";%-12s=\n", name);
    }
    return (int)s.at + 1;
}

int ez2_lampcfg_save(const char *path, const ez2_lampcfg *c)
{
    FILE *f;
    char *text;
    int need;

    if (!path || !c)
        return 0;
    need = ez2_lampcfg_format(c, 0, 0);
    if (need <= 0)
        return 0;
    text = (char *)malloc((size_t)need);
    if (!text)
        return 0;
    ez2_lampcfg_format(c, text, (size_t)need);

    f = fopen(path, "wb");
    if (!f) {
        free(text);
        return 0;
    }
    fputs(text, f);
    fclose(f);
    free(text);
    return 1;
}

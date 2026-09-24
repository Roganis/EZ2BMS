/* The game's own bitmap fonts. See font.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "font.h"
#include "vfs.h"

#include <stdio.h>
#include <string.h>

static int slurp_exact(const char *path, void *out, size_t want)
{
    FILE *f;
    size_t got;

    if (path == 0)
        return 0;
    f = fopen(path, "rb");
    if (f == 0)
        return 0;
    got = fread(out, 1, want, f);
    fclose(f);
    return got == want;
}

int ez2_font_load_files(const char *en_path, const char *kr_path,
                        ez2_font *out)
{
    unsigned char en[EZ2_FONT_EN_FILE];
    int i;

    if (out == 0)
        return 0;
    memset(out, 0, sizeof *out);

    if (slurp_exact(en_path, en, sizeof en)) {
        memcpy(out->ascii, en, EZ2_FONT_ASCII_BYTES);
        /* The advances follow the bitmap as 128 little-endian ints - the
         * second `read` of loadAsciiFont @0x407120. */
        for (i = 0; i < EZ2_FONT_ASCII_GLYPHS; i++) {
            const unsigned char *p = en + EZ2_FONT_ASCII_BYTES + i * 4;
            out->advance[i] = (int)((unsigned)p[0] | ((unsigned)p[1] << 8) |
                                    ((unsigned)p[2] << 16) |
                                    ((unsigned)p[3] << 24));
        }
        out->have_ascii = 1;
    }
    if (slurp_exact(kr_path, out->kr, sizeof out->kr))
        out->have_kr = 1;

    return out->have_ascii || out->have_kr;
}

int ez2_font_load(const char *root, ez2_font *out)
{
    char en[2048], kr[2048];
    int have_en, have_kr;

    if (out == 0)
        return 0;
    memset(out, 0, sizeof *out);
    if (root == 0)
        return 0;

    have_en = ez2_vfs_path(en, sizeof en, root, "system", "common",
                           "fontEn.dat", (const char *)0);
    have_kr = ez2_vfs_path(kr, sizeof kr, root, "system", "common",
                           "fontkr.dat", (const char *)0);

    return ez2_font_load_files(have_en ? en : 0, have_kr ? kr : 0, out);
}

int ez2_font_next(const ez2_font *f, const char **s, ez2_glyph *g)
{
    const unsigned char *p;
    unsigned lead;

    if (f == 0 || s == 0 || *s == 0 || g == 0)
        return 0;
    p = (const unsigned char *)*s;
    if (*p == 0)
        return 0;

    memset(g, 0, sizeof *g);
    lead = *p;

    if ((lead & 0x80u) == 0) {
        /* ASCII: 8x16, its own advance, drawn from g_asciiBits[ch * 16]. */
        g->code    = (int)lead;
        g->stride  = 1;
        g->w       = 8;
        g->h       = 16;
        g->advance = f->advance[lead];
        if (f->have_ascii)
            g->bits = f->ascii + lead * 16;
        *s += 1;
        return 1;
    }

    /* A double-byte lead. Every one of them advances 15 pixels, whether or not
     * a glyph comes out - see font.h's two oddities. */
    g->stride  = 2;
    g->w       = 16;
    g->h       = 16;
    g->advance = EZ2_FONT_KR_ADVANCE;

    if (lead > 0xCAu) {
        /* FAITHFUL: the trail byte is NOT consumed (@0x406f8a jumps past the
         * `add $1,%ebx`), so it is read as the next character. */
        g->code = (int)lead;
        *s += 1;
        return 1;
    }

    {
        unsigned trail = p[1];
        long index;

        g->code = (int)((lead << 8) | trail);
        *s += (trail != 0) ? 2 : 1;

        /* glyph = (lead - 0xB0) * 94 + (trail - 0xA1), which the original
         * folds into one `lea` against 0x4141. Below 0xB0 that goes negative
         * and the blitters reject it, leaving a 15px blank. */
        index = (long)lead * 94 + (long)trail - 16705;
        if (f->have_kr && index >= 0 && index < EZ2_FONT_KR_GLYPHS)
            g->bits = f->kr + index * 32;
    }
    return 1;
}

int ez2_font_pixel(const ez2_glyph *g, int x, int y)
{
    unsigned char row;

    if (g == 0 || g->bits == 0)
        return 0;
    if (x < 0 || y < 0 || x >= g->w || y >= g->h)
        return 0;

    row = g->bits[y * g->stride + (x >> 3)];
    /* LSB FIRST: the mask table at 0x487c64 is 01 02 04 08 10 20 40 80, so
     * bit 0 is the leftmost column. */
    return (row & (unsigned char)(1u << (x & 7))) != 0;
}

int ez2_font_text_width(const ez2_font *f, const char *s)
{
    ez2_glyph g;
    int w = 0;

    while (ez2_font_next(f, &s, &g))
        w += g.advance;
    return w;
}

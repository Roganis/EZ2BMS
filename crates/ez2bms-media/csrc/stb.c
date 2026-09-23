/* stb_truetype for the plate renderer (src/text.rs), behind an opaque face
 * handle so Rust never has to know stbtt_fontinfo's layout. Only calls the
 * port's renderer makes (ez2/ttf.c ez2_ttf_render_box) are exposed: the
 * plates are meant to come out byte for byte as EZ2PORT's.
 *
 * The font bytes are the caller's and must outlive the face. stb_truetype
 * does no range checking, so only the fonts EZ2BMS ships are opened. */
#define STB_TRUETYPE_IMPLEMENTATION
#define STBTT_STATIC
#include "stb_truetype.h"

typedef struct ez2bms_face {
    stbtt_fontinfo info;
} ez2bms_face;

int ez2bms_stb_face_count(const unsigned char *data)
{
    return stbtt_GetNumberOfFonts(data);
}

/* Face `index` of a font or collection, or NULL. */
ez2bms_face *ez2bms_stb_open(const unsigned char *data, int index)
{
    ez2bms_face *f;
    int offset = stbtt_GetFontOffsetForIndex(data, index);

    if (offset < 0)
        return 0;
    f = (ez2bms_face *)malloc(sizeof *f);
    if (!f)
        return 0;
    if (!stbtt_InitFont(&f->info, data, offset)) {
        free(f);
        return 0;
    }
    return f;
}

void ez2bms_stb_close(ez2bms_face *f)
{
    free(f);
}

int ez2bms_stb_glyph(const ez2bms_face *f, int cp)
{
    return stbtt_FindGlyphIndex(&f->info, cp);
}

int ez2bms_stb_codepoint_box(const ez2bms_face *f, int cp, int *x0, int *y0, int *x1, int *y1)
{
    return stbtt_GetCodepointBox(&f->info, cp, x0, y0, x1, y1);
}

void ez2bms_stb_vmetrics(const ez2bms_face *f, int *ascent, int *descent, int *gap)
{
    stbtt_GetFontVMetrics(&f->info, ascent, descent, gap);
}

void ez2bms_stb_hmetrics(const ez2bms_face *f, int cp, int *advance, int *lsb)
{
    stbtt_GetCodepointHMetrics(&f->info, cp, advance, lsb);
}

int ez2bms_stb_kern(const ez2bms_face *f, int a, int b)
{
    return stbtt_GetCodepointKernAdvance(&f->info, a, b);
}

void ez2bms_stb_bitmap_box(const ez2bms_face *f, int cp, float sx, float sy, float shift_x,
                           float shift_y, int *x0, int *y0, int *x1, int *y1)
{
    stbtt_GetCodepointBitmapBoxSubpixel(&f->info, cp, sx, sy, shift_x, shift_y, x0, y0, x1, y1);
}

void ez2bms_stb_bitmap(const ez2bms_face *f, unsigned char *out, int w, int h, int stride,
                       float sx, float sy, float shift_x, float shift_y, int cp)
{
    stbtt_MakeCodepointBitmapSubpixel(&f->info, out, w, h, stride, sx, sy, shift_x, shift_y, cp);
}

/* TrueType text - see ttf.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE. */
#include "ttf.h"
#include "file.h"

#define STB_TRUETYPE_IMPLEMENTATION
#define STBTT_STATIC
#include <stb_truetype.h>   /* third_party/, a SYSTEM include in CMakeLists.txt */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static char g_dir[1024];

void ez2_ttf_set_dir(const char *dir)
{
    if (dir && dir[0])
        snprintf(g_dir, sizeof g_dir, "%s", dir);
    else
        g_dir[0] = 0;
}

int ez2_ttf_find(char *out, size_t n)
{
    static const char *const own[] = {
        "%s/fonts/Roboto-Bold.ttf",
        "%s/../third_party/fonts/Roboto-Bold.ttf",
        "%s/third_party/fonts/Roboto-Bold.ttf",
    };
    static const char *const cands[] = {
        "/usr/share/fonts/TTF/Roboto-Bold.ttf",
        "/usr/share/fonts/roboto/Roboto-Bold.ttf",
        "/usr/share/fonts/truetype/roboto/unhinted/Roboto-Bold.ttf",
        "/usr/share/fonts/truetype/roboto/hinted/Roboto-Bold.ttf",
        "/usr/share/fonts/TTF/OpenSans-Bold.ttf",
        "/usr/share/fonts/truetype/open-sans/OpenSans-Bold.ttf",
        "/usr/share/fonts/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "C:\\Windows\\Fonts\\arialbd.ttf",
        "C:\\Windows\\Fonts\\segoeuib.ttf",
    };
    const char *env = getenv("EZ2_TITLE_FONT");
    size_t i;
    FILE *f;

    if (env && env[0] && (f = fopen(env, "rb")) != 0) {
        fclose(f);
        snprintf(out, n, "%s", env);
        return 1;
    }
    if (g_dir[0])
        for (i = 0; i < sizeof own / sizeof own[0]; i++) {
            char p[2048];
            snprintf(p, sizeof p, own[i], g_dir);
            f = fopen(p, "rb");
            if (f) {
                fclose(f);
                snprintf(out, n, "%s", p);
                return 1;
            }
        }
    for (i = 0; i < sizeof cands / sizeof cands[0]; i++) {
        f = fopen(cands[i], "rb");
        if (f) {
            fclose(f);
            snprintf(out, n, "%s", cands[i]);
            return 1;
        }
    }
    return 0;
}

int ez2_ttf_find_light(char *out, size_t n)
{
    static const char *const own[] = {
        "%s/fonts/FiraSans-Light.ttf",
        "%s/../third_party/fonts/FiraSans-Light.ttf",
        "%s/third_party/fonts/FiraSans-Light.ttf",
    };
    static const char *const cands[] = {
        "/usr/share/fonts/TTF/FiraSans-Light.ttf",
        "/usr/share/fonts/truetype/fira/FiraSans-Light.ttf",
        "/usr/share/fonts/TTF/OpenSans-Light.ttf",
        "/usr/share/fonts/truetype/open-sans/OpenSans-Light.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-ExtraLight.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-ExtraLight.ttf",
        "C:\\Windows\\Fonts\\segoeuil.ttf",
    };
    const char *env = getenv("EZ2_LABEL_FONT");
    size_t i;
    FILE *f;

    if (env && env[0] && (f = fopen(env, "rb")) != 0) {
        fclose(f);
        snprintf(out, n, "%s", env);
        return 1;
    }
    if (g_dir[0])
        for (i = 0; i < sizeof own / sizeof own[0]; i++) {
            char p[2048];
            snprintf(p, sizeof p, own[i], g_dir);
            f = fopen(p, "rb");
            if (f) { fclose(f); snprintf(out, n, "%s", p); return 1; }
        }
    for (i = 0; i < sizeof cands / sizeof cands[0]; i++) {
        f = fopen(cands[i], "rb");
        if (f) { fclose(f); snprintf(out, n, "%s", cands[i]); return 1; }
    }
    return ez2_ttf_find(out, n);
}

int ez2_ttf_find_cjk(char *out, size_t n, int bold)
{
    static const char *const regular[] = {
        "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/noto-cjk/NotoSansCJK-Medium.ttc",
        "/usr/share/fonts/OTF/NotoSansKR-Regular.otf",
        "/usr/share/fonts/TTF/NotoSansKR-Regular.ttf",
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
        "/usr/share/fonts/TTF/NanumGothic.ttf",
        "/usr/share/fonts/nanum/NanumGothic.ttf",
        "C:\\Windows\\Fonts\\malgun.ttf",
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    };
    static const char *const bolds[] = {
        "/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/OTF/NotoSansKR-Bold.otf",
        "/usr/share/fonts/TTF/NotoSansKR-Bold.ttf",
        "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
        "/usr/share/fonts/TTF/NanumGothicBold.ttf",
        "/usr/share/fonts/nanum/NanumGothicBold.ttf",
        "C:\\Windows\\Fonts\\malgunbd.ttf",
    };
    const char *env = getenv(bold ? "EZ2_CJK_FONT_BOLD" : "EZ2_CJK_FONT");
    size_t i;
    FILE *f;

    if (env && env[0] && (f = fopen(env, "rb")) != 0) {
        fclose(f);
        snprintf(out, n, "%s", env);
        return 1;
    }
    if (g_dir[0]) {
        const char *own = bold ? "%s/fonts/cjk-bold.ttf" : "%s/fonts/cjk.ttf";
        char p[2048];
        snprintf(p, sizeof p, own, g_dir);
        f = fopen(p, "rb");
        if (f) { fclose(f); snprintf(out, n, "%s", p); return 1; }
    }
    if (bold)
        for (i = 0; i < sizeof bolds / sizeof bolds[0]; i++) {
            f = fopen(bolds[i], "rb");
            if (f) { fclose(f); snprintf(out, n, "%s", bolds[i]); return 1; }
        }
    for (i = 0; i < sizeof regular / sizeof regular[0]; i++) {
        f = fopen(regular[i], "rb");
        if (f) { fclose(f); snprintf(out, n, "%s", regular[i]); return 1; }
    }
    return bold ? ez2_ttf_find(out, n) : ez2_ttf_find_light(out, n);
}

static int utf8_next(const char **s)
{
    const unsigned char *p = (const unsigned char *)*s;
    int cp, extra;

    if (*p == 0)
        return 0;
    if (*p < 0x80) { cp = *p; extra = 0; }
    else if ((*p & 0xe0) == 0xc0) { cp = *p & 0x1f; extra = 1; }
    else if ((*p & 0xf0) == 0xe0) { cp = *p & 0x0f; extra = 2; }
    else if ((*p & 0xf8) == 0xf0) { cp = *p & 0x07; extra = 3; }
    else { *s = (const char *)p + 1; return '?'; }
    p++;
    while (extra-- > 0) {
        if ((*p & 0xc0) != 0x80) { *s = (const char *)p; return '?'; }
        cp = (cp << 6) | (*p & 0x3f);
        p++;
    }
    *s = (const char *)p;
    return cp;
}

int ez2_ttf_render(const char *font_path, const char *text,
                   unsigned char *rgb, int w, int h,
                   int right_x, int baseline_y, float cap_px)
{
    return ez2_ttf_render_at(font_path, text, rgb, w, h, right_x, baseline_y, cap_px, 0);
}

int ez2_ttf_render_at(const char *font_path, const char *text,
                      unsigned char *rgb, int w, int h,
                      int right_x, int baseline_y, float cap_px, int align)
{
    return ez2_ttf_render_box(font_path, text, rgb, w, h, right_x, baseline_y, cap_px, align, 0);
}

/* THE FONT'S BYTES, KEPT. Every render read its face from disk - and the
 * CJK face is a 20 MB collection, so a Korean song title cost 16 ms where
 * a Latin one cost 2, and a select page with a few of them hitched on
 * every category switch (the owner, 2026-09-05). A handful of faces stay
 * resident once read; the port renders from at most four. */
#define EZ2_TTF_CACHE 6
static struct {
    char           path[1024];
    unsigned char *data;
    size_t         n;
} g_fonts[EZ2_TTF_CACHE];
static int g_font_count;

static unsigned char *font_bytes(const char *path, size_t *n)
{
    int i;

    for (i = 0; i < g_font_count; i++)
        if (strcmp(g_fonts[i].path, path) == 0) {
            *n = g_fonts[i].n;
            return g_fonts[i].data;
        }
    {
        unsigned char *d = ez2_file_read(path, n);

        if (!d)
            return 0;
        if (g_font_count == EZ2_TTF_CACHE) {
            free(g_fonts[0].data);
            memmove(&g_fonts[0], &g_fonts[1], sizeof g_fonts[0] * (EZ2_TTF_CACHE - 1));
            g_font_count--;
        }
        snprintf(g_fonts[g_font_count].path, sizeof g_fonts[0].path, "%s", path);
        g_fonts[g_font_count].data = d;
        g_fonts[g_font_count].n = *n;
        g_font_count++;
        return d;
    }
}

void ez2_ttf_warm(const char *font_path)
{
    char buf[1024];
    const char *hash;
    size_t n;

    if (!font_path || !font_path[0])
        return;
    hash = strrchr(font_path, '#');
    if (hash && hash[1] >= '0' && hash[1] <= '9' && (size_t)(hash - font_path) < sizeof buf) {
        memcpy(buf, font_path, (size_t)(hash - font_path));
        buf[hash - font_path] = 0;
        font_path = buf;
    }
    (void)font_bytes(font_path, &n);
}

int ez2_ttf_render_box(const char *font_path, const char *text,
                       unsigned char *rgb, int w, int h,
                       int right_x, int baseline_y, float cap_px, int align,
                       int max_width)
{
    unsigned char *data;
    size_t n;
    stbtt_fontinfo font;
    float scale, scale_x, width;
    int x0, y0, x1, y1, prev = 0;
    const char *s;
    float pen;

    char path_buf[1024];
    int index = 0;

    if (!font_path || !text || !rgb || w <= 0 || h <= 0)
        return 0;
    /* `file.ttc#2`: the third face of a collection - Noto Sans CJK keeps
     * its Japanese, Korean, Simplified and Traditional forms as faces 0..4 */
    {
        const char *hash = strrchr(font_path, '#');
        if (hash && hash[1] >= '0' && hash[1] <= '9' && (size_t)(hash - font_path) < sizeof path_buf) {
            memcpy(path_buf, font_path, (size_t)(hash - font_path));
            path_buf[hash - font_path] = 0;
            index = atoi(hash + 1);
            font_path = path_buf;
        }
    }
    data = font_bytes(font_path, &n);
    if (!data)
        return 0;
    if (index < 0 || index >= stbtt_GetNumberOfFonts(data))
        index = 0;
    if (!stbtt_InitFont(&font, data, stbtt_GetFontOffsetForIndex(data, index)))
        return 0;
    /* the scale that makes a capital `cap_px` tall */
    if (!stbtt_GetCodepointBox(&font, 'H', &x0, &y0, &x1, &y1) || y1 <= y0) {
        int asc, desc, gap;
        stbtt_GetFontVMetrics(&font, &asc, &desc, &gap);
        y0 = 0; y1 = (int)(asc * 0.72f);
    }
    scale = cap_px / (float)(y1 - y0);

    /* measure, and squeeze a long title into the plate */
    width = 0.0f;
    for (s = text; *s; ) {
        int cp = utf8_next(&s), adv, lsb;
        if (!cp) break;
        stbtt_GetCodepointHMetrics(&font, cp, &adv, &lsb);
        if (prev)
            width += stbtt_GetCodepointKernAdvance(&font, prev, cp) * scale;
        width += adv * scale;
        prev = cp;
    }
    scale_x = scale;
    if (max_width > 0) {
        /* condense: the x scale alone shrinks, the capitals stay cap_px */
        if (width > max_width && width > 0)
            scale_x = scale * max_width / width, width = (float)max_width;
    } else {
        float room = align == 0 ? right_x - 6 : align == 1 ? (float)w - 6 : (float)(w - right_x - 6);
        if (width > room && width > 0)
            scale *= room / width, width = room;
        scale_x = scale;
    }
    pen = align == 0 ? right_x - width : align == 1 ? right_x - width / 2 : (float)right_x;
    prev = 0;
    for (s = text; *s; ) {
        int cp = utf8_next(&s), adv, lsb, gx0, gy0, gx1, gy1, gw, gh, gx, gy;
        unsigned char *bmp;
        float xshift;

        if (!cp) break;
        if (prev)
            pen += stbtt_GetCodepointKernAdvance(&font, prev, cp) * scale_x;
        stbtt_GetCodepointHMetrics(&font, cp, &adv, &lsb);
        xshift = pen - (float)(int)pen;
        stbtt_GetCodepointBitmapBoxSubpixel(&font, cp, scale_x, scale, xshift, 0, &gx0, &gy0, &gx1, &gy1);
        gw = gx1 - gx0; gh = gy1 - gy0;
        if (gw > 0 && gh > 0) {
            bmp = (unsigned char *)calloc((size_t)gw * gh, 1);
            if (bmp) {
                stbtt_MakeCodepointBitmapSubpixel(&font, bmp, gw, gh, gw, scale_x, scale, xshift, 0, cp);
                for (gy = 0; gy < gh; gy++)
                    for (gx = 0; gx < gw; gx++) {
                        int px = (int)pen + gx0 + gx, py = baseline_y + gy0 + gy;
                        unsigned char v = bmp[gy * gw + gx];
                        unsigned char *p;
                        if (px < 0 || px >= w || py < 0 || py >= h || v == 0)
                            continue;
                        p = rgb + ((size_t)py * w + px) * 3;
                        if (v > p[0]) p[0] = p[1] = p[2] = v;
                    }
                free(bmp);
            }
        }
        pen += adv * scale_x;
        prev = cp;
    }
    return 1;
}

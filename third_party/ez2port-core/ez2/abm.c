/* EZ2AC `.abm` textures - decoder.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "abm.h"
#include "util.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* The BMP header layout the .abm reuses verbatim. */
#define OFF_DATASTART 0x0a
#define OFF_DIBSIZE   0x0e
#define OFF_WIDTH     0x12
#define OFF_HEIGHT    0x16
#define OFF_PLANES    0x1a
#define OFF_BPP       0x1c
#define ABM_HEADER    0x36    /* decoded data start; always this - no palette */

/* Per-game-version XOR masks: { dataStart, width, height, bpp }.
 * Only the low 16 bits of each field are masked in practice, but the fields
 * are read as 32-bit because that is how they are stored. */
static const unsigned int kXor[][4] = {
    { 0x56FE, 0x0831, 0x1019, 0x1120 },  /* 1 old (2nd Trax .. Endless Circulation) */
    { 0x45AE, 0x9AF1, 0x1D1B, 0x67BE },  /* 2 Evolve */
    { 0x85BE, 0x96EC, 0xFDEB, 0x67AE },  /* 3 Night Traveler */
    { 0x95AB, 0x45BB, 0xAE12, 0x78EF },  /* 4 Time Traveler */
    { 0x23FF, 0xBDC9, 0x1F01, 0xA97F },  /* 5 Final */
    { 0x109A, 0xCFA1, 0x51AE, 0xB18F }   /* 6 Final EX  <- our target */
};
#define ABM_VERSIONS ((int)(sizeof kXor / sizeof kXor[0]))

static const char *const kVersionName[ABM_VERSIONS] = {
    "old", "Evolve", "Night Traveler", "Time Traveler", "Final", "Final EX"
};

const char *ez2_abm_version_name(int version)
{
    if (version < 1 || version > ABM_VERSIONS)
        return "?";
    return kVersionName[version - 1];
}

const char *ez2_abm_strerror(int err)
{
    switch (err) {
    case EZ2_ABM_OK:        return "ok";
    case EZ2_ABM_ERR_SHORT: return "too short to hold a header";
    case EZ2_ABM_ERR_MAGIC: return "not an .abm (no AW magic)";
    case EZ2_ABM_ERR_XOR:   return "no known XOR table decodes this header"
                                   " (unknown game version?)";
    case EZ2_ABM_ERR_BPP:   return "unsupported bits per pixel";
    case EZ2_ABM_ERR_SIZE:  return "implausible dimensions";
    case EZ2_ABM_ERR_MEM:   return "out of memory";
    case EZ2_ABM_ERR_IO:    return "I/O error";
    default:                return "unknown error";
    }
}

/* The most palette bytes a depth can have: 4 per entry, 2^bpp entries, none
 * above 8 bits. A file may carry FEWER (BMP's biClrUsed) - the palette is
 * simply whatever lies between the header and bfOffBits. */
static unsigned int palette_max(int bpp)
{
    return bpp <= 8 ? (4u << bpp) : 0u;
}

static int bpp_is_legal(unsigned int bpp)
{
    return bpp == 1 || bpp == 4 || bpp == 8 ||
           bpp == 16 || bpp == 24 || bpp == 32;
}

/* Which XOR table decodes this header, found by CONSISTENCY rather than by a
 * single magic value: the decoded depth must be a legal BMP depth AND the
 * decoded data offset must be a possible one for it. Two independent fields
 * have to agree, so a wrong table essentially cannot pass.
 *
 * The rule was twice too strict, and the game's own 62,000 assets said so:
 *   - "offset must be 0x36" rejected the paletted images (one in system/,
 *     238 in bg/): their pixels start after the palette.
 *   - "offset must be 0x36 + 4*2^bpp" rejected images with a SHORT palette -
 *     e.g. bg/5lucid/vio09.abm has 255 entries, not 256.
 * What holds generally is BMP's own rule: the palette is whatever sits
 * between the 0x36-byte header and bfOffBits. Returns 0 if no table fits. */
static int detect_version(const unsigned char *d)
{
    unsigned int enc_off = ez2_rd32(d + OFF_DATASTART);
    unsigned int enc_bpp = ez2_rd32(d + OFF_BPP);
    int v;

    for (v = 0; v < ABM_VERSIONS; v++) {
        unsigned int off = enc_off ^ kXor[v][0];
        unsigned int bpp = (enc_bpp ^ kXor[v][3]) & 0xffff;

        if (!bpp_is_legal(bpp))
            continue;
        if (off < ABM_HEADER)
            continue;
        if (off - ABM_HEADER > palette_max((int)bpp))
            continue;
        return v + 1;
    }
    return 0;
}

static int read_header(const unsigned char *d, size_t n,
                       int *w, int *h, int *bpp, int *version)
{
    const unsigned int *k;
    int v;

    if (n < ABM_HEADER)
        return EZ2_ABM_ERR_SHORT;
    if (d[0] != 'A' || d[1] != 'W')
        return EZ2_ABM_ERR_MAGIC;

    v = detect_version(d);
    if (v == 0)
        return EZ2_ABM_ERR_XOR;
    k = kXor[v - 1];

    *version = v;
    *w   = (int)(ez2_rd32(d + OFF_WIDTH)  ^ k[1]);
    *h   = (int)(ez2_rd32(d + OFF_HEIGHT) ^ k[2]);
    *bpp = (int)((ez2_rd32(d + OFF_BPP)   ^ k[3]) & 0xffff);

    if (!bpp_is_legal((unsigned int)*bpp))
        return EZ2_ABM_ERR_BPP;
    /* A BMP height may be negative (top-down). Bound both to something sane:
     * the largest asset in this game is a 1024x1024 atlas. */
    if (*w <= 0 || *w > 8192 || *h == 0 || *h < -8192 || *h > 8192)
        return EZ2_ABM_ERR_SIZE;
    return EZ2_ABM_OK;
}

int ez2_abm_probe(const unsigned char *data, size_t n,
                  int *width, int *height, int *bpp, int *version)
{
    int w, h, b, v;
    int rc = read_header(data, n, &w, &h, &b, &v);

    if (rc != EZ2_ABM_OK)
        return rc;
    if (width)   *width   = w;
    if (height)  *height  = h < 0 ? -h : h;
    if (bpp)     *bpp     = b;
    if (version) *version = v;
    return EZ2_ABM_OK;
}

void ez2_image_free(ez2_image *img)
{
    if (img == 0)
        return;
    free(img->rgba);
    img->rgba = 0;
    img->width = img->height = 0;
}

int ez2_abm_decode(const unsigned char *data, size_t n, ez2_image *img)
{
    int w, h, bpp, version, top_down, rows;
    size_t row_bytes, need, avail;
    const unsigned char *px, *palette;
    unsigned char *out;
    int pal_entries = 0;
    int y, x, first_a = -1, varying = 0;
    int rc;

    memset(img, 0, sizeof *img);

    rc = read_header(data, n, &w, &h, &bpp, &version);
    if (rc != EZ2_ABM_OK)
        return rc;

    top_down = h < 0;
    rows = top_down ? -h : h;

    /* Pixels start at bfOffBits; the palette, if any, is what lies between the
     * header and it. */
    {
        unsigned int off = ez2_rd32(data + OFF_DATASTART) ^ kXor[version - 1][0];
        if ((size_t)off > n)
            return EZ2_ABM_ERR_SHORT;
        palette     = data + ABM_HEADER;      /* BGRX, 4 bytes per entry */
        pal_entries = (int)((off - ABM_HEADER) / 4);
        px          = data + off;
        avail       = n - off;
    }

    /* BMP rows are padded to a 4-byte boundary - but not in every .abm. 31
     * files in the game store rows packed tight (bg/5hyper/hyperman02.abm is
     * 498 px of 24-bit = 1494 bytes per row, not the 1496 BMP would use), and
     * a handful declare a paletted depth while carrying 24-bit pixels and no
     * palette at all. Both are detected the same way: from the body size,
     * which is exact and cannot be argued with.
     *
     * The declared depth is trusted first - only a depth that CANNOT be right
     * is overridden, and only when exactly one alternative fits. */
    if (bpp <= 8 && pal_entries == 0) {
        static const int kTry[] = { 24, 16, 32, 8 };
        size_t i;
        for (i = 0; i < sizeof kTry / sizeof kTry[0]; i++) {
            size_t padded = ((((size_t)w * (size_t)kTry[i]) + 31) / 32) * 4;
            size_t tight  = ((size_t)w * (size_t)kTry[i] + 7) / 8;
            if (padded * (size_t)rows == avail || tight * (size_t)rows == avail) {
                bpp = kTry[i];
                break;
            }
        }
    }

    row_bytes = (((size_t)w * (size_t)bpp + 31) / 32) * 4;
    need = row_bytes * (size_t)rows;
    if (need > avail) {
        size_t tight = ((size_t)w * (size_t)bpp + 7) / 8;
        if (tight * (size_t)rows <= avail) {
            row_bytes = tight;
            need = tight * (size_t)rows;
        }
    }

    out = (unsigned char *)malloc((size_t)w * (size_t)rows * 4);
    if (out == 0)
        return EZ2_ABM_ERR_MEM;

    /* A truncated file reads as black rather than as a crash: some assets in
     * the tree really are short (0_black.abm carries 194 bytes where 192 are
     * needed - the slack is in the other direction, but the guard is cheap and
     * a bulk sweep over 2000 files should not fall over on one bad one). */
    if (need > avail)
        memset(out, 0, (size_t)w * (size_t)rows * 4);

    for (y = 0; y < rows; y++) {
        int src_y = top_down ? y : (rows - 1 - y);
        size_t row = (size_t)src_y * row_bytes;
        unsigned char *o = out + (size_t)y * (size_t)w * 4;

        for (x = 0; x < w; x++, o += 4) {
            unsigned char r = 0, g = 0, b = 0, a = 255;

            if (bpp <= 8) {
                /* Paletted. Entries are BGRX, exactly as BMP stores them; the
                 * fourth byte is reserved and is NOT alpha. Sub-byte depths
                 * pack pixels big-endian-first within each byte. */
                unsigned idx = 0;
                size_t i;
                if (bpp == 8) {
                    i = row + (size_t)x;
                    if (i < avail) idx = px[i];
                } else {
                    int per = 8 / bpp;                 /* 8 or 2 pixels a byte */
                    int shift = (per - 1 - (x % per)) * bpp;
                    i = row + (size_t)(x / per);
                    if (i < avail)
                        idx = ((unsigned)px[i] >> shift) & ((1u << bpp) - 1u);
                }
                if ((int)idx < pal_entries) {
                    b = palette[idx * 4];
                    g = palette[idx * 4 + 1];
                    r = palette[idx * 4 + 2];
                }
            } else if (bpp == 24) {
                size_t i = row + (size_t)x * 3;
                if (i + 2 < avail) { b = px[i]; g = px[i + 1]; r = px[i + 2]; }
            } else if (bpp == 32) {
                size_t i = row + (size_t)x * 4;
                if (i + 3 < avail) {
                    b = px[i]; g = px[i + 1]; r = px[i + 2]; a = px[i + 3];
                }
                if (first_a < 0)      first_a = a;
                else if (a != first_a) varying = 1;
            } else {                      /* 16-bit RGB555 */
                size_t i = row + (size_t)x * 2;
                unsigned v = 0;
                if (i + 1 < avail)
                    v = (unsigned)px[i] | ((unsigned)px[i + 1] << 8);
                {   /* 5 bits to 8 by replication, so 31 maps to 255 exactly */
                    unsigned r5 = (v >> 10) & 31, g5 = (v >> 5) & 31, b5 = v & 31;
                    r = (unsigned char)((r5 << 3) | (r5 >> 2));
                    g = (unsigned char)((g5 << 3) | (g5 >> 2));
                    b = (unsigned char)((b5 << 3) | (b5 >> 2));
                }
            }
            o[0] = r; o[1] = g; o[2] = b; o[3] = a;
        }
    }

    /* A 32-bit image whose alpha never varies is 24-bit art padded to 32; its
     * stored alpha (usually all zero) must be ignored or the sprite vanishes.
     * Only a VARYING alpha is a real channel. */
    if (bpp == 32 && !varying) {
        size_t i, count = (size_t)w * (size_t)rows * 4;
        for (i = 3; i < count; i += 4)
            out[i] = 255;
    }

    img->width     = w;
    img->height    = rows;
    img->rgba      = out;
    img->has_alpha = (bpp == 32 && varying);
    img->version   = version;
    img->bpp       = bpp;
    return EZ2_ABM_OK;
}

/* ---- colour key --------------------------------------------------------- */

static int px_is_black(const unsigned char *p)
{ return p[0] == 0 && p[1] == 0 && p[2] == 0; }

static int px_is_white(const unsigned char *p)
{ return p[0] >= 249 && p[1] >= 249 && p[2] >= 249; }

int ez2_image_punch_key(ez2_image *img, int allow_white)
{
    int w = img->width, h = img->height;
    unsigned char *p = img->rgba;
    size_t border[8];
    int black = 0, white = 0, key_black, key_white;
    int i, x, y, match = 0, total = 0, tol, ramp;

    if (p == 0 || w < 2 || h < 2)
        return 0;

#define PX(xx, yy) ((size_t)((yy) * w + (xx)) * 4)
    border[0] = PX(0, 0);         border[1] = PX(w - 1, 0);
    border[2] = PX(0, h - 1);     border[3] = PX(w - 1, h - 1);
    border[4] = PX(w / 2, 0);     border[5] = PX(w / 2, h - 1);
    border[6] = PX(0, h / 2);     border[7] = PX(w - 1, h / 2);

    for (i = 0; i < 8; i++) {
        if (px_is_black(p + border[i]))
            black++;
        else if (px_is_white(p + border[i]))
            white++;
    }

    /* THE GAME PATH KEYS EVERY TEXTURE ON ZERO, WHATEVER ITS BORDER. The
     * matched loader @0x408d00 calls SetColorKey(DDCKEY_SRCBLT, {0, 0}) on
     * every surface and the device init @0x405f80 turns COLORKEYENABLE on
     * (../src/obj405f80.cpp:172), so an exact-black texel is dropped on the
     * cabinet wherever it sits. The border vote below used to gate the
     * black key too, and it left 7,400 of the shipped textures - 1,900 of
     * them more than 5% black, streetmix's 1p_panel.abm 73% - drawn with
     * opaque black where the cabinet shows through (2026-09-05). The vote
     * now serves only the inspection tools' white path. */
    key_black = allow_white ? (black >= 3 && black >= white) : 1;
    key_white = (allow_white && !key_black && white >= 3);
    if (!key_black && !key_white)
        return 0;

    /* A near-uniform WHITE image is a solid fill, not a cutout - keying it
     * would erase the whole texture. That exception is for the inspection
     * tools' white path ONLY: the game keys every texture on zero with no
     * exception (loadTexture @0x408d00), so a black fill IS transparent on
     * the cabinet. The exception used to apply to the black key too, and it
     * sampled every second row - so `o_bottom_line.abm` (512x8, one grey
     * line on row 3, everything else black) read as 100% black, was left
     * unkeyed, and the mode select's layout painted it ONE/ZERO as a black
     * bar under the category labels (the owner, 2026-09-03). */
    if (key_white) {
        for (y = 0; y < h; y++) {
            for (x = 0; x < w; x++) {
                const unsigned char *q = p + PX(x, y);
                if (px_is_white(q))
                    match++;
                total++;
            }
        }
        if (total > 0 && match >= (total * 99) / 100)
            return 0;
    }
#undef PX

    /* THE BLACK KEY IS EXACT. DirectDraw's source colour key drops a texel
     * whose colour is IN THE KEY RANGE, and the game sets that range to
     * {0, 0}: a (1,1,1) texel is opaque on the cabinet, and the artists
     * lean on it - system\modeselect\0_black.abm is a solid (8,8,8) plate,
     * and the category masks' text is (8,8,8) on white. The old tolerance
     * (keyed up to 6, alpha ramping to 16) drew both at a fifth of their
     * opacity. The white path keeps its ramp: it is for the inspection
     * tools, not the game. */
    tol  = key_black ? 0 : 8;
    ramp = key_black ? 1 : 160;
    {
        size_t n = (size_t)w * (size_t)h * 4, k;
        for (k = 0; k < n; k += 4) {
            int d, a;
            if (key_black) {
                d = p[k] > p[k + 1] ? p[k] : p[k + 1];
                if (p[k + 2] > d) d = p[k + 2];
            } else {
                d = p[k] < p[k + 1] ? p[k] : p[k + 1];
                if (p[k + 2] < d) d = p[k + 2];
                d = 255 - d;
            }
            a = ((d - tol) * 255) / ramp;
            p[k + 3] = (unsigned char)(a <= 0 ? 0 : (a >= 255 ? 255 : a));
        }
    }
    img->has_alpha = 1;
    return 1;
}

/* ---- PNG output --------------------------------------------------------- */
/* Self-contained: the deflate stream uses STORED blocks, so no compressor and
 * no zlib. The files are large, and that is fine - they exist to be looked at,
 * not shipped. */

static unsigned int crc32_of(const unsigned char *p, size_t n, unsigned int crc)
{
    static unsigned int table[256];
    static int built;
    size_t i;

    if (!built) {
        unsigned int c;
        int k, j;
        for (k = 0; k < 256; k++) {
            c = (unsigned int)k;
            for (j = 0; j < 8; j++)
                c = (c & 1) ? 0xedb88320u ^ (c >> 1) : (c >> 1);
            table[k] = c;
        }
        built = 1;
    }
    crc ^= 0xffffffffu;
    for (i = 0; i < n; i++)
        crc = table[(crc ^ p[i]) & 0xff] ^ (crc >> 8);
    return crc ^ 0xffffffffu;
}

static void put32(unsigned char *p, unsigned int v)
{
    p[0] = (unsigned char)(v >> 24); p[1] = (unsigned char)(v >> 16);
    p[2] = (unsigned char)(v >> 8);  p[3] = (unsigned char)v;
}

static int write_chunk(FILE *f, const char *type, const unsigned char *data,
                       size_t n)
{
    unsigned char hdr[8];
    unsigned int crc;

    put32(hdr, (unsigned int)n);
    memcpy(hdr + 4, type, 4);
    if (fwrite(hdr, 1, 8, f) != 8)
        return 0;
    if (n && fwrite(data, 1, n, f) != n)
        return 0;

    crc = crc32_of((const unsigned char *)type, 4, 0);
    if (n)
        crc = crc32_of(data, n, crc);
    put32(hdr, crc);
    return fwrite(hdr, 1, 4, f) == 4;
}

static unsigned int adler32_of(const unsigned char *p, size_t n)
{
    unsigned int a = 1, b = 0;
    size_t i;
    for (i = 0; i < n; i++) {
        a = (a + p[i]) % 65521;
        b = (b + a) % 65521;
    }
    return (b << 16) | a;
}

int ez2_image_write_png(const ez2_image *img, const char *path)
{
    FILE *f;
    unsigned char ihdr[13];
    unsigned char *raw, *z;
    size_t raw_len, z_len, pos, off;
    int y, ok = 0;

    if (img->rgba == 0 || img->width <= 0 || img->height <= 0)
        return 0;

    /* Scanlines, each prefixed by filter type 0 (none). */
    raw_len = ((size_t)img->width * 4 + 1) * (size_t)img->height;
    raw = (unsigned char *)malloc(raw_len);
    if (raw == 0)
        return 0;
    for (y = 0; y < img->height; y++) {
        unsigned char *dst = raw + (size_t)y * ((size_t)img->width * 4 + 1);
        dst[0] = 0;
        memcpy(dst + 1, img->rgba + (size_t)y * (size_t)img->width * 4,
               (size_t)img->width * 4);
    }

    /* zlib wrapper + stored deflate blocks, at most 65535 bytes each. */
    z_len = 2 + ((raw_len + 65534) / 65535) * 5 + raw_len + 4;
    z = (unsigned char *)malloc(z_len);
    if (z == 0) { free(raw); return 0; }

    z[0] = 0x78; z[1] = 0x01;      /* CM=deflate, no preset dict, fastest */
    pos = 2;
    for (off = 0; off < raw_len; ) {
        size_t chunk = raw_len - off;
        int last;
        if (chunk > 65535)
            chunk = 65535;
        last = (off + chunk == raw_len);
        z[pos++] = (unsigned char)(last ? 1 : 0);
        z[pos++] = (unsigned char)(chunk & 0xff);
        z[pos++] = (unsigned char)(chunk >> 8);
        z[pos++] = (unsigned char)(~chunk & 0xff);
        z[pos++] = (unsigned char)((~chunk >> 8) & 0xff);
        memcpy(z + pos, raw + off, chunk);
        pos += chunk;
        off += chunk;
    }
    put32(z + pos, adler32_of(raw, raw_len));
    pos += 4;

    f = fopen(path, "wb");
    if (f == 0) { free(raw); free(z); return 0; }

    put32(ihdr, (unsigned int)img->width);
    put32(ihdr + 4, (unsigned int)img->height);
    ihdr[8]  = 8;    /* bit depth */
    ihdr[9]  = 6;    /* colour type: RGBA */
    ihdr[10] = 0;    /* deflate */
    ihdr[11] = 0;    /* adaptive filtering */
    ihdr[12] = 0;    /* no interlace */

    if (fwrite("\x89PNG\r\n\x1a\n", 1, 8, f) == 8 &&
        write_chunk(f, "IHDR", ihdr, sizeof ihdr) &&
        write_chunk(f, "IDAT", z, pos) &&
        write_chunk(f, "IEND", 0, 0))
        ok = 1;

    if (fclose(f) != 0)
        ok = 0;
    free(raw);
    free(z);
    return ok;
}

/* ---- writing ------------------------------------------------------------- */

static void wr32(unsigned char *p, unsigned int v)
{
    p[0] = (unsigned char)v; p[1] = (unsigned char)(v >> 8);
    p[2] = (unsigned char)(v >> 16); p[3] = (unsigned char)(v >> 24);
}

int ez2_abm_write(const char *path, const unsigned char *rgb, int w, int h)
{
    const unsigned int *k = kXor[5];              /* Final EX */
    unsigned char hdr[ABM_HEADER];
    size_t row = (size_t)w * 3, pad = (4 - row % 4) % 4;
    unsigned char *line;
    FILE *f;
    int y, x;

    if (path == 0 || rgb == 0 || w <= 0 || h <= 0)
        return 0;
    f = fopen(path, "wb");
    if (f == 0)
        return 0;
    line = (unsigned char *)malloc(row + pad);
    if (line == 0) { fclose(f); return 0; }
    memset(hdr, 0, sizeof hdr);
    hdr[0] = 'A'; hdr[1] = 'W';
    wr32(hdr + 2, (unsigned int)(ABM_HEADER + (row + pad) * (size_t)h));
    wr32(hdr + OFF_DATASTART, ABM_HEADER ^ k[0]);
    wr32(hdr + OFF_DIBSIZE, 40);
    wr32(hdr + OFF_WIDTH,  (unsigned int)w ^ k[1]);
    wr32(hdr + OFF_HEIGHT, (unsigned int)h ^ k[2]);
    hdr[OFF_PLANES] = 1;
    wr32(hdr + OFF_BPP, 24u ^ k[3]);
    wr32(hdr + 0x22, (unsigned int)((row + pad) * (size_t)h));
    fwrite(hdr, 1, sizeof hdr, f);
    memset(line + row, 0, pad);
    for (y = h - 1; y >= 0; y--) {
        const unsigned char *src = rgb + (size_t)y * row;
        for (x = 0; x < w; x++) {
            line[x * 3 + 0] = src[x * 3 + 2];
            line[x * 3 + 1] = src[x * 3 + 1];
            line[x * 3 + 2] = src[x * 3 + 0];
        }
        fwrite(line, 1, row + pad, f);
    }
    free(line);
    return fclose(f) == 0;
}

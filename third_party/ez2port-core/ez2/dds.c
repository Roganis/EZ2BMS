/* dds.c - BC3 encode/decode and the DDS container. See dds.h.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE. */
#include "dds.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

size_t ez2_bc3_size(int w, int h)
{
    return (size_t)((w + 3) / 4) * (size_t)((h + 3) / 4) * 16;
}

/* ---- colour endpoints ------------------------------------------------- */

static unsigned to565(const float *c)
{
    int r = (int)(c[0] * 31.0f / 255.0f + 0.5f), g = (int)(c[1] * 63.0f / 255.0f + 0.5f), b = (int)(c[2] * 31.0f / 255.0f + 0.5f);
    if (r < 0) r = 0;
    if (r > 31) r = 31;
    if (g < 0) g = 0;
    if (g > 63) g = 63;
    if (b < 0) b = 0;
    if (b > 31) b = 31;
    return (unsigned)((r << 11) | (g << 5) | b);
}

static void from565(unsigned v, float *c)
{
    unsigned r = (v >> 11) & 31, g = (v >> 5) & 63, b = v & 31;
    c[0] = (float)((r << 3) | (r >> 2));
    c[1] = (float)((g << 2) | (g >> 4));
    c[2] = (float)((b << 3) | (b >> 2));
}

/* the block's 16 colours (rgb, floats) against the 4-entry palette of two
 * 565 endpoints: the index of each and the summed error */
static float fit(const float px[16][3], unsigned e0, unsigned e1, unsigned char idx[16])
{
    float p[4][3], err = 0.0f;
    int i, k;
    from565(e0, p[0]); from565(e1, p[1]);
    for (k = 0; k < 3; k++) { p[2][k] = (2 * p[0][k] + p[1][k]) / 3; p[3][k] = (p[0][k] + 2 * p[1][k]) / 3; }
    for (i = 0; i < 16; i++) {
        float best = 1e30f; int bj = 0, j;
        for (j = 0; j < 4; j++) {
            float d = 0.0f;
            for (k = 0; k < 3; k++) { float t = px[i][k] - p[j][k]; d += t * t; }
            if (d < best) { best = d; bj = j; }
        }
        idx[i] = (unsigned char)bj; err += best;
    }
    return err;
}

/* least-squares endpoints for fixed indices (the classic refinement) */
static int refine(const float px[16][3], const unsigned char idx[16], unsigned *e0, unsigned *e1)
{
    /* weights of endpoint 0 per index: 1, 0, 2/3, 1/3 */
    static const float w0[4] = { 1.0f, 0.0f, 2.0f / 3.0f, 1.0f / 3.0f };
    float a = 0, b = 0, c = 0, ax[3] = {0,0,0}, bx[3] = {0,0,0};
    float det, c0[3], c1[3];
    int i, k;
    for (i = 0; i < 16; i++) {
        float u = w0[idx[i]], v = 1.0f - u;
        a += u * u; b += u * v; c += v * v;
        for (k = 0; k < 3; k++) { ax[k] += u * px[i][k]; bx[k] += v * px[i][k]; }
    }
    det = a * c - b * b;
    if (det < 1e-6f) return 0;
    for (k = 0; k < 3; k++) {
        c0[k] = (c * ax[k] - b * bx[k]) / det;
        c1[k] = (a * bx[k] - b * ax[k]) / det;
    }
    *e0 = to565(c0); *e1 = to565(c1);
    return 1;
}

static void encode_colour(const float px[16][3], unsigned char *out)
{
    float mean[3] = {0,0,0}, dir[3], lo[3], hi[3], tmin = 1e30f, tmax = -1e30f;
    unsigned e0, e1, be0, be1;
    unsigned char idx[16], bidx[16];
    float err, best;
    int i, k, it;

    for (i = 0; i < 16; i++) for (k = 0; k < 3; k++) mean[k] += px[i][k] / 16.0f;
    /* principal axis by a few power iterations on the covariance */
    {
        float cov[3][3] = {{0,0,0},{0,0,0},{0,0,0}}, v[3] = {1, 1, 1};
        int j;
        for (i = 0; i < 16; i++)
            for (j = 0; j < 3; j++) for (k = 0; k < 3; k++)
                cov[j][k] += (px[i][j] - mean[j]) * (px[i][k] - mean[k]);
        for (it = 0; it < 8; it++) {
            float nv[3], n = 0.0f;
            for (j = 0; j < 3; j++) { nv[j] = cov[j][0] * v[0] + cov[j][1] * v[1] + cov[j][2] * v[2]; n += nv[j] * nv[j]; }
            n = (float)sqrt((double)n);
            if (n < 1e-6f) break;
            for (j = 0; j < 3; j++) v[j] = nv[j] / n;
        }
        for (k = 0; k < 3; k++) dir[k] = v[k];
    }
    for (i = 0; i < 16; i++) {
        float t = 0.0f;
        for (k = 0; k < 3; k++) t += (px[i][k] - mean[k]) * dir[k];
        if (t < tmin) tmin = t;
        if (t > tmax) tmax = t;
    }
    for (k = 0; k < 3; k++) { lo[k] = mean[k] + dir[k] * tmin; hi[k] = mean[k] + dir[k] * tmax; }
    e0 = to565(hi); e1 = to565(lo);
    best = fit(px, e0, e1, bidx); be0 = e0; be1 = e1;
    for (it = 0; it < 3; it++) {
        if (!refine(px, bidx, &e0, &e1)) break;
        err = fit(px, e0, e1, idx);
        if (err < best) { best = err; be0 = e0; be1 = e1; memcpy(bidx, idx, 16); }
        else break;
    }
    /* four-colour mode needs e0 > e1; equal endpoints are a flat block */
    if (be0 < be1) {
        unsigned t = be0; be0 = be1; be1 = t;
        for (i = 0; i < 16; i++) bidx[i] = (unsigned char)(bidx[i] ^ 1);
    } else if (be0 == be1) {
        memset(bidx, 0, 16);
    }
    out[0] = (unsigned char)be0; out[1] = (unsigned char)(be0 >> 8);
    out[2] = (unsigned char)be1; out[3] = (unsigned char)(be1 >> 8);
    for (i = 0; i < 4; i++)
        out[4 + i] = (unsigned char)(bidx[i * 4] | (bidx[i * 4 + 1] << 2) | (bidx[i * 4 + 2] << 4) | (bidx[i * 4 + 3] << 6));
}

/* ---- alpha ------------------------------------------------------------- */

static void encode_alpha(const unsigned char a[16], unsigned char *out)
{
    int lo = 255, hi = 0, i, ramp[8];
    unsigned long long bits = 0;
    for (i = 0; i < 16; i++) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; }
    /* eight-step mode: a0 > a1, the six between interpolated */
    if (hi == lo) { hi = lo < 255 ? lo + 1 : lo; lo = hi > 0 ? hi - 1 : 0; if (hi == lo) hi = 1; }
    ramp[0] = hi; ramp[1] = lo;
    for (i = 1; i <= 6; i++) ramp[i + 1] = ((7 - i) * hi + i * lo) / 7;
    out[0] = (unsigned char)hi; out[1] = (unsigned char)lo;
    for (i = 0; i < 16; i++) {
        int j, bj = 0, bd = 1 << 30;
        for (j = 0; j < 8; j++) { int d = a[i] - ramp[j]; d = d < 0 ? -d : d; if (d < bd) { bd = d; bj = j; } }
        bits |= (unsigned long long)bj << (3 * i);
    }
    for (i = 0; i < 6; i++) out[2 + i] = (unsigned char)(bits >> (8 * i));
}

void ez2_bc3_encode(const unsigned char *rgba, int w, int h, unsigned char *out)
{
    int bx, by, bw = (w + 3) / 4, bh = (h + 3) / 4;
    for (by = 0; by < bh; by++)
        for (bx = 0; bx < bw; bx++) {
            float px[16][3];
            unsigned char a[16];
            int i;
            for (i = 0; i < 16; i++) {
                int x = bx * 4 + (i & 3), y = by * 4 + (i >> 2);
                const unsigned char *p;
                if (x >= w) x = w - 1;
                if (y >= h) y = h - 1;
                p = rgba + ((size_t)y * (size_t)w + (size_t)x) * 4;
                px[i][0] = p[0]; px[i][1] = p[1]; px[i][2] = p[2]; a[i] = p[3];
            }
            encode_alpha(a, out);
            encode_colour(px, out + 8);
            out += 16;
        }
}

void ez2_bc3_decode(const unsigned char *blocks, int w, int h, unsigned char *rgba)
{
    int bx, by, bw = (w + 3) / 4, bh = (h + 3) / 4;
    for (by = 0; by < bh; by++)
        for (bx = 0; bx < bw; bx++) {
            const unsigned char *b = blocks + ((size_t)by * (size_t)bw + (size_t)bx) * 16;
            int a0 = b[0], a1 = b[1], ramp[8], i;
            unsigned long long abits = 0;
            unsigned c0 = b[8] | (b[9] << 8), c1 = b[10] | (b[11] << 8);
            float p[4][3];
            int k;
            for (i = 0; i < 6; i++) abits |= (unsigned long long)b[2 + i] << (8 * i);
            ramp[0] = a0; ramp[1] = a1;
            if (a0 > a1) for (i = 1; i <= 6; i++) ramp[i + 1] = ((7 - i) * a0 + i * a1) / 7;
            else { for (i = 1; i <= 4; i++) ramp[i + 1] = ((5 - i) * a0 + i * a1) / 5; ramp[6] = 0; ramp[7] = 255; }
            from565(c0, p[0]); from565(c1, p[1]);
            if (c0 > c1) for (k = 0; k < 3; k++) { p[2][k] = (2 * p[0][k] + p[1][k]) / 3; p[3][k] = (p[0][k] + 2 * p[1][k]) / 3; }
            else for (k = 0; k < 3; k++) { p[2][k] = (p[0][k] + p[1][k]) / 2; p[3][k] = 0; }
            for (i = 0; i < 16; i++) {
                int x = bx * 4 + (i & 3), y = by * 4 + (i >> 2), ci, ai;
                unsigned char *o;
                if (x >= w || y >= h) continue;
                ci = (b[12 + (i >> 2)] >> (2 * (i & 3))) & 3;
                ai = (int)((abits >> (3 * i)) & 7);
                o = rgba + ((size_t)y * (size_t)w + (size_t)x) * 4;
                o[0] = (unsigned char)(p[ci][0] + 0.5f); o[1] = (unsigned char)(p[ci][1] + 0.5f); o[2] = (unsigned char)(p[ci][2] + 0.5f);
                o[3] = (unsigned char)ramp[ai];
            }
        }
}

unsigned char *ez2_rgba_halve(const unsigned char *rgba, int w, int h, int *ow, int *oh)
{
    int nw = (w + 1) / 2, nh = (h + 1) / 2, x, y, k;
    unsigned char *out = (unsigned char *)malloc((size_t)nw * (size_t)nh * 4);
    if (!out) return 0;
    for (y = 0; y < nh; y++)
        for (x = 0; x < nw; x++) {
            int x0 = x * 2, y0 = y * 2, x1 = x0 + 1 < w ? x0 + 1 : x0, y1 = y0 + 1 < h ? y0 + 1 : y0;
            const unsigned char *a = rgba + ((size_t)y0 * w + x0) * 4, *b = rgba + ((size_t)y0 * w + x1) * 4;
            const unsigned char *c = rgba + ((size_t)y1 * w + x0) * 4, *d = rgba + ((size_t)y1 * w + x1) * 4;
            unsigned char *o = out + ((size_t)y * nw + x) * 4;
            for (k = 0; k < 4; k++) o[k] = (unsigned char)((a[k] + b[k] + c[k] + d[k] + 2) / 4);
        }
    *ow = nw; *oh = nh;
    return out;
}

/* ---- the container ---------------------------------------------------- */

static void put32(unsigned char *p, unsigned v) { p[0] = (unsigned char)v; p[1] = (unsigned char)(v >> 8); p[2] = (unsigned char)(v >> 16); p[3] = (unsigned char)(v >> 24); }
static unsigned get32(const unsigned char *p) { return p[0] | (p[1] << 8) | (p[2] << 16) | ((unsigned)p[3] << 24); }

int ez2_dds_write(const char *path, const unsigned char *rgba, int w, int h)
{
    unsigned char hdr[128];
    unsigned char *cur = 0;
    const unsigned char *src = rgba;
    int lw = w, lh = h, mips = 0, t;
    FILE *f;

    for (t = w > h ? w : h; t > 0; t >>= 1) mips++;
    memset(hdr, 0, sizeof hdr);
    memcpy(hdr, "DDS ", 4);
    put32(hdr + 4, 124);
    put32(hdr + 8, 0x1 | 0x2 | 0x4 | 0x1000 | 0x20000 | 0x80000);  /* caps height width pixelformat mipmapcount linearsize */
    put32(hdr + 12, (unsigned)h);
    put32(hdr + 16, (unsigned)w);
    put32(hdr + 20, (unsigned)ez2_bc3_size(w, h));
    put32(hdr + 28, (unsigned)mips);
    put32(hdr + 76, 32);
    put32(hdr + 80, 0x4);                                          /* fourcc */
    memcpy(hdr + 84, "DXT5", 4);
    put32(hdr + 108, 0x1000 | 0x400000 | 0x8);                    /* texture mipmap complex */
    f = fopen(path, "wb");
    if (!f) return 0;
    if (fwrite(hdr, 1, sizeof hdr, f) != sizeof hdr) { fclose(f); return 0; }
    for (t = 0; t < mips; t++) {
        size_t n = ez2_bc3_size(lw, lh);
        unsigned char *blocks = (unsigned char *)malloc(n);
        unsigned char *next;
        int nw, nh;
        if (!blocks) { free(cur); fclose(f); return 0; }
        ez2_bc3_encode(src, lw, lh, blocks);
        if (fwrite(blocks, 1, n, f) != n) { free(blocks); free(cur); fclose(f); return 0; }
        free(blocks);
        if (t + 1 == mips) break;
        next = ez2_rgba_halve(src, lw, lh, &nw, &nh);
        free(cur);
        if (!next) { fclose(f); return 0; }
        cur = next; src = cur; lw = nw; lh = nh;
    }
    free(cur);
    fclose(f);
    return 1;
}

int ez2_dds_parse(const unsigned char *bytes, size_t n, ez2_dds *out)
{
    unsigned flags, w, h, mips;
    size_t need = 0, off;
    int t, lw, lh;

    if (!bytes || n < 128 || memcmp(bytes, "DDS ", 4) != 0 || get32(bytes + 4) != 124)
        return 0;
    if (memcmp(bytes + 84, "DXT5", 4) != 0)
        return 0;
    flags = get32(bytes + 8);
    h = get32(bytes + 12); w = get32(bytes + 16);
    mips = (flags & 0x20000) ? get32(bytes + 28) : 1;
    if (w == 0 || h == 0 || w > 16384 || h > 16384 || mips == 0 || mips > 16)
        return 0;
    lw = (int)w; lh = (int)h;
    for (t = 0; t < (int)mips; t++) {
        need += ez2_bc3_size(lw, lh);
        lw = lw > 1 ? lw / 2 : 1; lh = lh > 1 ? lh / 2 : 1;
    }
    off = 128;
    if (n < off + need)
        return 0;
    out->width = (int)w; out->height = (int)h; out->mips = (int)mips;
    out->size = need;
    out->data = (unsigned char *)malloc(need);
    if (!out->data) return 0;
    memcpy(out->data, bytes + off, need);
    return 1;
}

void ez2_dds_free(ez2_dds *d)
{
    if (d) { free(d->data); d->data = 0; d->size = 0; }
}

size_t ez2_dds_level(const ez2_dds *d, int level, int *lw, int *lh, size_t *offset)
{
    int w = d->width, h = d->height, t;
    size_t off = 0;
    for (t = 0; t < level; t++) {
        off += ez2_bc3_size(w, h);
        w = w > 1 ? w / 2 : 1; h = h > 1 ? h / 2 : 1;
    }
    if (lw) *lw = w;
    if (lh) *lh = h;
    if (offset) *offset = off;
    return ez2_bc3_size(w, h);
}

int ez2_dds_read_rgba(const char *path, unsigned char **rgba, int *w, int *h)
{
    FILE *f = fopen(path, "rb");
    unsigned char *bytes;
    long sz;
    size_t n;
    ez2_dds d;

    if (!f) return 0;
    fseek(f, 0, SEEK_END); sz = ftell(f); fseek(f, 0, SEEK_SET);
    if (sz <= 0) { fclose(f); return 0; }
    bytes = (unsigned char *)malloc((size_t)sz);
    if (!bytes) { fclose(f); return 0; }
    n = fread(bytes, 1, (size_t)sz, f);
    fclose(f);
    if (!ez2_dds_parse(bytes, n, &d)) { free(bytes); return 0; }
    free(bytes);
    *rgba = (unsigned char *)malloc((size_t)d.width * (size_t)d.height * 4);
    if (!*rgba) { ez2_dds_free(&d); return 0; }
    ez2_bc3_decode(d.data, d.width, d.height, *rgba);
    *w = d.width; *h = d.height;
    ez2_dds_free(&d);
    return 1;
}

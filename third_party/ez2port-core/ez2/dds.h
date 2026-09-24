/* dds.h - the HD pack's compressed storage: BC3 (DXT5) blocks in a DDS file.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * The pack once stored every texture as raw 32-bit .abm, four times the
 * source on each side: 123 GB (UPSCALING.md 11). BC3 is a fixed 4:1 over
 * raw RGBA, every desktop GPU decodes it in hardware, and the software
 * backend decodes it here in a few lines - so the pack now stores BC3 with
 * a full mip chain, at twice the source (the cabinet draws 640-space at
 * 2.25x, so 4x carried pixels the screen never showed).
 *
 * The encoder is the port's own: a principal-axis fit of each 4x4 block's
 * colours to two RGB565 endpoints, refined twice by least squares, and a
 * min/max alpha ramp with eight steps. Not the best BC3 there is, but no
 * third-party tool reads the pack's files, and it rounds a text plate and a
 * soft mask within a level or two of the raw copy. */
#ifndef EZ2_DDS_H
#define EZ2_DDS_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Bytes of BC3 data for a w x h level: 16 per 4x4 block, rounding up. */
size_t ez2_bc3_size(int w, int h);

/* Encode a top-down RGBA buffer as BC3 into `out` (ez2_bc3_size bytes). */
void ez2_bc3_encode(const unsigned char *rgba, int w, int h, unsigned char *out);

/* Decode BC3 blocks into a top-down RGBA buffer of w x h (caller's, w*h*4). */
void ez2_bc3_decode(const unsigned char *blocks, int w, int h, unsigned char *rgba);

/* Halve an RGBA image with a 2x2 box (odd sizes round up); malloc'd result. */
unsigned char *ez2_rgba_halve(const unsigned char *rgba, int w, int h, int *ow, int *oh);

/* A DDS file in memory: one BC3 texture with `mips` levels, level 0 first. */
typedef struct ez2_dds {
    int            width, height, mips;
    unsigned char *data;        /* all levels, packed; malloc'd */
    size_t         size;
} ez2_dds;

/* Parse a DDS file's bytes (BC3 / 'DXT5' only). The struct's data is a
 * copy; free it with ez2_dds_free. 0 on anything else. */
int  ez2_dds_parse(const unsigned char *bytes, size_t n, ez2_dds *out);
void ez2_dds_free(ez2_dds *d);

/* Bytes of level `level` (0-based) and its size; the offset into `data`. */
size_t ez2_dds_level(const ez2_dds *d, int level, int *lw, int *lh, size_t *offset);

/* Encode an RGBA image with a full mip chain and write it as a DDS file.
 * 1 on success. */
int ez2_dds_write(const char *path, const unsigned char *rgba, int w, int h);

/* Read a DDS file and decode its level 0 to RGBA (malloc'd). 1 on success. */
int ez2_dds_read_rgba(const char *path, unsigned char **rgba, int *w, int *h);

#ifdef __cplusplus
}
#endif

#endif

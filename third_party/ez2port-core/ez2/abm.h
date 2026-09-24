/* EZ2AC `.abm` textures - "AmuseWorld Bitmap".
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * An .abm IS a Windows BMP: the same 54-byte header layout and verbatim pixel
 * data, with an "AW" magic instead of "BM" and four header fields XOR-masked
 * with a per-game-version constant. Pixels are 16-bit RGB555, 24-bit BGR or
 * 32-bit BGRA.
 *
 * WHY THE PORT NEEDS THIS AT ALL: there is not one .bmp in the game's asset
 * tree. Every texture is .abm, and KGraphics::loadTexture @0x408d00
 * (../../wip/loadtexture.cpp) redirects a requested ".bmp" to the ".abm" of the
 * same name when the flag at KGraphics+0xd4 is set. Without this decoder the
 * port can load nothing.
 *
 * PROVENANCE: the format and the XOR tables are RE knowledge from the sibling
 * project ../../../EZ2REWRITE (reverse-engineering/file-formats.md and
 * src/bga/abm.lua), which credits freem's ezabm.c. The code here is written
 * from that specification, not translated from it. See ../ATTRIBUTION.md.
 */
#ifndef EZ2_ABM_H
#define EZ2_ABM_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct ez2_image {
    int            width;
    int            height;
    /* Top-down, tightly packed, 4 bytes per pixel in R,G,B,A order. */
    unsigned char *rgba;
    /* 1 when the source carried a real per-pixel alpha channel that VARIES.
     * A 32-bit .abm whose alpha is constant is 24-bit art padded to 32 and its
     * stored alpha must be ignored, or the sprite disappears. */
    int            has_alpha;
    /* Which XOR table decoded it; 1..6, 6 == Final EX (our target). */
    int            version;
    /* Source bits per pixel. SIX depths ship, not three: a sweep of all
     * 62,201 .abm in the tree gives 24 (38,635), 16 (22,481), 32 (815),
     * 8 (254), 4 (15) and 1 (a single file). The paletted ones are what
     * made the version-detection rule in abm.c admit a data offset other
     * than 0x36. */
    int            bpp;
} ez2_image;

void ez2_image_free(ez2_image *img);

/* Decode .abm bytes. Returns 0 on success, or a negative ez2_abm_err.
 * On success the caller owns img->rgba and must ez2_image_free it. */
int ez2_abm_decode(const unsigned char *data, size_t n, ez2_image *img);

/* Header fields only - no pixel decode, no allocation. Useful for bulk
 * surveys of an asset tree. */
int ez2_abm_probe(const unsigned char *data, size_t n,
                  int *width, int *height, int *bpp, int *version);

/* Apply EZ2's border colour-key transparency in place.
 *
 * The engine has no alpha channel for 16/24-bit art; sprites are cut out
 * against a black or white border, which is what KGraphics::loadTexture's
 * `SetColorKey(DDCKEY_SRCBLT, 0)` sets up. The key is decided by the majority
 * of eight border sample points, a near-uniform image is left alone (it is a
 * solid fill, not a cutout), and the alpha ramps with distance from the key so
 * edges do not alias.
 *
 * `allow_white` = 0 keys black only, AND THAT IS WHAT THE GAME DOES. The
 * matched KGraphics::loadTexture @0x408d00 keys every texture it loads on
 * ZERO (`SetColorKey(DDCKEY_SRCBLT, {0, 0})`) - there is no white key in the
 * original, no border sampling and no majority vote. The renderers therefore
 * pass 0; the white path stays for the inspection tools, which use it to show
 * how a sprite was authored. Passing 1 on a render path punches bright art
 * out of its own texture - 807 of the 34,210 shipped system textures key on
 * white and nothing else, and the title screen's lit floor panels flickering
 * black is what it looks like.
 *
 * Returns 1 if a key was applied, 0 if the image was left alone. */
int ez2_image_punch_key(ez2_image *img, int allow_white);

/* Write a PNG. Self-contained - no zlib, no libpng: the deflate stream uses
 * stored (uncompressed) blocks, which is valid and enough for inspection. */
int ez2_image_write_png(const ez2_image *img, const char *path);

/* Write 24-bit art as a Final EX .abm - a bottom-up BMP with "AW" for "BM"
 * and the four header fields under kXor[5] - which is what the port's user
 * songs (bmson.h) write for their disc, plate and eyecatch. `rgb` is
 * top-down, tightly packed R,G,B. Returns 1 on success. */
int ez2_abm_write(const char *path, const unsigned char *rgb, int w, int h);

enum ez2_abm_err {
    EZ2_ABM_OK        =  0,
    EZ2_ABM_ERR_SHORT = -1,   /* smaller than a header */
    EZ2_ABM_ERR_MAGIC = -2,   /* not "AW" */
    EZ2_ABM_ERR_XOR   = -3,   /* no known XOR table decodes the data offset */
    EZ2_ABM_ERR_BPP   = -4,   /* not 1, 4, 8, 16, 24 or 32 bits per pixel */
    EZ2_ABM_ERR_SIZE  = -5,   /* implausible dimensions */
    EZ2_ABM_ERR_MEM   = -6,
    EZ2_ABM_ERR_IO    = -7
};

const char *ez2_abm_strerror(int err);
const char *ez2_abm_version_name(int version);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_ABM_H */

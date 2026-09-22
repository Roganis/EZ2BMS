/* EZ2AC `.str` - layer animation clips.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 *
 * A `.str` is a Ragnarok-Online-derived `STRM` clip: a fixed frame rate, a
 * frame count, and a stack of layers, each owning a list of texture names and
 * a list of keyframes. The engine reads one through KGraphics::loadStr
 * @0x402de0 and hands the result to Obj402860::attach @0x4028b0.
 *
 * THREE VARIANTS SHIP IN THE GAME, all handled here. See ../../docs/PORTING.md
 * section 9 for how each was established.
 *
 *   v148     "STRM" + u32 148     10,579 files - the modern one
 *   ascii    "STRM 1.0.0 \0"           1 file
 *   legacy   no magic at all          13 files - 88-byte keyframes
 *
 * PROVENANCE: the v148 layout is RE knowledge from ../../../EZ2REWRITE
 * (reverse-engineering/file-formats.md, citing github.com/skardach/
 * ro-str-viewer). The other two were derived here. See ../ATTRIBUTION.md.
 */
#ifndef EZ2_STR_H
#define EZ2_STR_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define EZ2_STR_NAME 128

typedef enum ez2_str_variant {
    EZ2_STR_V148 = 0,     /* "STRM" + u32 148 */
    EZ2_STR_ASCII,        /* "STRM 1.0.0 \0"  */
    EZ2_STR_LEGACY        /* no magic; 88-byte keyframes */
} ez2_str_variant;

typedef struct ez2_str_key {
    int   framenum;
    int   frametype;
    float pos[2];         /* x, y in screen pixels */
    /* THE UV RECT IS [u, v, WIDTH, HEIGHT] - an offset and a SIZE, not
     * end-coordinates. The prior RE calls this the single most important
     * gotcha in the format, and it is easy to get wrong silently. */
    float uv0[4];
    /* NOT a next-frame rect, and NOT interpolated toward: the engine's
     * single-texture blit m402f70 @0x402f70 reads uv0 alone
     * (../../src/kgraphicsblit2.cpp:60). uv1 is the SECOND TEXTURE STAGE's
     * rect, used only by the two-texture blit m401d80 @0x401d80, which
     * m4038f0 @0x4038f0 dispatches to for a multi-frame layer whose stage
     * mode is 5 or more. The port drew neither stage that way and lerped
     * uv0 toward uv1 instead, which animated 22.6% of the library's
     * layers that should have been still. */
    float uv1[4];
    /* Draw-quad corners, ordered ax,bx,cx,dx then ay,by,cy,dy - all four x
     * before all four y, which is not the order a reader expects. */
    float quad[8];
    float texture_id;
    int   anim_type;
    float anim_delta;
    /* Rotation as an index into the engine's 1024-entry sin/cos tables
     * (@0x4a5228 / @0x4a6228); 1024 is a full turn, and the engine masks with
     * 0x3ff. Not radians. */
    float rotation;
    float color[4];       /* R,G,B,A in 0..255, not 0..1 */
    int   src_blend;      /* D3DRS_SRCBLEND  */
    int   dst_blend;      /* D3DRS_DESTBLEND */
    /* THE TEXTURE STAGE RECIPE, VideoBlit +0x70 `stageMode` - an INT, one of
     * KGraphics::m408130's sixteen (../../src/kgraphics2.cpp). The blit
     * dispatcher m4038f0 sends a multi-cell layer with a mode of five or
     * more to the two-texture blit; everything else draws single-stage
     * under this recipe. It was read as a float `blend` ("inter-frame
     * blend factor", from the RO prior art) and never used; the library
     * carries 0 on 99.97% of keys, with 2, 5, 13 and 15 on the rest. */
    int   stage_mode;
} ez2_str_key;

typedef struct ez2_str_layer {
    int          texture_count;
    char       (*textures)[EZ2_STR_NAME];
    int          key_count;
    ez2_str_key *keys;
} ez2_str_layer;

typedef struct ez2_str {
    ez2_str_variant variant;
    int             fps;           /* 60 in every file seen */
    int             frame_count;
    int             layer_count;
    ez2_str_layer  *layers;
} ez2_str;

/* WHICH CELL OF `la`'s TEXTURE LIST IS ON SCREEN AT `frame`, given that the
 * layer resolved `count` of them; -1 when it has none. This is the layer's
 * frame-CYCLING rule - `anim_type` / `anim_delta` - in CLOSED FORM over the
 * frame index. scene/bga.c no longer draws through it: it keeps the engine's
 * own per-row state and ticks the delta keys (every channel, not just the
 * cell), which is what the original's tween @0x403940 does. This stays as
 * the format's statement of the rule and as the tests' cross-check; the two
 * agree wherever the per-tick step is constant, which is every mode. */
int  ez2_str_cell(const ez2_str_layer *la, int frame, int count);

/* Returns 0, or a negative ez2_str_err. Caller must ez2_str_free on success. */
int  ez2_str_parse(const unsigned char *data, size_t n, ez2_str *out);
void ez2_str_free(ez2_str *s);

enum ez2_str_err {
    EZ2_STR_OK        =  0,
    EZ2_STR_ERR_SHORT = -1,
    EZ2_STR_ERR_MAGIC = -2,   /* no variant's header fits */
    EZ2_STR_ERR_COUNT = -3,   /* a count is implausible */
    EZ2_STR_ERR_TRUNC = -4,   /* the body runs past the end of the file */
    EZ2_STR_ERR_MEM   = -5
};

const char *ez2_str_strerror(int err);
const char *ez2_str_variant_name(ez2_str_variant v);

#ifdef __cplusplus
}
#endif

#endif /* EZ2_STR_H */

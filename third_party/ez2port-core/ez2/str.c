/* EZ2AC `.str` - layer animation clips.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Part of the EZ2DECOMP port. See ../LICENSE.
 */
#include "str.h"
#include "util.h"

#include <stdlib.h>
#include <string.h>

#define KEY_V148    124
#define KEY_LEGACY   88
#define HDR_V148     36   /* "STRM" + version + fps + frames + layers + 16 pad */
#define HDR_ASCII    40   /* 12-byte ASCII magic, then the same fields          */
#define HDR_LEGACY   12

const char *ez2_str_strerror(int err)
{
    switch (err) {
    case EZ2_STR_OK:        return "ok";
    case EZ2_STR_ERR_SHORT: return "too short";
    case EZ2_STR_ERR_MAGIC: return "not a .str (no variant's header fits)";
    case EZ2_STR_ERR_COUNT: return "implausible layer/texture/keyframe count";
    case EZ2_STR_ERR_TRUNC: return "body runs past the end of the file";
    case EZ2_STR_ERR_MEM:   return "out of memory";
    default:                return "unknown error";
    }
}

const char *ez2_str_variant_name(ez2_str_variant v)
{
    switch (v) {
    case EZ2_STR_V148:   return "v148";
    case EZ2_STR_ASCII:  return "ascii";
    case EZ2_STR_LEGACY: return "legacy";
    default:             return "?";
    }
}

/* Read a little-endian IEEE-754 single without type-punning through a pointer
 * of the wrong type or assuming the host's alignment. */
static float rdf(const unsigned char *p)
{
    unsigned int u = ez2_rd32(p);
    float f;
    memcpy(&f, &u, sizeof f);
    return f;
}

/* --- keyframes ----------------------------------------------------------- */

static void read_key_v148(const unsigned char *p, ez2_str_key *k)
{
    int i;
    k->framenum  = (int)ez2_rd32(p +   0);
    k->frametype = (int)ez2_rd32(p +   4);
    k->pos[0]    = rdf(p +   8);
    k->pos[1]    = rdf(p +  12);
    for (i = 0; i < 4; i++) k->uv0[i]  = rdf(p +  16 + i * 4);
    for (i = 0; i < 4; i++) k->uv1[i]  = rdf(p +  32 + i * 4);
    for (i = 0; i < 8; i++) k->quad[i] = rdf(p +  48 + i * 4);
    k->texture_id = rdf(p +  80);
    k->anim_type  = (int)ez2_rd32(p + 84);
    k->anim_delta = rdf(p +  88);
    k->rotation   = rdf(p +  92);
    for (i = 0; i < 4; i++) k->color[i] = rdf(p + 96 + i * 4);
    k->src_blend = (int)ez2_rd32(p + 112);
    k->dst_blend = (int)ez2_rd32(p + 116);
    k->stage_mode = (int)ez2_rd32(p + 120);
}

/* The legacy keyframe is 88 bytes and is NOT a truncated v148: it drops uv1,
 * textureId, animType, animDelta, rotation and the blend factor, AND it puts
 * the draw quad BEFORE the uv rect, where v148 has them the other way round.
 *
 * Derived from bg/Reggaerm/noname0004.str, whose single keyframe reads as
 * pos (320,240) - the centre of a 640x480 screen - a quad of
 * (-256,256,256,-256, -256,-256,256,256) - a centred 512x512 square - and a
 * colour of (255,255,255,255). Every field lands on a value that makes sense,
 * which no other alignment does. Confirmed structurally: all 13 legacy files
 * parse to EOF exactly at this size. */
static void read_key_legacy(const unsigned char *p, ez2_str_key *k)
{
    int i;
    memset(k, 0, sizeof *k);
    k->framenum  = (int)ez2_rd32(p + 0);
    k->frametype = (int)ez2_rd32(p + 4);
    k->pos[0]    = rdf(p + 8);
    k->pos[1]    = rdf(p + 12);
    for (i = 0; i < 8; i++) k->quad[i]  = rdf(p + 16 + i * 4);
    for (i = 0; i < 4; i++) k->uv0[i]   = rdf(p + 48 + i * 4);
    for (i = 0; i < 4; i++) k->color[i] = rdf(p + 64 + i * 4);
    k->src_blend = (int)ez2_rd32(p + 80);
    k->dst_blend = (int)ez2_rd32(p + 84);
    /* uv1 mirrors uv0 so an interpolating renderer needs no special case. */
    memcpy(k->uv1, k->uv0, sizeof k->uv1);
    k->stage_mode = 0;
}

/* --- header -------------------------------------------------------------- */

static int read_header(const unsigned char *d, size_t n, ez2_str *s,
                       size_t *body_off, int *key_size)
{
    if (n < HDR_LEGACY)
        return EZ2_STR_ERR_SHORT;

    if (n >= HDR_V148 && memcmp(d, "STRM", 4) == 0 && ez2_rd32(d + 4) == 148) {
        s->variant     = EZ2_STR_V148;
        s->fps         = (int)ez2_rd32(d + 8);
        s->frame_count = (int)ez2_rd32(d + 12);
        s->layer_count = (int)ez2_rd32(d + 16);
        *body_off      = HDR_V148;
        *key_size      = KEY_V148;
        return EZ2_STR_OK;
    }

    /* "STRM 1.0.0 \0" - a 12-byte ASCII magic in place of magic + version.
     * One file: bg/2ndjewel/765.str. */
    if (n >= HDR_ASCII && memcmp(d, "STRM 1.0.0 ", 11) == 0 && d[11] == 0) {
        s->variant     = EZ2_STR_ASCII;
        s->fps         = (int)ez2_rd32(d + 12);
        s->frame_count = (int)ez2_rd32(d + 16);
        s->layer_count = (int)ez2_rd32(d + 20);
        *body_off      = HDR_ASCII;
        *key_size      = KEY_V148;
        return EZ2_STR_OK;
    }

    /* Legacy: no magic. The header is three words, of which the first is the
     * layer count PLUS ONE and the other two are zero. The +1 is not a guess -
     * it agrees with parsing to EOF on all 13 files independently. */
    if (ez2_rd32(d + 4) == 0 && ez2_rd32(d + 8) == 0) {
        unsigned int first = ez2_rd32(d);
        if (first >= 1 && first <= 4096) {
            s->variant     = EZ2_STR_LEGACY;
            s->fps         = 60;           /* not stored; every clip is 60 */
            s->frame_count = 0;            /* not stored either */
            s->layer_count = (int)first - 1;
            *body_off      = HDR_LEGACY;
            *key_size      = KEY_LEGACY;
            return EZ2_STR_OK;
        }
    }
    return EZ2_STR_ERR_MAGIC;
}

/* --- parse --------------------------------------------------------------- */

void ez2_str_free(ez2_str *s)
{
    int i;
    if (s == 0 || s->layers == 0)
        return;
    for (i = 0; i < s->layer_count; i++) {
        free(s->layers[i].textures);
        free(s->layers[i].keys);
    }
    free(s->layers);
    s->layers = 0;
    s->layer_count = 0;
}

int ez2_str_parse(const unsigned char *data, size_t n, ez2_str *out)
{
    size_t o;
    int key_size, i, rc;

    memset(out, 0, sizeof *out);

    rc = read_header(data, n, out, &o, &key_size);
    if (rc != EZ2_STR_OK)
        return rc;

    if (out->layer_count < 0 || out->layer_count > 4096)
        return EZ2_STR_ERR_COUNT;
    if (out->layer_count == 0)
        return EZ2_STR_OK;

    out->layers = (ez2_str_layer *)calloc((size_t)out->layer_count,
                                          sizeof *out->layers);
    if (out->layers == 0)
        return EZ2_STR_ERR_MEM;

    for (i = 0; i < out->layer_count; i++) {
        ez2_str_layer *L = &out->layers[i];
        unsigned int count;
        int j;

        if (o + 4 > n) { rc = EZ2_STR_ERR_TRUNC; goto fail; }
        count = ez2_rd32(data + o);
        o += 4;
        if (count > 4096) { rc = EZ2_STR_ERR_COUNT; goto fail; }
        if (o + (size_t)count * EZ2_STR_NAME > n) { rc = EZ2_STR_ERR_TRUNC; goto fail; }

        L->texture_count = (int)count;
        if (count) {
            L->textures = (char (*)[EZ2_STR_NAME])calloc((size_t)count, EZ2_STR_NAME);
            if (L->textures == 0) { rc = EZ2_STR_ERR_MEM; goto fail; }
            for (j = 0; j < (int)count; j++) {
                memcpy(L->textures[j], data + o + (size_t)j * EZ2_STR_NAME,
                       EZ2_STR_NAME);
                L->textures[j][EZ2_STR_NAME - 1] = 0;
            }
        }
        o += (size_t)count * EZ2_STR_NAME;

        if (o + 4 > n) { rc = EZ2_STR_ERR_TRUNC; goto fail; }
        count = ez2_rd32(data + o);
        o += 4;
        if (count > 1000000u) { rc = EZ2_STR_ERR_COUNT; goto fail; }
        if (o + (size_t)count * (size_t)key_size > n) { rc = EZ2_STR_ERR_TRUNC; goto fail; }

        L->key_count = (int)count;
        if (count) {
            L->keys = (ez2_str_key *)calloc((size_t)count, sizeof *L->keys);
            if (L->keys == 0) { rc = EZ2_STR_ERR_MEM; goto fail; }
            for (j = 0; j < (int)count; j++) {
                const unsigned char *p = data + o + (size_t)j * (size_t)key_size;
                if (key_size == KEY_V148)
                    read_key_v148(p, &L->keys[j]);
                else
                    read_key_legacy(p, &L->keys[j]);
            }
        }
        o += (size_t)count * (size_t)key_size;
    }
    return EZ2_STR_OK;

fail:
    ez2_str_free(out);
    return rc;
}

/* WHICH CELL OF THE LAYER'S TEXTURE LIST IS ON SCREEN AT `frame`.
 *
 * A layer owns a LIST of textures and its keys carry three fields that say
 * how to walk it: `texture_id` (the cell), `anim_type` and `anim_delta`.
 * Reading only `texture_id` - which is what this did - freezes every
 * animated layer on cell 0, because the cell is not what the pose keys
 * move. They all say 0; the motion is in the DELTA keys, which the pose
 * scan in key_at() deliberately skips.
 *
 * Title.str is the clean example: three keys per layer, a pose at frame 0,
 * a delta at frame 0 carrying mode 3 at 0.5 cells/frame, a pose at frame
 * 300. 150 cells / 0.5 = 300 frames, exactly the clip's length.
 *
 * TRANSCRIBED FROM Obj402860::m403940 @0x403940 (../src/accessors.cpp, the
 * engine's tween refresh, matched). There a POSE key copies the whole blit -
 * cell included, no cycling - and a DELTA key accumulates, once per tick,
 * with the mode switch on the blit's +0x4c/+0x50 (this format's `anim_type`
 * and `anim_delta`). The port draws from a frame INDEX rather than ticking,
 * so each mode is evaluated in closed form over `dt` ticks; the per-tick
 * step is constant in every mode, and modes 3 and 4's per-tick wrap is an
 * exact fmod either way, so the two agree.
 *
 * Returns the cell, or -1 when the layer has none. */
int ez2_str_cell(const ez2_str_layer *la, int frame, int count)
{
    const ez2_str_key *k;
    float seed = 0.0f, f, sp;
    int i, cur = -1, dt;

    if (count <= 0)
        return -1;

    /* The key in force is the last one that has started - EITHER type, which
     * is the engine's own sequential cursor. `seed` trails the last pose,
     * because that is what a delta accumulates from. */
    for (i = 0; i < la->key_count; i++) {
        if (la->keys[i].framenum > frame)
            break;
        cur = i;
        if (la->keys[i].frametype == 0)
            seed = la->keys[i].texture_id;
    }
    if (cur < 0)
        return -1;

    k = &la->keys[cur];
    if (k->frametype == 0)
        return (int)seed;          /* a pose SNAPS the cell */

    /* The engine's own guard, and it is load-bearing: a layer that does not
     * animate carries +inf here, and @0x403940 zeroes any speed over 100000
     * before the switch. The negated compare also catches the NaN. */
    sp = k->anim_delta;
    if (!(sp <= 100000.0f))
        sp = 0.0f;

    dt = frame - k->framenum;
    if (dt < 0)
        dt = 0;
    f = seed;

    switch (k->anim_type) {
    case 1:
        /* The key's own cell added once per tick. 356 keys library-wide. */
        f = seed + (float)dt * k->texture_id;
        break;
    case 2:
        /* Play once and HOLD on the last cell. */
        f = seed + (float)dt * sp;
        if (f >= (float)count)
            f = (float)count - 1.0f;
        break;
    case 3:
        /* Loop. */
        f = seed + (float)dt * sp;
        if (f >= (float)count)
            f -= (float)(int)(f / (float)count) * (float)count;
        break;
    case 4:
        /* Reverse loop. */
        f = seed - (float)dt * sp;
        if (0.0f > f) {
            f = f - (float)(int)(f / (float)count) * (float)count;
            if (0.0f > f)
                f = (float)count + f;
        }
        break;
    case 5: {
        /* Ping-pong, over count-1 rather than count: the engine computes
         * this one from `dt` itself, so it is transcribed as it stands. */
        int per = count - 1;
        int n, q;

        if (per <= 0)
            return 0;
        n = (int)((float)dt * sp + seed);
        if (n < 0)
            n = 0;
        q = n / per;
        if (q & 1)
            n = (q + 1) * per - n;
        else
            n = n - q * per;
        return n;
    }
    default:
        f = seed;
        break;
    }

    if (f < 0.0f)
        return 0;
    if ((int)f >= count)
        return count - 1;
    return (int)f;
}
